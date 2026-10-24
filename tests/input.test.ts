import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { EVENTS, answerFor, received } from '../src/input';
import { readSpool } from '../src/spool';
import { BASE, PLANTED, fixture, replay, tempDir } from './helpers';

let dir: { path: string; remove: () => void };

beforeEach(() => {
  dir = tempDir();
});

afterEach(() => {
  dir.remove();
});

/** Every field a spool line may hold: Cursor's names for what is kept, and the line's own id and time. */
const KEPT = [
  'id',
  'at',
  'hook_event_name',
  'generation_id',
  'model',
  'model_id',
  'tool_name',
  'duration',
  'failure_type',
  'is_interrupt',
  'subagent_type',
  'duration_ms',
  'status',
  'reason',
  'final_status',
  'input_tokens',
  'output_tokens',
  'cache_read_tokens',
  'cache_write_tokens',
];

describe('what a hook keeps', () => {
  it('is the event, its turn, its model and the values a run needs, and nothing planted in the rest', () => {
    const spool = join(dir.path, 'telmoni');
    const lines = [...replay(fixture('ide'), spool), ...replay(fixture('headless'), spool)];
    expect(lines).toHaveLength(fixture('ide').length + fixture('headless').length);
    for (const line of lines) {
      for (const key of Object.keys(line)) expect(KEPT).toContain(key);
    }
    const files = readdirSync(spool);
    expect(files.sort()).toEqual(['5e6f7a8b-9c0d-4e1f-8a2b-3c4d5e6f7a8b.jsonl', '7f3c2a10-5b4e-4c61-9d2a-0e8f1b2c3d4e.jsonl']);
    for (const file of files) {
      const text = readFileSync(join(spool, file), 'utf8');
      for (const planted of PLANTED) expect(text).not.toContain(planted);
      // The spool is the person's alone.
      expect(statSync(join(spool, file)).mode & 0o777).toBe(0o600);
    }
    expect(statSync(spool).mode & 0o777).toBe(0o700);
  });

  it('keeps each kind of event as Cursor named its values', () => {
    const lines = replay(fixture('ide'), dir.path);
    const of = (event: string, index = 0) => lines.filter((line) => line.hook_event_name === event)[index]!;
    const strip = ({ id: _id, at: _at, ...rest }: Record<string, unknown>) => rest;
    expect(strip({ ...of('sessionStart') })).toEqual({
      hook_event_name: 'sessionStart',
      model: 'claude-opus-4-7-thinking-max',
      model_id: 'claude-opus-4-7',
    });
    expect(strip({ ...of('postToolUseFailure') })).toEqual({
      hook_event_name: 'postToolUseFailure',
      generation_id: 'a1b2c3d4-0001-4a00-8000-000000000001',
      model: 'claude-opus-4-7-thinking-max',
      tool_name: 'Shell',
      duration: 800,
      failure_type: 'error',
      is_interrupt: false,
    });
    // Cursor fires a subagent's hooks in its parent's conversation, with the conversation's id where the turn's would be.
    expect(strip({ ...of('subagentStop') })).toEqual({
      hook_event_name: 'subagentStop',
      generation_id: '7f3c2a10-5b4e-4c61-9d2a-0e8f1b2c3d4e',
      model: 'claude-opus-4-7-thinking-max',
      subagent_type: 'explore',
      status: 'completed',
      duration_ms: 44800,
    });
    expect(strip({ ...of('stop') })).toEqual({
      hook_event_name: 'stop',
      generation_id: 'a1b2c3d4-0001-4a00-8000-000000000001',
      model: 'claude-opus-4-7-thinking-max',
      model_id: 'claude-opus-4-7',
      status: 'completed',
      input_tokens: 68340,
      output_tokens: 1502,
      cache_read_tokens: 41216,
      cache_write_tokens: 0,
    });
    expect(strip({ ...of('sessionEnd') })).toEqual({
      hook_event_name: 'sessionEnd',
      model: 'claude-opus-4-7-thinking-max',
      reason: 'window_close',
      final_status: 'completed',
    });
    expect(of('postToolUse', 2).tool_name).toBe('MCP:create_issue');
    expect(readSpool(dir.path, '7f3c2a10-5b4e-4c61-9d2a-0e8f1b2c3d4e')).toEqual(lines);
  });

  it('keeps a value only where it is a plain name, number or flag', () => {
    const got = received(
      'postToolUseFailure',
      {
        conversation_id: 'c-1',
        generation_id: 'g-1',
        model: 'a model\nwith a second line',
        tool_name: 'Shell: rm -rf /home/person',
        duration: -5,
        failure_type: 'SENTINEL',
        is_interrupt: 'yes',
      },
      BASE,
      'line-1',
    );
    expect(got!.line).toEqual({ id: 'line-1', at: BASE, hook_event_name: 'postToolUseFailure', generation_id: 'g-1' });
  });

  it('refuses an event of no conversation, of an id that is not one, or of another event than the hook’s', () => {
    expect(received('stop', { hook_event_name: 'stop' }, BASE, 'x')).toBeUndefined();
    expect(received('stop', { conversation_id: '../../etc/passwd' }, BASE, 'x')).toBeUndefined();
    expect(received('stop', { conversation_id: 'c-1', hook_event_name: 'beforeSubmitPrompt' }, BASE, 'x')).toBeUndefined();
    expect(received('stop', ['c-1'], BASE, 'x')).toBeUndefined();
    expect(received('stop', { conversation_id: 'c-1' }, BASE, 'x')!.conversationId).toBe('c-1');
  });
});

describe('what a hook answers', () => {
  it('is leave to go on, and never a follow-up', () => {
    expect(answerFor('beforeSubmitPrompt')).toBe('{"continue":true}');
    for (const event of EVENTS.filter((e) => e !== 'beforeSubmitPrompt')) expect(answerFor(event)).toBe('{}');
    expect(answerFor('somethingNew')).toBe('{}');
    expect(answerFor(undefined)).toBe('{}');
  });
});
