/**
 * What has been sent of each conversation, `<conversation_id>.json` in the
 * plugin's folder, and the lock that keeps two copies of one conversation's
 * hook from sending the same turns at once.
 */

import { closeSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

export interface ConversationState {
  /**
   * The turns already sent, latest last: a line of one that comes after it
   * was sent — a background subagent's, say — is dropped rather than sent as
   * a second run under the same id.
   */
  sent: string[];
  /** Whether a missing key has been logged for this conversation, so it is logged once. */
  warnedNoKey?: boolean;
}

/** Only a turn just sent can have a line still to come. */
const SENT_KEPT = 64;

export function readState(dir: string, conversationId: string): ConversationState {
  try {
    const parsed = JSON.parse(readFileSync(join(dir, `${conversationId}.json`), 'utf8')) as Partial<ConversationState>;
    const state: ConversationState = {
      sent: Array.isArray(parsed.sent) ? parsed.sent.filter((id): id is string => typeof id === 'string') : [],
    };
    if (parsed.warnedNoKey === true) state.warnedNoKey = true;
    return state;
  } catch {
    return { sent: [] };
  }
}

export function writeState(dir: string, conversationId: string, state: ConversationState): void {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const path = join(dir, `${conversationId}.json`);
  const next: ConversationState = { ...state, sent: state.sent.slice(-SENT_KEPT) };
  // Written aside and renamed over, so a copy killed mid-write leaves the
  // last state whole rather than half of the new one.
  writeFileSync(`${path}.tmp`, JSON.stringify(next), { mode: 0o600 });
  renameSync(`${path}.tmp`, path);
}

/** A lock older than this was left by a copy that died holding it. */
const STALE_MS = 120_000;

/**
 * Holds the conversation's lock while `work` runs, waiting up to `waitMs` for
 * a copy already holding it; false, and `work` not run, if it never comes free.
 */
export async function withLock(
  dir: string,
  conversationId: string,
  waitMs: number,
  work: () => Promise<void>,
): Promise<boolean> {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const path = join(dir, `${conversationId}.lock`);
  const deadline = Date.now() + waitMs;
  for (;;) {
    try {
      closeSync(openSync(path, 'wx', 0o600));
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      try {
        if (Date.now() - statSync(path).mtimeMs > STALE_MS) rmSync(path, { force: true });
      } catch {
        // Freed between the two calls.
      }
      if (Date.now() >= deadline) return false;
      await sleep(200);
    }
  }
  try {
    await work();
  } finally {
    rmSync(path, { force: true });
  }
  return true;
}
