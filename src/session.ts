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
}

/** How long a copy waits for another of the same conversation to finish. */
const LOCK_WAIT_MS = 60_000;

export async function sync(input: HookInput, settings: Settings, deps: Deps): Promise<void> {
  const { apiKey } = settings;
  const locked = await withLock(settings.dir, input.conversationId, LOCK_WAIT_MS, async () => {
    if (apiKey === undefined) {
      const state = readState(settings.dir, input.conversationId);
      if (!state.warnedNoKey) {
        deps.log('no key: run telmoni-cursor-observability setup, or set TELMONI_API_KEY; nothing is sent until then');
        writeState(settings.dir, input.conversationId, { ...state, warnedNoKey: true });
      }
      return;
    }
    recover(settings.dir, input.conversationId);
    const lines = readSpool(settings.dir, input.conversationId);
    if (lines.length === 0) return;
    const state = readState(settings.dir, input.conversationId);
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
    if (due.length > 0) {
      const sender = deps.sender({ endpoint: settings.endpoint, apiKey });
      try {
        for (const turn of due) {
          // The first session's end after the turn's last line, which cut it short.
          const last = turn.lines.at(-1)!.at;
          const sessionEnd = sessionEnds.find((line) => line.at >= last);
          const record = recordOf(turn, { conversationId: input.conversationId, sessionEnd });
          if (record !== undefined && !(await sender.send(record))) break;
          state.sent.push(turn.id);
          writeState(settings.dir, input.conversationId, state);
          for (const line of turn.lines) spent.add(line.id);
        }
      } finally {
        await sender.close();
      }
    }
    await compact(settings.dir, input.conversationId, spent);
  });
  if (!locked) deps.log('busy: another copy of this conversation held the lock past its wait; the next hook sends');
}
