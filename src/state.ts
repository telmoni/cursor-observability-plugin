/**
 * What has been sent of each conversation, `<conversation_id>.json` in the plugin's folder, and the lock that keeps two
 * copies of one conversation's hook from sending the same turns at once.
 */

import { randomUUID } from 'node:crypto';
import { closeSync, fsyncSync, mkdirSync, openSync, readFileSync, readdirSync, renameSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

export interface ConversationState {
  /**
   * The turns already sent, latest last: a line of one that comes after it was sent — a background subagent's, say — is
   * dropped rather than sent as a second run under the same id.
   */
  sent: string[];
  /** Whether a missing key has been logged for this conversation, so it is logged once. */
  warnedNoKey?: boolean;
  /** Whether a key file passed over has been logged for this conversation, so it is logged once. */
  warnedKeyFile?: boolean;
  /** Whether an endpoint the SDK refuses has been logged for this conversation, so it is logged once. */
  warnedEndpoint?: boolean;
}

/** Only a turn just sent can have a line still to come. */
export const SENT_KEPT = 64;

/**
 * Marks, or unmarks, a conversation whose session's end met a turn the platform did not take: that end is its last hook,
 * so the next copy of any conversation sends what it left.
 */
export function markLeft(dir: string, conversationId: string, left: Left | undefined): void {
  const path = join(dir, `${conversationId}.left`);
  if (left !== undefined) writeFileSync(path, JSON.stringify(left), { mode: 0o600 });
  else rmSync(path, { force: true });
}

/** When a conversation's session ended, and where its key sends (`destinationOf`). */
export interface Left {
  at: number;
  destination: string;
}

/** What a conversation's session end left, or nothing where its marker cannot be read. */
export function readLeft(dir: string, conversationId: string): Left | undefined {
  try {
    const value = JSON.parse(readFileSync(join(dir, `${conversationId}.left`), 'utf8')) as Partial<Left> | null;
    return value !== null && typeof value.at === 'number' && Number.isFinite(value.at) && typeof value.destination === 'string'
      ? { at: value.at, destination: value.destination }
      : undefined;
  } catch {
    return undefined;
  }
}

/** The conversations other than `except` whose session ended with turns not taken, the longest waiting first. */
export function leftOf(dir: string, except: string): string[] {
  let names: string[] = [];
  try {
    names = readdirSync(dir);
  } catch {
    // Nothing kept yet.
  }
  const waited = (name: string): number => {
    try {
      return statSync(join(dir, name)).mtimeMs;
    } catch {
      return 0;
    }
  };
  return names
    .filter((name) => /^[A-Za-z0-9_-]{1,128}\.left$/.test(name))
    .sort((a, b) => waited(a) - waited(b) || a.localeCompare(b))
    .map((name) => name.slice(0, -'.left'.length))
    .filter((conversationId) => conversationId !== except);
}

/** The conversation's state: afresh where none was saved; one that cannot be read throws, for the copy to say so. */
export function readState(dir: string, conversationId: string): ConversationState {
  let text: string;
  try {
    text = readFileSync(join(dir, `${conversationId}.json`), 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { sent: [] };
    throw error;
  }
  const value: unknown = JSON.parse(text);
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('conversation state is not an object');
  const parsed = value as Partial<ConversationState>;
  const state: ConversationState = {
    sent: Array.isArray(parsed.sent) ? parsed.sent.filter((id): id is string => typeof id === 'string') : [],
  };
  if (parsed.warnedNoKey === true) state.warnedNoKey = true;
  if (parsed.warnedKeyFile === true) state.warnedKeyFile = true;
  if (parsed.warnedEndpoint === true) state.warnedEndpoint = true;
  return state;
}

export function writeState(dir: string, conversationId: string, state: ConversationState): void {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const path = join(dir, `${conversationId}.json`);
  const next: ConversationState = { ...state, sent: state.sent.slice(-SENT_KEPT) };
  // Synced aside, then renamed over: a copy killed, or a machine stopped, mid-write leaves the last state whole.
  // Its own, so a copy that took a stale lock in the same instant as another never writes into this one's.
  const temporary = `${path}.${process.pid}.tmp`;
  const fd = openSync(temporary, 'w', 0o600);
  try {
    writeFileSync(fd, JSON.stringify(next));
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  renameSync(temporary, path);
}

/** A lock untouched this long was left by a copy that died holding it. */
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
  staleMs = STALE_MS,
): Promise<boolean> {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const path = join(dir, `${conversationId}.lock`);
  // Written into the lock, so a copy lets go of its own and never of one another took from it as stale.
  const token = `${process.pid}:${randomUUID()}`;
  const deadline = Date.now() + waitMs;
  for (;;) {
    try {
      writeFileSync(path, token, { flag: 'wx', mode: 0o600 });
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      try {
        if (Date.now() - statSync(path).mtimeMs > staleMs) rmSync(path, { force: true });
      } catch {
        // Freed between the two calls.
      }
      if (Date.now() >= deadline) return false;
      await sleep(200);
    }
  }
  // Touched while held: a copy sending a long turn, or to a slow Telmoni, is never taken for one that died, and another never compacts the spool under it.
  const fresh = setInterval(() => {
    try {
      const now = new Date();
      utimesSync(path, now, now);
    } catch {
      // Gone: nothing left to keep fresh.
    }
  }, staleMs / 4);
  fresh.unref();
  try {
    await work();
  } finally {
    clearInterval(fresh);
    try {
      if (readFileSync(path, 'utf8') === token) rmSync(path, { force: true });
    } catch {
      // Gone already.
    }
  }
  return true;
}
