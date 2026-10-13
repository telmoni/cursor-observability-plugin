import { describe, expect, it } from 'vitest';

import type { Line } from '../src/input';
import { cut, ended, hasWork } from '../src/turns';
import { BASE } from './helpers';

const CONVERSATION = 'c-1';
let next = 0;

function line(event: Line['hook_event_name'], ms: number, generation: string | undefined, extra: Partial<Line> = {}): Line {
  const out: Line = { id: `l-${String(next++).padStart(4, '0')}`, at: BASE + ms, hook_event_name: event, ...extra };
  if (generation !== undefined) out.generation_id = generation;
  return out;
}

const ids = (lines: readonly Line[]): string[] => lines.map((l) => l.id);

describe('a spool cut into turns', () => {
  it('gives each of the editor’s turns its generation’s lines, in the order they happened, and a session’s start or end none', () => {
    const lines = [
      line('sessionStart', 0, undefined),
      line('beforeSubmitPrompt', 1000, 'g-1'),
      line('beforeSubmitPrompt', 9000, 'g-2'),
      line('stop', 5000, 'g-1'),
      line('postToolUse', 3000, 'g-1', { tool_name: 'Read' }),
      line('stop', 12000, 'g-2'),
      line('sessionEnd', 20000, undefined),
    ];
    const { turns, loose } = cut(lines, CONVERSATION);
    expect(turns.map((turn) => [turn.id, turn.headless, turn.lines.map((l) => l.at - BASE)])).toEqual([
      ['g-1', false, [1000, 3000, 5000]],
      ['g-2', false, [9000, 12000]],
    ]);
    expect(loose.map((l) => l.hook_event_name)).toEqual(['sessionStart', 'sessionEnd']);
  });

  it('gives a turn the lines that came without its id while it ran, and never a session’s start or end', () => {
    const lines = [
      line('sessionStart', 0, CONVERSATION),
      line('beforeSubmitPrompt', 1000, 'g-1'),
      line('postToolUse', 3000, CONVERSATION, { tool_name: 'Read' }),
      line('postToolUse', 3500, undefined, { tool_name: 'Grep' }),
      line('stop', 5000, 'g-1'),
      line('sessionEnd', 20000, CONVERSATION),
    ];
    const { turns, loose } = cut(lines, CONVERSATION);
    expect(turns.map((turn) => [turn.id, turn.lines.map((l) => l.hook_event_name)])).toEqual([
      [`${CONVERSATION}@${BASE}`, ['sessionStart']],
      ['g-1', ['beforeSubmitPrompt', 'postToolUse', 'postToolUse', 'stop']],
      [`${CONVERSATION}@${BASE + 20000}`, ['sessionEnd']],
    ]);
    expect(loose).toEqual([]);
    // A session's start before the editor's turns and its end after them are no run of their own.
    expect(turns.filter(hasWork).map((turn) => turn.id)).toEqual(['g-1']);
  });

  it('gives a turn a subagent’s stop, which Cursor gives the conversation’s id, though it came after the turn’s own stop', () => {
    const lines = [
      line('sessionStart', 0, undefined),
      line('beforeSubmitPrompt', 1000, 'g-1'),
      line('postToolUse', 3000, 'g-1', { tool_name: 'Task', duration: 1500 }),
      line('stop', 4000, 'g-1', { status: 'aborted' }),
      line('subagentStop', 4002, CONVERSATION, { subagent_type: 'explore', status: 'aborted' }),
      line('beforeSubmitPrompt', 9000, 'g-2'),
      line('subagentStop', 9500, CONVERSATION, { subagent_type: 'shell' }),
      line('stop', 12000, 'g-2'),
    ];
    const { turns, loose } = cut(lines, CONVERSATION);
    expect(turns.map((turn) => [turn.id, turn.lines.map((l) => l.hook_event_name)])).toEqual([
      ['g-1', ['beforeSubmitPrompt', 'postToolUse', 'stop', 'subagentStop']],
      ['g-2', ['beforeSubmitPrompt', 'subagentStop', 'stop']],
    ]);
    expect(loose.map((l) => l.hook_event_name)).toEqual(['sessionStart']);
  });

  it('makes no run of a subagent’s stop whose turn has left the spool, sent before it came', () => {
    const lines = [
      line('subagentStop', 4002, CONVERSATION, { subagent_type: 'explore', status: 'aborted' }),
      line('beforeSubmitPrompt', 9000, 'g-2'),
    ];
    const { turns, loose } = cut(lines, CONVERSATION);
    expect(turns.map((turn) => [turn.id, turn.lines.length])).toEqual([['g-2', 1]]);
    expect(loose.map((l) => l.hook_event_name)).toEqual(['subagentStop']);
  });

  it('makes each headless session a turn of its own, though every one carries the conversation’s id', () => {
    const lines = [
      line('sessionStart', 0, CONVERSATION),
      line('postToolUse', 2000, CONVERSATION, { tool_name: 'Read' }),
      line('sessionEnd', 4000, CONVERSATION, { reason: 'completed' }),
      line('sessionStart', 60_000, CONVERSATION),
      line('sessionEnd', 64_000, CONVERSATION, { reason: 'completed' }),
    ];
    const { turns } = cut(lines, CONVERSATION);
    expect(turns.map((turn) => [turn.id, turn.headless, turn.lines.length])).toEqual([
      [`${CONVERSATION}@${BASE}`, true, 3],
      [`${CONVERSATION}@${BASE + 60_000}`, true, 2],
    ]);
    // One that answered without a tool is still a run.
    expect(turns.every(hasWork)).toBe(true);
  });

  it('ends a headless session at its end: what comes after is no part of it', () => {
    const lines = [
      line('sessionStart', 0, CONVERSATION),
      line('postToolUse', 2000, CONVERSATION, { tool_name: 'Read' }),
      line('sessionEnd', 4000, CONVERSATION, { reason: 'completed' }),
      line('subagentStop', 4500, CONVERSATION, { subagent_type: 'explore' }),
      line('postToolUse', 6000, CONVERSATION, { tool_name: 'Grep' }),
    ];
    const { turns, loose } = cut(lines, CONVERSATION);
    expect(turns.map((turn) => [turn.id, turn.lines.map((l) => l.hook_event_name)])).toEqual([
      [`${CONVERSATION}@${BASE}`, ['sessionStart', 'postToolUse', 'sessionEnd']],
      [`${CONVERSATION}@${BASE + 6000}`, ['postToolUse']],
    ]);
    expect(loose.map((l) => l.hook_event_name)).toEqual(['subagentStop']);
  });
});

describe('which turns have ended', () => {
  it('at a stop: the stopped turn, and one that went quiet before it began, but not one begun since', () => {
    const lines = [
      line('beforeSubmitPrompt', 0, 'g-1'),
      line('postToolUse', 1000, 'g-1', { tool_name: 'Read' }),
      line('beforeSubmitPrompt', 5000, 'g-2'),
      line('stop', 8000, 'g-2'),
      line('beforeSubmitPrompt', 9000, 'g-3'),
    ];
    const { turns } = cut(lines, CONVERSATION);
    expect(ended(turns, 'stop').map((turn) => turn.id)).toEqual(['g-1', 'g-2']);
  });

  it('at a session’s end: every turn begun before it, but not one of a session resumed after', () => {
    const lines = [
      line('beforeSubmitPrompt', 0, 'g-1'),
      line('sessionEnd', 3000, undefined, { reason: 'window_close' }),
      line('beforeSubmitPrompt', 4000, 'g-2'),
    ];
    const { turns } = cut(lines, CONVERSATION);
    expect(ended(turns, 'sessionEnd', BASE + 3000).map((turn) => turn.id)).toEqual(['g-1']);
  });

  it('at a stop: a headless session that has ended, though no stop came in it', () => {
    const lines = [
      line('sessionStart', 0, CONVERSATION),
      line('sessionEnd', 4000, CONVERSATION, { reason: 'completed' }),
      line('sessionStart', 9000, CONVERSATION),
    ];
    const { turns } = cut(lines, CONVERSATION);
    expect(ended(turns, 'stop').map((turn) => turn.lines.length)).toEqual([2]);
  });
});

describe('a turn’s lines', () => {
  it('are in the order they happened however they were appended, and two at one millisecond always in the same order', () => {
    const lines = [line('stop', 5000, 'g-1'), line('postToolUse', 0, 'g-1'), line('beforeSubmitPrompt', 0, 'g-1')];
    const expected = ids([lines[1]!, lines[2]!, lines[0]!]);
    expect(ids(cut(lines, CONVERSATION).turns[0]!.lines)).toEqual(expected);
    expect(ids(cut([...lines].reverse(), CONVERSATION).turns[0]!.lines)).toEqual(expected);
  });
});
