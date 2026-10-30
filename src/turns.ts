/**
 * A conversation's spool cut into turns, and which have ended: a turn is the work one prompt started, every line with
 * its generation id; headless (`agent -p`) fires no prompt, reply or `stop`, so there a turn is a session's work, start to end.
 */

import type { ClosingEvent, Line } from './input.js';

export interface Turn {
  /**
   * What names the run: Cursor's generation id or, for a headless session, the conversation's id and when the session
   * began, since every session of a conversation resumed headless carries the same id.
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

/** How far outside a `Task` call's span a subagent's stop may fall and still be that call's work: the record pairs the two by it. */
export const TASK_SLACK_MS = 2_000;

/** A subagent's stop begun before the turn it came in, under no `Task` of the turn's begun with it: a background subagent's, of a turn before. */
function lateStop(line: Line, span: { turn: Turn; start: number }): boolean {
  const begun = line.at - (line.duration_ms ?? 0);
  if (line.hook_event_name !== 'subagentStop' || begun >= span.start) return false;
  return !span.turn.lines.some((each) => each.tool_name?.toLowerCase() === 'task' && each.at - (each.duration ?? 0) <= begun + TASK_SLACK_MS);
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
  // Each turn runs from its first line to the session's next start or end, sorted so a line goes to the latest turn begun before it: a subagent's stop, under the conversation's id, can come after the turn's own.
  const bounds = sorted.filter(isSessionLine).map((line) => line.at);
  const spans = turns
    .map((turn) => {
      const start = turn.lines[0]!.at;
      return { turn, start, end: bounds.find((at) => at > start) ?? Number.POSITIVE_INFINITY };
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
      // An event that came without its turn's id, inside a turn: that turn's.
      const span = spans.findLast((s) => s.start <= line.at && line.at <= s.end);
      if (span !== undefined && !lateStop(line, span)) {
        span.turn.lines.push(line);
        continue;
      }
    }
    if (line.generation_id !== conversationId) {
      loose.push(line);
      continue;
    }
    const previous = session?.at(-1);
    // A headless session never spans one of the editor's turns: a start before them and an end after are two lines of no run, not one run around them.
    if (previous !== undefined && spans.some((s) => s.start > previous.at && s.start < line.at)) closeSession();
    if (line.hook_event_name === 'sessionStart') closeSession();
    // A subagent's stop is part of the work around it: one that opens no session's work came after its turn was sent, and is no run of its own.
    if (session === undefined && line.hook_event_name === 'subagentStop') {
      loose.push(line);
      continue;
    }
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
 * The turns that have ended, in the order they began: at `sessionEnd`, every one begun before `endedAt`, a later one
 * being a session resumed; at `stop`, each turn Cursor stopped, each headless session that ended, and each turn quiet before the last stopped one began.
 */
export function ended(turns: readonly Turn[], event: ClosingEvent, endedAt?: number): Turn[] {
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
