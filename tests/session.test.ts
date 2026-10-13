import { existsSync, mkdirSync, readFileSync, readdirSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type { RunRecord } from 'telmoni';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { Line } from '../src/input';
import { runIdOf } from '../src/record';
import { type HookInput, sync } from '../src/session';
import type { Settings } from '../src/settings';
import { append, compact, readSpool, recover, sweep } from '../src/spool';
import { readState, withLock } from '../src/state';
import { BASE, type Step, fixture, replay, tempDir } from './helpers';

let dir: { path: string; remove: () => void };
let settings: Settings;
let sent: RunRecord[];
let answers: boolean[];
let logged: string[];
let ids: { next: number };

const IDE = '7f3c2a10-5b4e-4c61-9d2a-0e8f1b2c3d4e';
const HEADLESS = '5e6f7a8b-9c0d-4e1f-8a2b-3c4d5e6f7a8b';

beforeEach(() => {
  dir = tempDir();
  settings = { apiKey: 'telmoni_test', endpoint: undefined, dir: join(dir.path, 'telmoni') };
  sent = [];
  answers = [];
  logged = [];
  ids = { next: 0 };
});

afterEach(() => {
  dir.remove();
});

/** The steps up to and including the `count`th, as their hooks would have spooled them. */
function through(steps: readonly Step[], from: number, count: number): void {
  replay(steps.slice(from, count), settings.dir, BASE, ids);
}

function hook(event: HookInput['event'], conversationId: string, overrides: Partial<Settings> = {}): Promise<void> {
  return sync({ event, conversationId }, { ...settings, ...overrides }, {
    sender: () => ({
      send: (record) => {
        const ok = answers.shift() ?? true;
        if (ok) sent.push(record);
        return Promise.resolve(ok);
      },
      close: () => Promise.resolve(),
    }),
    log: (line) => void logged.push(line),
  });
}

/** Where each of the fixture's turns ends: the step after its stop. */
function stops(steps: readonly Step[]): number[] {
  return steps.flatMap((step, index) => (step.payload.hook_event_name === 'stop' ? [index + 1] : []));
}

describe('a copy', () => {
  it('sends each turn at its stop, once, and takes its lines out of the spool', async () => {
    const steps = fixture('ide');
    const [first, second, third] = stops(steps);
    through(steps, 0, first!);
    await hook('stop', IDE);
    expect(sent.map((run) => run.runId)).toEqual([runIdOf(IDE, 'a1b2c3d4-0001-4a00-8000-000000000001')]);
    // The session's start, which is no run, goes with it.
    expect(readSpool(settings.dir, IDE)).toEqual([]);
    await hook('stop', IDE);
    expect(sent).toHaveLength(1);
    through(steps, first!, second!);
    await hook('stop', IDE);
    through(steps, second!, third!);
    await hook('stop', IDE);
    expect(sent).toHaveLength(3);
    expect(new Set(sent.map((run) => run.runId)).size).toBe(3);
    expect(readState(settings.dir, IDE).sent).toEqual([
      'a1b2c3d4-0001-4a00-8000-000000000001',
      'a1b2c3d4-0002-4a00-8000-000000000002',
      'a1b2c3d4-0003-4a00-8000-000000000003',
    ]);
    through(steps, third!, steps.length);
    await hook('sessionEnd', IDE);
    expect(sent).toHaveLength(3);
    expect(existsSync(join(settings.dir, `${IDE}.jsonl`))).toBe(false);
  });

  it('leaves the turn still running to a later hook', async () => {
    const steps = fixture('ide');
    const [first] = stops(steps);
    // Inside the second turn: its prompt and a tool, no stop yet.
    through(steps, 0, first! + 2);
    await hook('stop', IDE);
    expect(sent).toHaveLength(1);
    expect(readSpool(settings.dir, IDE).map((line) => line.hook_event_name)).toEqual(['beforeSubmitPrompt', 'postToolUse']);
  });

  it('stops at a turn the platform did not take, and sends it again at the next hook', async () => {
    const steps = fixture('ide');
    const [first, second] = stops(steps);
    through(steps, 0, first!);
    answers = [false];
    await hook('stop', IDE);
    expect(sent).toEqual([]);
    expect(readSpool(settings.dir, IDE)).toHaveLength(first! - 1);
    through(steps, first!, second!);
    await hook('stop', IDE);
    expect(sent.map((run) => run.runId)).toEqual([
      runIdOf(IDE, 'a1b2c3d4-0001-4a00-8000-000000000001'),
      runIdOf(IDE, 'a1b2c3d4-0002-4a00-8000-000000000002'),
    ]);
  });

  it('drops a line that comes after its turn was sent, rather than send the turn again', async () => {
    const steps = fixture('ide');
    const [first, second] = stops(steps);
    through(steps, 0, first!);
    await hook('stop', IDE);
    // A call of the first turn, ending during the second.
    const late = { ...steps.find((step) => step.payload['tool_name'] === 'Task')!, after_ms: 101_000 };
    through(steps, first!, second! - 1);
    replay([late], settings.dir, BASE, ids);
    through(steps, second! - 1, second!);
    await hook('stop', IDE);
    expect(sent.map((run) => run.runId)).toEqual([
      runIdOf(IDE, 'a1b2c3d4-0001-4a00-8000-000000000001'),
      runIdOf(IDE, 'a1b2c3d4-0002-4a00-8000-000000000002'),
    ]);
    expect(readSpool(settings.dir, IDE)).toEqual([]);
  });

  it('never makes a run of a subagent’s stop that came after its turn was sent', async () => {
    const steps = fixture('ide');
    const [first, second] = stops(steps);
    through(steps, 0, first!);
    await hook('stop', IDE);
    // The person stopped the turn over a subagent, whose own stop came later.
    const subagentStop = steps.find((step) => step.payload.hook_event_name === 'subagentStop')!;
    replay([{ ...subagentStop, after_ms: 70_500 }], settings.dir, BASE, ids);
    through(steps, first!, second!);
    await hook('stop', IDE);
    through(steps, second!, steps.length);
    await hook('sessionEnd', IDE);
    expect(sent.map((run) => run.runId)).toEqual([
      runIdOf(IDE, 'a1b2c3d4-0001-4a00-8000-000000000001'),
      runIdOf(IDE, 'a1b2c3d4-0002-4a00-8000-000000000002'),
      runIdOf(IDE, 'a1b2c3d4-0003-4a00-8000-000000000003'),
    ]);
    expect(existsSync(join(settings.dir, `${IDE}.jsonl`))).toBe(false);
  });

  it('closes a headless session’s turn at its end, with no stop', async () => {
    replay(fixture('headless'), settings.dir, BASE, ids);
    await hook('sessionEnd', HEADLESS);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.runId).toBe(runIdOf(HEADLESS, `${HEADLESS}@${BASE}`));
    expect(existsSync(join(settings.dir, `${HEADLESS}.jsonl`))).toBe(false);
  });

  it('closes a turn the editor left open when the session ends, as cancelled', async () => {
    const steps = fixture('ide');
    const [first] = stops(steps);
    // The second turn's prompt and first tool, then the window closes.
    through(steps, 0, first! + 2);
    replay([steps.at(-1)!], settings.dir, BASE, ids);
    await hook('sessionEnd', IDE);
    expect(sent).toHaveLength(2);
    expect(sent[1]!.cancelled).toBe(true);
    expect(readSpool(settings.dir, IDE)).toEqual([]);
  });

  it('sends nothing without a key, and says so once', async () => {
    replay(fixture('ide'), settings.dir, BASE, ids);
    await hook('stop', IDE, { apiKey: undefined });
    await hook('stop', IDE, { apiKey: undefined });
    expect(sent).toEqual([]);
    expect(logged).toHaveLength(1);
    expect(logged[0]).toMatch(/^no key/);
  });
});

describe('the spool', () => {
  const lineAt = (id: string): Line => ({ id, at: BASE, hook_event_name: 'postToolUse', generation_id: 'g-1' });

  it('keeps a line a hook appended while it was compacted', async () => {
    append(settings.dir, 'c-1', lineAt('a'));
    append(settings.dir, 'c-1', lineAt('b'));
    const compacting = compact(settings.dir, 'c-1', new Set(['a']));
    // The hook that had the spool open as it moved aside, and one after.
    writeFileSync(join(settings.dir, 'c-1.jsonl.aside'), `${JSON.stringify(lineAt('c'))}\n`, { flag: 'a' });
    append(settings.dir, 'c-1', lineAt('d'));
    await compacting;
    expect(readSpool(settings.dir, 'c-1').map((line) => line.id).sort()).toEqual(['b', 'c', 'd']);
  });

  it('puts back what a copy that died while compacting had moved aside', () => {
    append(settings.dir, 'c-1', lineAt('a'));
    writeFileSync(join(settings.dir, 'c-1.jsonl.aside'), `${JSON.stringify(lineAt('a'))}\n${JSON.stringify(lineAt('b'))}\n`);
    recover(settings.dir, 'c-1');
    expect(readSpool(settings.dir, 'c-1').map((line) => line.id)).toEqual(['a', 'b']);
    expect(existsSync(join(settings.dir, 'c-1.jsonl.aside'))).toBe(false);
  });

  it('is deleted, with the conversation’s state, once untouched for a week, and the log is kept', () => {
    append(settings.dir, 'old', lineAt('a'));
    append(settings.dir, 'new', lineAt('b'));
    writeFileSync(join(settings.dir, 'old.json'), '{"sent":[]}');
    writeFileSync(join(settings.dir, 'hook.log'), '');
    const weekAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
    for (const name of ['old.jsonl', 'old.json', 'hook.log']) utimesSync(join(settings.dir, name), weekAgo, weekAgo);
    sweep(settings.dir, Date.now());
    expect(readdirSync(settings.dir).sort()).toEqual(['hook.log', 'new.jsonl']);
  });

  it('reads a line once though a compaction cut short wrote it twice', () => {
    mkdirSync(settings.dir, { recursive: true });
    const text = `${JSON.stringify(lineAt('a'))}\n${JSON.stringify(lineAt('a'))}\nnot json\n{"id":"torn"`;
    writeFileSync(join(settings.dir, 'c-1.jsonl'), text);
    expect(readSpool(settings.dir, 'c-1').map((line) => line.id)).toEqual(['a']);
    expect(readFileSync(join(settings.dir, 'c-1.jsonl'), 'utf8')).toBe(text);
  });
});

describe('the lock', () => {
  it('lets one copy of a conversation work at a time, and is free once it is done', async () => {
    const lockDir = join(dir.path, 'locks');
    const order: string[] = [];
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => (release = resolve));
    const first = withLock(lockDir, 'c-1', 1000, async () => {
      order.push('first in');
      await held;
      order.push('first out');
    });
    const second = withLock(lockDir, 'c-1', 5000, async () => void order.push('second'));
    await new Promise((resolve) => setTimeout(resolve, 300));
    release();
    expect(await first).toBe(true);
    expect(await second).toBe(true);
    expect(order).toEqual(['first in', 'first out', 'second']);
    expect(existsSync(join(lockDir, 'c-1.lock'))).toBe(false);
  });

  it('is kept fresh while its copy works, so a long send is never taken for a copy that died', async () => {
    const lockDir = join(dir.path, 'locks');
    const order: string[] = [];
    const staleMs = 300;
    const first = withLock(lockDir, 'c-1', 1000, async () => {
      order.push('first in');
      await new Promise((resolve) => setTimeout(resolve, 1200));
      order.push('first out');
    }, staleMs);
    await new Promise((resolve) => setTimeout(resolve, 50));
    const second = withLock(lockDir, 'c-1', 3000, async () => void order.push('second'), staleMs);
    expect(await first).toBe(true);
    expect(await second).toBe(true);
    expect(order).toEqual(['first in', 'first out', 'second']);
  });

  it('is taken from a copy that died holding it, once it is stale', async () => {
    const lockDir = join(dir.path, 'locks');
    mkdirSync(lockDir, { recursive: true });
    writeFileSync(join(lockDir, 'c-1.lock'), '');
    const minuteAgo = new Date(Date.now() - 60_000);
    utimesSync(join(lockDir, 'c-1.lock'), minuteAgo, minuteAgo);
    expect(await withLock(lockDir, 'c-1', 1000, async () => undefined, 30_000)).toBe(true);
  });

  it('gives up past its wait while another holds it', async () => {
    const lockDir = join(dir.path, 'locks');
    mkdirSync(lockDir, { recursive: true });
    writeFileSync(join(lockDir, 'c-1.lock'), '');
    expect(await withLock(lockDir, 'c-1', 300, async () => undefined)).toBe(false);
  });
});
