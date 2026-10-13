/**
 * A conversation's spool cut into turns, and which of them have ended.
 *
 * A turn is the work one prompt started: every line that carries the
 * generation id Cursor gives it. Cursor's headless CLI (`agent -p`) fires no
 * prompt, reply or `stop` hook and gives every event the conversation's own id
 * in its place, so there a turn is a session's work, from its `sessionStart`
 * to its `sessionEnd`. A session's start or end in the editor, which carries
 * no turn's id, is part of no run.
 */

import type { Line } from './input.js';

export interface Turn {
  /**
   * What names the run: Cursor's generation id or, for a headless session,
   * the conversation's id and when the session began, since every session of
   * a conversation resumed headless carries the same id.
   */
  id: string;
  /** In the order they happened. */
  lines: Line[];
  /** Whether Cursor gave the turn no id of its own. */
  headless: boolean;
}

export interface Cut {
  /** In the order they began. */
  turns: Turn[];
  /** Lines of no turn. */
  loose: Line[];
}

export function isSessionLine(line: Line): boolean {
  return line.hook_event_name === 'sessionStart' || line.hook_event_name === 'sessionEnd';
}

/** In the order they happened; two in the same millisecond in an order that never changes. */
export function byTime(a: Line, b: Line): number {
  return a.at - b.at || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

const lastOf = (turn: Turn, event: Line['hook_event_name']): Line | undefined =>
  turn.lines.findLast((line) => line.hook_event_name === event);

/** The turn's `stop`, the last where Cursor fired two. */
export function stopOf(turn: Turn): Line | undefined {
  return lastOf(turn, 'stop');
}

/** The `sessionEnd` among the turn's own lines: a headless session's end. */
export function sessionEndOf(turn: Turn): Line | undefined {
  return lastOf(turn, 'sessionEnd');
}

/** Whether the turn holds any of the agent's work, which is what makes it a run. */
export function hasWork(turn: Turn): boolean {
  if (turn.lines.some((line) => !isSessionLine(line))) return true;
  // A headless session that answered without a tool: its start and its end are all of it.
  return turn.headless && lastOf(turn, 'sessionStart') !== undefined && sessionEndOf(turn) !== undefined;
}

export function cut(lines: readonly Line[], conversationId: string): Cut {
  const sorted = [...lines].sort(byTime);
  const own = new Map<string, Line[]>();
  const rest: Line[] = [];
  for (const line of sorted) {
    const generation = line.generation_id;
    if (generation === undefined || generation === conversationId) {
      rest.push(line);
      continue;
    }
    const found = own.get(generation);
    if (found === undefined) own.set(generation, [line]);
    else found.push(line);
  }
  const turns: Turn[] = [...own].map(([id, turnLines]) => ({ id, lines: turnLines, headless: false }));
  // Each turn runs from its first line to its stop or, where none came, to
  // the session's next start or end; sorted, so a line goes to the latest
  // turn begun before it.
  const bounds = sorted.filter(isSessionLine).map((line) => line.at);
  const spans = turns
    .map((turn) => {
      const start = turn.lines[0]!.at;
      const end = stopOf(turn)?.at ?? bounds.find((at) => at > start) ?? Number.POSITIVE_INFINITY;
      return { turn, start, end };
    })
    .sort((a, b) => a.start - b.start);
  const loose: Line[] = [];
  const sessions: Line[][] = [];
  let session: Line[] | undefined;
  const closeSession = (): void => {
    if (session !== undefined && session.length > 0) sessions.push(session);
    session = undefined;
  };
  for (const line of rest) {
    if (!isSessionLine(line)) {
      // A tool's event that came without its turn's id, inside a turn: that turn's.
      const span = spans.findLast((s) => s.start <= line.at && line.at <= s.end);
      if (span !== undefined) {
        span.turn.lines.push(line);
        continue;
      }
    }
    if (line.generation_id !== conversationId) {
      loose.push(line);
      continue;
    }
    const previous = session?.at(-1);
    // A headless session never spans one of the editor's turns: a session's
    // start before a conversation's turns, and its end after, are two lines of
    // no run rather than one run around them.
    if (previous !== undefined && spans.some((s) => s.start > previous.at && s.start < line.at)) closeSession();
    if (line.hook_event_name === 'sessionStart') closeSession();
    (session ??= []).push(line);
    if (line.hook_event_name === 'sessionEnd') closeSession();
  }
  closeSession();
  for (const turn of turns) turn.lines.sort(byTime);
  for (const sessionLines of sessions) {
    turns.push({ id: `${conversationId}@${sessionLines[0]!.at}`, lines: sessionLines, headless: true });
  }
  turns.sort((a, b) => byTime(a.lines[0]!, b.lines[0]!));
  return { turns, loose };
}

/**
 * The turns that have ended, in the order they began. At `sessionEnd`, every
 * one begun before the session's end (`endedAt`), a turn begun after being a
 * session resumed; at `stop`, each turn Cursor stopped, each headless session
 * that ended, and each turn that went quiet before the last stopped one
 * began, whose own end never came.
 */
export function ended(turns: readonly Turn[], event: 'stop' | 'sessionEnd', endedAt?: number): Turn[] {
  if (event === 'sessionEnd') return turns.filter((turn) => endedAt === undefined || turn.lines[0]!.at <= endedAt);
  let latest = Number.NEGATIVE_INFINITY;
  for (const turn of turns) {
    if (stopOf(turn) !== undefined) latest = Math.max(latest, turn.lines[0]!.at);
  }
  return turns.filter(
    (turn) =>
      stopOf(turn) !== undefined || sessionEndOf(turn) !== undefined || turn.lines.at(-1)!.at < latest,
  );
}
