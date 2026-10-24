/**
 * A conversation's spool, `<conversation_id>.jsonl` in the plugin's folder: a line per event of the turns not yet sent,
 * appended by each hook without a lock, so Cursor never waits on one, and compacted by the copy by moving it aside and appending back what it keeps.
 */

import {
  appendFileSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
} from 'node:fs';
import { join } from 'node:path';

import { type Line, isEvent } from './input.js';

/** How long a hook that opened the spool before it was moved aside may take to finish its line. */
const GRACE_MS = 100;

/** A conversation untouched this long is over, and what is left of it is deleted. */
const EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;

/** A conversation's files, named by its id: its spool, its state, its lock, and each written aside. */
const CONVERSATION_FILE = /^[A-Za-z0-9_-]{1,128}\.(?:jsonl(?:\.aside(?:\.\d+)?)?|json(?:\.(?:\d+\.)?tmp)?|lock)$/;

function spoolOf(dir: string, conversationId: string): string {
  return join(dir, `${conversationId}.jsonl`);
}

/** Its own, so two copies that took a stale lock in the same instant never move a spool over each other's aside. */
function asideOf(dir: string, conversationId: string): string {
  return `${spoolOf(dir, conversationId)}.aside.${process.pid}`;
}

/** One line, in one write, which another hook's line cannot split. */
export function append(dir: string, conversationId: string, line: Line): void {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  appendFileSync(spoolOf(dir, conversationId), `${JSON.stringify(line)}\n`, { mode: 0o600 });
}

/** Where a line begins: every line is written with its id first. */
const LINE_START = '{"id":';

function parsed(piece: string): unknown {
  try {
    return JSON.parse(piece);
  } catch {
    // Torn by a write cut short — a full disk — with the next line appended onto it: that next line is read from where it begins, the torn one not at all.
    const start = piece.lastIndexOf(LINE_START);
    if (start <= 0) return undefined;
    try {
      return JSON.parse(piece.slice(start));
    } catch {
      return undefined;
    }
  }
}

function linesIn(path: string): Line[] {
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch (error) {
    // Only a missing file holds no lines: one that cannot be read is never taken for empty, nor deleted.
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
  const lines: Line[] = [];
  const seen = new Set<string>();
  // The last piece has no newline: a line still being written, left for later.
  for (const piece of text.split('\n').slice(0, -1)) {
    if (piece.trim() === '') continue;
    const line = parsed(piece) as Partial<Line> | null | undefined;
    if (
      line === null ||
      line === undefined ||
      typeof line !== 'object' ||
      typeof line.id !== 'string' ||
      typeof line.at !== 'number' ||
      !Number.isFinite(line.at) ||
      !isEvent(line.hook_event_name) ||
      seen.has(line.id)
    ) {
      continue;
    }
    seen.add(line.id);
    lines.push(line as Line);
  }
  return lines;
}

/** The spool's lines, each once. */
export function readSpool(dir: string, conversationId: string): Line[] {
  return linesIn(spoolOf(dir, conversationId));
}

/**
 * Puts back what a copy that died while compacting had moved aside. A line it
 * had already put back is read twice and counted once.
 */
export function recover(dir: string, conversationId: string): void {
  const prefix = `${conversationId}.jsonl.aside`;
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return;
  }
  // Each copy's, and the one name a copy before this version used.
  for (const name of names.filter((each) => each === prefix || each.startsWith(`${prefix}.`))) {
    const aside = join(dir, name);
    const lines = linesIn(aside);
    if (lines.length > 0) {
      appendFileSync(spoolOf(dir, conversationId), lines.map((line) => `${JSON.stringify(line)}\n`).join(''), {
        mode: 0o600,
      });
    }
    rmSync(aside, { force: true });
  }
}

/** Takes the lines in `drop` out of the spool; the caller holds the conversation's lock. */
export async function compact(dir: string, conversationId: string, drop: ReadonlySet<string>): Promise<void> {
  if (drop.size === 0) return;
  const spool = spoolOf(dir, conversationId);
  const aside = asideOf(dir, conversationId);
  try {
    renameSync(spool, aside);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw error;
  }
  // A hook that opened the spool just before it moved writes its line into the file now aside: it is read below with the rest.
  await new Promise((resolve) => setTimeout(resolve, GRACE_MS));
  const kept = linesIn(aside).filter((line) => !drop.has(line.id));
  if (kept.length > 0) {
    appendFileSync(spool, kept.map((line) => `${JSON.stringify(line)}\n`).join(''), { mode: 0o600 });
  }
  rmSync(aside, { force: true });
}

/**
 * Deletes what conversations untouched for a week left behind: a turn whose hooks never ended it, or one Telmoni never
 * took, would otherwise stay for good. The log and what setup keeps are no conversation's.
 */
export function sweep(dir: string, now: number): void {
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of names) {
    if (!CONVERSATION_FILE.test(name)) continue;
    const path = join(dir, name);
    try {
      if (now - statSync(path).mtimeMs > EXPIRY_MS) rmSync(path, { force: true });
    } catch {
      // Gone already.
    }
  }
}
