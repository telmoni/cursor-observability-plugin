import { Telmoni } from 'telmoni';
import type { ModelCallRecord, RunRecord, StepRecord, ToolCallRecord } from 'telmoni';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { EVENTS, type Line } from '../src/input';
import { AGENT, PROVIDER, type Context, recordOf, runIdOf, uuid5 } from '../src/record';
import { readSpool } from '../src/spool';
import { type Turn, cut, ended } from '../src/turns';
import { BASE, PLANTED, type Step, fixture, replay, tempDir } from './helpers';

let dir: { path: string; remove: () => void };

beforeEach(() => {
  dir = tempDir();
});

afterEach(() => {
  dir.remove();
});

const IDE = '7f3c2a10-5b4e-4c61-9d2a-0e8f1b2c3d4e';
const HEADLESS = '5e6f7a8b-9c0d-4e1f-8a2b-3c4d5e6f7a8b';
const at = (ms: number): number => BASE + ms;

/** The conversation's runs, every turn closed as the session's end closes them. */
function runsOf(steps: readonly Step[], conversationId: string): RunRecord[] {
  replay(steps, dir.path);
  const lines = readSpool(dir.path, conversationId);
  const { turns } = cut(lines, conversationId);
  const sessionEnds = lines.filter((line) => line.hook_event_name === 'sessionEnd');
  return ended(turns, 'sessionEnd', sessionEnds.at(-1)?.at).flatMap((turn) => {
    const context: Context = { conversationId, sessionEnd: sessionEnds.find((end) => end.at >= turn.lines.at(-1)!.at) };
    return recordOf(turn, context) ?? [];
  });
}

const tools = (run: RunRecord): ToolCallRecord[] =>
  (run.inside ?? []).filter((item): item is ToolCallRecord => item.type === 'tool_call');
const steps = (run: RunRecord): StepRecord[] => (run.inside ?? []).filter((item): item is StepRecord => item.type === 'step');
const models = (run: RunRecord): ModelCallRecord[] =>
  (run.inside ?? []).filter((item): item is ModelCallRecord => item.type === 'model_call');

describe('a turn as a run', () => {
  it('is a run of cursor in the conversation, its id the same every time it is read', () => {
    const runs = runsOf(fixture('ide'), IDE);
    expect(runs).toHaveLength(3);
    for (const run of runs) {
      expect(run.agent).toBe(AGENT);
      expect(run.sessionId).toBe(IDE);
      expect(run.runId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
      expect(Number(run.end)).toBeGreaterThanOrEqual(Number(run.start));
    }
    expect(runs.map((run) => run.runId)).toEqual([
      runIdOf(IDE, 'a1b2c3d4-0001-4a00-8000-000000000001'),
      runIdOf(IDE, 'a1b2c3d4-0002-4a00-8000-000000000002'),
      runIdOf(IDE, 'a1b2c3d4-0003-4a00-8000-000000000003'),
    ]);
    dir.remove();
    dir = tempDir();
    expect(runsOf(fixture('ide'), IDE)).toEqual(runs);
  });

  it('runs from the prompt to the stop, its tools timed by their durations, a subagent a step in place of its Task call', () => {
    const [run] = runsOf(fixture('ide'), IDE);
    expect(run!.start).toBe(at(1000));
    expect(run!.end).toBe(at(70060));
    expect(run!.errorType).toBeUndefined();
    expect(run!.cancelled).toBeUndefined();
    expect(tools(run!).map((tool) => [tool.name, Number(tool.end) - Number(tool.start), tool.errorType, tool.cancelled])).toEqual([
      ['Read', 4.125, undefined, undefined],
      ['Shell', 2500.5, undefined, undefined],
      ['Shell', 800, 'ToolError', undefined],
      ['MCP:create_issue', 1200, undefined, undefined],
    ]);
    expect(steps(run!)).toEqual([
      { type: 'step', name: 'subagent explore', start: at(62000 - 45500), end: at(62000) },
    ]);
  });

  it('has one model call spanning the turn, with the turn’s tokens as the conventions count them', () => {
    const runs = runsOf(fixture('ide'), IDE);
    for (const run of runs) {
      const [call, ...others] = models(run);
      expect(others).toEqual([]);
      expect(call!.model).toBe('claude-opus-4-7');
      expect(call!.provider).toBe(PROVIDER);
      expect([call!.start, call!.end]).toEqual([run.start, run.end]);
    }
    // The stop's tokens: Cursor's input already holds the cache's reads.
    expect(models(runs[0]!)[0]!.usage).toEqual({
      inputTokens: 68340,
      outputTokens: 1502,
      cacheReadInputTokens: 41216,
      cacheWriteInputTokens: 0,
    });
    expect(models(runs[1]!)[0]!.usage).toEqual({
      inputTokens: 1200,
      outputTokens: 30,
      cacheReadInputTokens: 0,
      cacheWriteInputTokens: 800,
    });
    // No tokens on the stop: the reply's, whose input is less than its cache's reads, so cannot hold them.
    expect(models(runs[2]!)[0]!.usage).toEqual({
      inputTokens: 2500,
      outputTokens: 20,
      cacheReadInputTokens: 2000,
      cacheWriteInputTokens: 0,
    });
  });

  it('marks a turn the person stopped cancelled, its interrupted tool too, and one that ended in error failed', () => {
    const [, stopped, failed] = runsOf(fixture('ide'), IDE);
    expect(stopped!.cancelled).toBe(true);
    expect(tools(stopped!).map((tool) => [tool.name, tool.errorType, tool.cancelled])).toEqual([
      ['Grep', undefined, undefined],
      ['Shell', undefined, true],
    ]);
    expect(failed!.errorType).toBe('AgentError');
    expect(tools(failed!).map((tool) => [tool.name, tool.errorType])).toEqual([
      ['Write', 'TimeoutError'],
      ['Read', 'PermissionDenied'],
    ]);
  });

  it('is a headless session’s work, from its start to its end, where Cursor fires no prompt or stop', () => {
    const runs = runsOf(fixture('headless'), HEADLESS);
    expect(runs).toHaveLength(1);
    const [run] = runs;
    expect(run!.runId).toBe(runIdOf(HEADLESS, `${HEADLESS}@${at(0)}`));
    expect([run!.start, run!.end]).toEqual([at(0), at(28400)]);
    expect(run!.errorType).toBeUndefined();
    expect(run!.cancelled).toBeUndefined();
    expect(tools(run!).map((tool) => [tool.name, tool.start, tool.end])).toEqual([
      ['Grep', at(12800) - 3120.25, at(12800)],
      ['Read', at(15600) - 3.104, at(15600)],
    ]);
    expect(models(run!)).toEqual([{ type: 'model_call', model: 'composer-2.5', provider: PROVIDER, start: at(0), end: at(28400) }]);
  });

  it('carries nothing of what was said: no text, no input, no path, no email', () => {
    const records = JSON.stringify([...runsOf(fixture('ide'), IDE), ...runsOf(fixture('headless'), HEADLESS)]);
    for (const planted of PLANTED) expect(records).not.toContain(planted);
    const keys = new Set<string>();
    JSON.parse(records, (key, value: unknown) => {
      if (key !== '' && Number.isNaN(Number(key))) keys.add(key);
      return value;
    });
    expect([...keys].sort()).toEqual(
      [
        'agent',
        'cacheReadInputTokens',
        'cacheWriteInputTokens',
        'cancelled',
        'end',
        'errorType',
        'inputTokens',
        'inside',
        'model',
        'name',
        'outputTokens',
        'provider',
        'runId',
        'sessionId',
        'start',
        'type',
        'usage',
      ].sort(),
    );
  });
});

describe('a turn that never said how it ended', () => {
  const line = (event: Line['hook_event_name'], ms: number, extra: Partial<Line> = {}): Line => ({
    id: `l-${event}-${ms}`,
    at: at(ms),
    hook_event_name: event,
    generation_id: 'g-1',
    model: 'composer-2.5',
    ...extra,
  });
  const turn = (lines: Line[]): Turn => ({ id: 'g-1', lines, headless: false });

  it('is cancelled where the next turn began over it, and takes the session’s end where that closed it', () => {
    const open = turn([line('beforeSubmitPrompt', 0), line('postToolUse', 900, { tool_name: 'Read', duration: 100 })]);
    expect(recordOf(open, { conversationId: 'c-1', sessionEnd: undefined })!.cancelled).toBe(true);
    const closedBy = (fields: Partial<Line>): RunRecord => {
      // The editor's session ends with no turn's id.
      const { generation_id: _none, ...sessionEnd } = line('sessionEnd', 5000, fields);
      return recordOf(open, { conversationId: 'c-1', sessionEnd })!;
    };
    expect(closedBy({ reason: 'window_close' }).cancelled).toBe(true);
    expect(closedBy({ reason: 'completed', final_status: 'completed' }).cancelled).toBeUndefined();
    expect(closedBy({ reason: 'error' }).errorType).toBe('AgentError');
    // The session's end bounds nothing of the turn's own time.
    expect(closedBy({ reason: 'window_close' }).end).toBe(at(900));
  });

  it('is no model call where a prompt alone was all there was', () => {
    const run = recordOf(turn([line('beforeSubmitPrompt', 0)]), { conversationId: 'c-1', sessionEnd: undefined })!;
    expect(run.inside).toEqual([]);
    expect(run.cancelled).toBe(true);
  });

  it('cuts a name past what ingest takes for a span’s name, rather than lose the call', () => {
    const tool = `MCP:${'a'.repeat(140)}😀😀${'a'.repeat(20)}`;
    const model = `custom-${'m'.repeat(120)}😀😀${'m'.repeat(20)}`;
    const run = recordOf(
      turn([line('beforeSubmitPrompt', 0, { model }), line('postToolUse', 900, { model, tool_name: tool, duration: 100 })]),
      { conversationId: 'c-1', sessionEnd: undefined },
    )!;
    // Ingest takes a tool's name to 145 characters and a model's to 128, counted by character: an emoji straddles each cap.
    expect(tools(run).map((call) => call.name)).toEqual([[...tool].slice(0, 145).join('')]);
    expect(models(run).map((call) => call.model)).toEqual([[...model].slice(0, 128).join('')]);
  });

  it('sends a custom model’s name as Cursor gives it, a model file’s own name for its path, and never a path', () => {
    const sent = (model: string): string =>
      models(recordOf(turn([line('beforeSubmitPrompt', 0, { model }), line('stop', 900, { model, status: 'completed' })]), { conversationId: 'c-1', sessionEnd: undefined })!)[0]!.model;
    for (const model of ['composer-2.5', 'claude-4.5-sonnet-thinking', 'qwen/qwen3-coder', 'qwen3-coder-30b.gguf']) expect(sent(model)).toBe(model);
    expect(sent('/home/someone/models/qwen3-coder-30b-q4_k_m.gguf')).toBe('qwen3-coder-30b-q4_k_m.gguf');
    expect(sent('models/x.gguf')).toBe('x.gguf');
    expect(sent('C:\\Users\\someone\\models\\x.safetensors')).toBe('x.safetensors');
    expect(sent(' /home/someone/models/x.gguf ')).toBe('x.gguf');
    for (const path of ['/home/someone/models/qwen', ' /home/someone', '~/models/x', './x', 'D:/models/x', 'file:///home/someone/m']) expect(sent(path)).toBe('unknown');
  });
});

describe('a subagent', () => {
  const line = (event: Line['hook_event_name'], ms: number, extra: Partial<Line> = {}): Line => ({
    id: `l-${event}-${ms}`,
    at: at(ms),
    hook_event_name: event,
    generation_id: 'g-1',
    model: 'composer-2.5',
    ...extra,
  });

  it('is a step in place of the Task call it ran in, but beside a background one’s, which returned as it started', () => {
    const run = recordOf(
      {
        id: 'g-1',
        headless: false,
        lines: [
          line('beforeSubmitPrompt', 0),
          line('postToolUse', 1000, { tool_name: 'Task', duration: 50 }),
          line('postToolUse', 32_000, { tool_name: 'Task', duration: 30_000 }),
          line('subagentStop', 31_990, { subagent_type: 'explore', status: 'completed', duration_ms: 29_900 }),
          line('subagentStop', 40_000, { subagent_type: 'shell', status: 'completed', duration_ms: 38_900 }),
          line('stop', 41_000, { status: 'completed' }),
        ],
      },
      { conversationId: 'c-1', sessionEnd: undefined },
    )!;
    expect(tools(run).map((call) => [call.name, call.start, call.end])).toEqual([['Task', at(950), at(1000)]]);
    expect(steps(run)).toEqual([
      { type: 'step', name: 'subagent shell', start: at(1100), end: at(40_000) },
      { type: 'step', name: 'subagent explore', start: at(2000), end: at(32_000) },
    ]);
  });
});

describe('every record', () => {
  it('is one the SDK takes, each span within its run, however the clock ran', async () => {
    // Seeded, so a failure is the same failure every time.
    let seed = 20261012;
    const random = (): number => (seed = (seed * 1_103_515_245 + 12_345) % 2 ** 31) / 2 ** 31;
    const pick = <T>(values: readonly T[]): T => values[Math.floor(random() * values.length)]!;
    const telmoni = new Telmoni(
      { apiKey: 'telmoni_test', endpoint: 'http://127.0.0.1:9' },
      {
        transport: () => Promise.resolve({ status: 200, headers: { get: () => null }, text: () => Promise.resolve('{}') }),
        warn: () => undefined,
        // The sender's unbounded queue: the records here go in with no flush between.
        processor: { maxQueueSize: Number.POSITIVE_INFINITY },
      },
    );
    let records = 0;
    try {
      for (let n = 0; n < 400; n++) {
        const lines: Line[] = Array.from({ length: 1 + Math.floor(random() * 24) }, (_, index) => {
          const line: Line = {
            id: `l-${n}-${index}`,
            // A clock that runs back and jumps: hooks' times in any order.
            at: BASE + Math.floor(random() * 120_000) - 60_000,
            hook_event_name: pick(EVENTS),
            model: 'composer-2.5',
          };
          const generation = pick(['g-1', 'g-2', 'g-3', 'c-1', undefined]);
          if (generation !== undefined) line.generation_id = generation;
          if (random() < 0.5) line.tool_name = pick(['Task', 'Shell', 'Read']);
          if (random() < 0.5) line.duration = random() * 90_000;
          if (random() < 0.5) line.duration_ms = Math.floor(random() * 90_000);
          if (random() < 0.3) line.status = pick(['completed', 'aborted', 'error']);
          if (random() < 0.3) line.input_tokens = Math.floor(random() * 1000);
          if (random() < 0.3) line.cache_read_tokens = Math.floor(random() * 2000);
          return line;
        });
        const { turns, loose } = cut(lines, 'c-1');
        // Each line once: in a turn, or in none.
        expect([...turns.flatMap((turn) => turn.lines), ...loose].map((line) => line.id).sort()).toEqual(lines.map((line) => line.id).sort());
        for (const turn of turns) {
          const context: Context = { conversationId: 'c-1', sessionEnd: undefined };
          const record = recordOf(turn, context);
          if (record === undefined) continue;
          records++;
          expect(() => telmoni.recordRun(record)).not.toThrow();
          expect(record.runId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
          expect(recordOf(turn, context)).toEqual(record);
          for (const item of record.inside ?? []) {
            expect(Number(item.end)).toBeGreaterThanOrEqual(Number(item.start));
            expect(Number(item.start)).toBeGreaterThanOrEqual(Number(record.start));
            expect(Number(item.end)).toBeLessThanOrEqual(Number(record.end));
          }
        }
      }
    } finally {
      await telmoni.shutdown();
    }
    expect(records).toBeGreaterThan(300);
  });
});

describe('a run id', () => {
  it('is a version 5 UUID as RFC 9562 derives one', () => {
    // RFC 9562's own example: the DNS namespace and "www.example.com".
    expect(uuid5('6ba7b810-9dad-11d1-80b4-00c04fd430c8', 'www.example.com')).toBe('2ed6657d-e927-568b-95e1-2665a8aea6a2');
  });

  it('is the conversation and the turn under the plugin’s own namespace, apart from Claude Code’s', () => {
    expect(runIdOf('c-1', 'g-1')).toBe(runIdOf('c-1', 'g-1'));
    expect(runIdOf('c-1', 'g-1')).not.toBe(runIdOf('c-1', 'g-2'));
    expect(runIdOf('c-1', 'g-1')).not.toBe(uuid5('843bf4bd-49bf-4cf9-8305-6eeaa16cafb3', 'c-1/g-1'));
  });

  it('never changes: a turn sent again by a later version of the plugin is the same run', () => {
    // As Python's uuid.uuid5 derives them, under the plugin's namespace.
    expect(runIdOf(IDE, 'a1b2c3d4-0001-4a00-8000-000000000001')).toBe('71cf03b7-fd74-5440-956e-e990274eed22');
    expect(runIdOf(HEADLESS, `${HEADLESS}@${at(0)}`)).toBe('c2e3a6f0-f15d-5a9d-badc-63ea0a65d2b5');
  });
});
