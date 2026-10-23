/**
 * The detached copy's work on one conversation: the turns that have ended,
 * each sent as a run and marked sent, then their lines taken out of the
 * spool, so a turn is sent once and none is skipped.
 */

import type { RunRecord } from 'telmoni';

import { recordOf } from './record.js';
import type { Destination } from './send.js';
import type { Settings } from './settings.js';
import { compact, readSpool, recover } from './spool.js';
import { readState, withLock, writeState } from './state.js';
import { type Turn, byTime, cut, ended, hasWork } from './turns.js';

export interface HookInput {
  /** What closed the turns: Cursor's `stop`, or the session's end. */
  event: 'stop' | 'sessionEnd';
  conversationId: string;
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

export async function sync(input: HookInput, settings: Settings, deps: Deps): Promise<void> {
  const { apiKey } = settings;
  // No hook need follow the session's end: its copy outwaits a live holder, whose time only its sends bound.
  const waitMs = input.event === 'sessionEnd' ? Number.POSITIVE_INFINITY : (deps.lockWaitMs ?? LOCK_WAIT_MS);
  const locked = await withLock(settings.dir, input.conversationId, waitMs, async () => {
    const state = readState(settings.dir, input.conversationId);
    const once = (flag: 'warnedNoKey' | 'warnedEndpoint', line: string): void => {
      if (state[flag] === true) return;
      deps.log(line);
      state[flag] = true;
      writeState(settings.dir, input.conversationId, state);
    };
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
    if (lines.length === 0) return;
    const sent = new Set(state.sent);
    const { turns, loose } = cut(lines, input.conversationId);
    const sessionEnds = lines.filter((line) => line.hook_event_name === 'sessionEnd').sort(byTime);
    const closing = new Set(ended(turns, input.event, sessionEnds.at(-1)?.at));
    // Lines of no run are spent at any close; so are a sent turn's, whose late
    // line would otherwise go out as a second run under the same id.
    const spent = new Set(loose.map((line) => line.id));
    const due: Turn[] = [];
    for (const turn of turns) {
      if (sent.has(turn.id) || (closing.has(turn) && !hasWork(turn))) {
        for (const line of turn.lines) spent.add(line.id);
      } else if (closing.has(turn)) {
        due.push(turn);
      }
    }
    const destination: Destination = { endpoint: settings.endpoint, apiKey };
    for (const turn of due) {
      // The first session's end after the turn's last line, which cut it short.
      const last = turn.lines.at(-1)!.at;
      const sessionEnd = sessionEnds.find((line) => line.at >= last);
      const record = recordOf(turn, { conversationId: input.conversationId, sessionEnd });
      if (record !== undefined && !(await sendAlone(deps, destination, record, refused))) break;
      state.sent.push(turn.id);
      writeState(settings.dir, input.conversationId, state);
      for (const line of turn.lines) spent.add(line.id);
    }
    await compact(settings.dir, input.conversationId, spent);
  });
  if (!locked) deps.log("busy: another copy of this conversation held the lock past its wait; the next stop or the session's end sends what is left");
}
