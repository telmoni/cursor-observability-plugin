/**
 * The detached copy's work on one conversation: the turns that have ended, each sent as a run and marked sent, then
 * their lines taken out of the spool, so a turn is sent once and none is skipped.
 */

import type { RunRecord } from 'telmoni';

import type { ClosingEvent } from './input.js';
import { kindOf } from './log.js';
import { recordOf } from './record.js';
import type { Destination } from './send.js';
import type { Settings } from './settings.js';
import { compact, readSpool, recover } from './spool.js';
import { type ConversationState, SENT_KEPT, leftOf, markLeft, readState, withLock, writeState } from './state.js';
import { type Turn, byTime, cut, ended, hasWork } from './turns.js';

export interface HookInput {
  /** What closed the turns: Cursor's `stop`, or the session's end. */
  event: ClosingEvent;
  conversationId: string;
  /** When the closing event happened, as its hook kept it. */
  at?: number;
}

export interface Deps {
  sender: (destination: Destination) => { send(record: RunRecord): Promise<boolean>; close(): Promise<void> };
  log: (line: string) => void;
  /** How long a `stop`'s copy waits for the lock; the tests shorten it. */
  lockWaitMs?: number;
}

/** How long a `stop`'s copy waits for another copy of its conversation: the next stop, or the session's end, sends what it leaves. */
const LOCK_WAIT_MS = 60_000;

/**
 * Whether the platform took `record`, sent through a client of its own, since the SDK warns once a client of each
 * kind; not where the SDK refuses the endpoint, whose reason `refused` is handed.
 */
async function sendAlone(deps: Deps, destination: Destination, record: RunRecord, refused: (reason: string) => void): Promise<boolean> {
  let sender: ReturnType<Deps['sender']>;
  try {
    sender = deps.sender(destination);
  } catch (error) {
    // The SDK's refusal names the endpoint's host at most: never its path, its userinfo or the key.
    if (!(error instanceof TypeError)) throw error;
    refused(error.message);
    return false;
  }
  try {
    return await sender.send(record);
  } finally {
    await sender.close();
  }
}

/** What other conversations' session ends left, the longest waiting first, until one is still not taken. */
export async function sendLeft(own: string, settings: Settings, depsFor: (conversationId: string) => Deps): Promise<void> {
  for (const other of leftOf(settings.dir, own)) {
    if (!(await sync({ event: 'sessionEnd', conversationId: other }, settings, depsFor(other), 0))) return;
  }
}

/**
 * Sends the conversation's ended turns; whether every one was taken. `waitMs`, where given, is how long to wait for its
 * lock: none, for a conversation another copy sends for.
 */
export async function sync(input: HookInput, settings: Settings, deps: Deps, waitFor?: number): Promise<boolean> {
  const { apiKey } = settings;
  // No hook need follow the session's end: its copy outwaits a live holder, whose time only its sends bound.
  const waitMs = waitFor ?? (input.event === 'sessionEnd' ? Number.POSITIVE_INFINITY : (deps.lockWaitMs ?? LOCK_WAIT_MS));
  let reached = false;
  const locked = await withLock(settings.dir, input.conversationId, waitMs, async () => {
    let state: ConversationState;
    try {
      state = readState(settings.dir, input.conversationId);
    } catch (error) {
      // The spool, not the state, holds what is still to send: one unread is read as none, and written whole again.
      deps.log(`state not read (${kindOf(error)}); read as none`);
      state = { sent: [] };
      writeState(settings.dir, input.conversationId, state);
    }
    const once = (flag: 'warnedNoKey' | 'warnedKeyFile' | 'warnedEndpoint', line: string): void => {
      if (state[flag] === true) return;
      deps.log(line);
      state[flag] = true;
      writeState(settings.dir, input.conversationId, state);
    };
    // The file passed over may have named the endpoint: the key never goes to the default in its place.
    if (settings.keyFileProblem !== undefined) {
      once('warnedKeyFile', `~/.cursor/telmoni.json not used (${settings.keyFileProblem}): fix it, or move it aside and run telmoni-cursor-observability setup, or set both TELMONI_API_KEY and TELMONI_ENDPOINT; nothing is sent until then`);
      return;
    }
    if (apiKey === undefined) {
      once('warnedNoKey', 'no key: run telmoni-cursor-observability setup, or set TELMONI_API_KEY; nothing is sent until then');
      return;
    }
    const refused = (reason: string): void =>
      once(
        'warnedEndpoint',
        `endpoint refused by the SDK (${reason}): run telmoni-cursor-observability setup, or set TELMONI_ENDPOINT; nothing is sent until then`,
      );
    recover(settings.dir, input.conversationId);
    const lines = readSpool(settings.dir, input.conversationId);
    if (lines.length === 0) {
      reached = true;
      if (input.event === 'sessionEnd') markLeft(settings.dir, input.conversationId, false);
      return;
    }
    const sent = new Set(state.sent);
    const { turns, loose } = cut(lines, input.conversationId);
    const sessionEnds = lines.filter((line) => line.hook_event_name === 'sessionEnd').sort(byTime);
    // The latest end known: its line, or this copy's own event where a copy before it spent the line.
    const lastEnd = sessionEnds.at(-1)?.at;
    const endedAt = input.at === undefined || (lastEnd !== undefined && lastEnd > input.at) ? lastEnd : input.at;
    const closing = new Set(ended(turns, input.event, endedAt));
    // Lines of no run are spent at any close; so are a sent turn's, whose late line would otherwise go out as a second run under the same id.
    const spent = new Set(loose.map((line) => line.id));
    const due: Turn[] = [];
    for (const turn of turns) {
      if (sent.has(turn.id) || (closing.has(turn) && !hasWork(turn))) {
        for (const line of turn.lines) spent.add(line.id);
      } else if (closing.has(turn)) {
        due.push(turn);
      }
    }
    // Out before more is sent: a copy that died mid catch-up left turns it sent, which `sent`, keeping 64, may forget.
    if (due.length > 0 && turns.some((turn) => sent.has(turn.id))) {
      await compact(settings.dir, input.conversationId, spent);
      spent.clear();
    }
    const destination: Destination = { endpoint: settings.endpoint, apiKey };
    let since = 0;
    let kept = false;
    for (const turn of due) {
      // The first session's end after the turn's last line, which cut it short.
      const last = turn.lines.at(-1)!.at;
      const sessionEnd = sessionEnds.find((line) => line.at >= last);
      const record = recordOf(turn, { conversationId: input.conversationId, sessionEnd });
      if (record !== undefined && !(await sendAlone(deps, destination, record, refused))) {
        kept = true;
        break;
      }
      state.sent.push(turn.id);
      writeState(settings.dir, input.conversationId, state);
      for (const line of turn.lines) spent.add(line.id);
      // Out of the spool before `sent` forgets them: a copy that dies mid catch-up sends none of them again.
      if (++since >= SENT_KEPT / 2) {
        await compact(settings.dir, input.conversationId, spent);
        spent.clear();
        since = 0;
      }
    }
    await compact(settings.dir, input.conversationId, spent);
    // A session's end is the conversation's last hook: what it could not send waits on another conversation's copy.
    if (input.event === 'sessionEnd') markLeft(settings.dir, input.conversationId, kept);
    reached = !kept;
  });
  if (!locked && waitFor !== 0) deps.log("busy: another copy of this conversation held the lock past its wait; the next stop or the session's end sends what is left");
  return reached;
}
