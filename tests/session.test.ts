import { chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type { RunRecord } from 'telmoni';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { Line } from '../src/input';
import { log } from '../src/log';
import { runIdOf } from '../src/record';
import { Sender } from '../src/send';
import { type Deps, type HookInput, sendLeft, sync } from '../src/session';
import type { Settings } from '../src/settings';
import { append, compact, readSpool, recover, sweep } from '../src/spool';
import { readState, withLock } from '../src/state';
import { BASE, FakeIngest, type Step, fixture, replay, tempDir } from './helpers';

let dir: { path: string; remove: () => void };
let settings: Settings;
let sent: RunRecord[];
let answers: boolean[];
let attempts: number;
let logged: string[];
let ids: { next: number };

const IDE = '7f3c2a10-5b4e-4c61-9d2a-0e8f1b2c3d4e';
const HEADLESS = '5e6f7a8b-9c0d-4e1f-8a2b-3c4d5e6f7a8b';

beforeEach(() => {
  dir = tempDir();
  settings = { apiKey: 'tm_test', endpoint: undefined, dir: join(dir.path, 'telmoni') };
  sent = [];
  answers = [];
  attempts = 0;
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

function depsOf(more: Partial<Deps> = {}): Deps {
  return {
    sender: () => ({
      send: (record) => {
        attempts++;
        const ok = answers.shift() ?? true;
        if (ok) sent.push(record);
        return Promise.resolve(ok);
      },
      close: () => Promise.resolve(),
    }),
    log: (line) => void logged.push(line),
    ...more,
  };
}

function hook(event: HookInput['event'], conversationId: string, overrides: Partial<Settings> = {}, more: Partial<Deps> = {}, at?: number): Promise<boolean> {
  const input: HookInput = { event, conversationId };
  if (at !== undefined) input.at = at;
  return sync(input, { ...settings, ...overrides }, {
    sender: () => ({
      send: (record) => {
        attempts++;
        const ok = answers.shift() ?? true;
        if (ok) sent.push(record);
        return Promise.resolve(ok);
      },
      close: () => Promise.resolve(),
    }),
    log: (line) => void logged.push(line),
    ...more,
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

  it('leaves what a session’s end could not send to the next copy of any conversation, which sends it', async () => {
    const ide = fixture('ide');
    through(ide, 0, ide.length);
    answers = [false];
    expect(await hook('sessionEnd', IDE)).toBe(false);
    expect(sent).toEqual([]);
    expect(existsSync(join(settings.dir, `${IDE}.left`))).toBe(true);
    const headless = fixture('headless');
    through(headless, 0, headless.length);
    expect(await hook('sessionEnd', HEADLESS)).toBe(true);
    await sendLeft(HEADLESS, settings, () => depsOf());
    expect(sent.filter((run) => run.sessionId === IDE)).toHaveLength(3);
    expect(existsSync(join(settings.dir, `${IDE}.left`))).toBe(false);
    expect(readSpool(settings.dir, IDE)).toEqual([]);
  });

  it('sends of a conversation reopened since its end only the turns begun before it, its live turn left whole', async () => {
    const ide = fixture('ide');
    through(ide, 0, ide.length);
    answers = [false];
    await hook('sessionEnd', IDE);
    // Reopened: a new turn under way, begun long after the end, no stop yet.
    const later = BASE + 10 * 60 * 60 * 1000;
    append(settings.dir, IDE, { id: 'live-1', at: later, hook_event_name: 'beforeSubmitPrompt', generation_id: 'live-turn' });
    append(settings.dir, IDE, { id: 'live-2', at: later + 1000, hook_event_name: 'postToolUse', generation_id: 'live-turn', tool_name: 'Shell' });
    await sendLeft(HEADLESS, settings, () => depsOf());
    expect(sent.filter((run) => run.sessionId === IDE)).toHaveLength(3);
    expect(readSpool(settings.dir, IDE).map((line) => line.id)).toEqual(['live-1', 'live-2']);
  });

  it('sends what a session’s end left only where that conversation’s key sent', async () => {
    const ide = fixture('ide');
    through(ide, 0, ide.length);
    answers = [false];
    await hook('sessionEnd', IDE);
    await sendLeft(HEADLESS, { ...settings, endpoint: 'https://another.example' }, () => depsOf());
    expect(sent).toEqual([]);
    expect(existsSync(join(settings.dir, `${IDE}.left`))).toBe(true);
  });

  it('keeps what a session’s end left while the platform stays away', async () => {
    const ide = fixture('ide');
    through(ide, 0, ide.length);
    answers = [false, false];
    await hook('sessionEnd', IDE);
    await sendLeft(HEADLESS, settings, () => depsOf());
    expect(sent).toEqual([]);
    expect(existsSync(join(settings.dir, `${IDE}.left`))).toBe(true);
    expect(readSpool(settings.dir, IDE).length).toBeGreaterThan(0);
  });

  it('sends each turn with the editor that ran it as its release', async () => {
    const steps = fixture('ide');
    const [first] = stops(steps);
    through(steps, 0, first!);
    const releases: Array<string | undefined> = [];
    await hook('stop', IDE, {}, {
      sender: (destination) => {
        releases.push(destination.release);
        return { send: () => Promise.resolve(true), close: () => Promise.resolve() };
      },
    });
    expect(releases).toEqual(['3.16.17']);
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

  it('sends a turn again, the same, where the copy died between sending it and saving that it had', async () => {
    const steps = fixture('ide');
    const [first] = stops(steps);
    through(steps, 0, first!);
    // The state cannot be written: the copy fails once the turn is sent.
    const state = join(settings.dir, `${IDE}.json.${process.pid}.tmp`);
    mkdirSync(state, { recursive: true });
    await expect(hook('stop', IDE)).rejects.toThrow();
    rmSync(state, { recursive: true });
    expect(readSpool(settings.dir, IDE)).toHaveLength(first!);
    await hook('stop', IDE);
    expect(sent).toHaveLength(2);
    expect(sent[1]).toEqual(sent[0]);
    expect(readSpool(settings.dir, IDE)).toEqual([]);
    expect(existsSync(join(settings.dir, `${IDE}.lock`))).toBe(false);
  });

  it('sends nothing after a turn the platform did not take, rather than every turn to a Telmoni that is down', async () => {
    const steps = fixture('ide');
    const [, second] = stops(steps);
    through(steps, 0, second!);
    answers = [false];
    await hook('stop', IDE);
    expect(attempts).toBe(1);
    expect(sent).toEqual([]);
    await hook('stop', IDE);
    expect(sent.map((run) => run.runId)).toEqual([
      runIdOf(IDE, 'a1b2c3d4-0001-4a00-8000-000000000001'),
      runIdOf(IDE, 'a1b2c3d4-0002-4a00-8000-000000000002'),
    ]);
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

  it('takes no background subagent’s late stop into the turn after the one it began in, which was sent', async () => {
    append(settings.dir, IDE, { id: 'a', at: BASE, hook_event_name: 'beforeSubmitPrompt', generation_id: 'g-1' });
    append(settings.dir, IDE, { id: 'b', at: BASE + 1000, hook_event_name: 'postToolUse', generation_id: 'g-1', tool_name: 'Task', duration: 5 });
    append(settings.dir, IDE, { id: 'c', at: BASE + 2000, hook_event_name: 'stop', generation_id: 'g-1', status: 'completed' });
    await hook('stop', IDE);
    append(settings.dir, IDE, { id: 'd', at: BASE + 60_000, hook_event_name: 'beforeSubmitPrompt', generation_id: 'g-2' });
    // Begun in the first turn, it stops during the second, under the conversation's id.
    append(settings.dir, IDE, { id: 'e', at: BASE + 65_000, hook_event_name: 'subagentStop', generation_id: IDE, subagent_type: 'explore', status: 'completed', duration_ms: 64_000 });
    append(settings.dir, IDE, { id: 'f', at: BASE + 70_000, hook_event_name: 'stop', generation_id: 'g-2', status: 'completed' });
    await hook('stop', IDE);
    expect(sent).toHaveLength(2);
    expect(Number(sent[1]!.start)).toBe(BASE + 60_000);
    expect((sent[1]!.inside ?? []).some((item) => item.type === 'step')).toBe(false);
    expect(readSpool(settings.dir, IDE)).toEqual([]);
  });

  it('takes no background subagent’s late stop into a later turn, though that turn ran a subagent of its own', async () => {
    append(settings.dir, IDE, { id: 'a', at: BASE, hook_event_name: 'beforeSubmitPrompt', generation_id: 'g-1' });
    append(settings.dir, IDE, { id: 'b', at: BASE + 1000, hook_event_name: 'postToolUse', generation_id: 'g-1', tool_name: 'Task', duration: 5 });
    append(settings.dir, IDE, { id: 'c', at: BASE + 2000, hook_event_name: 'stop', generation_id: 'g-1', status: 'completed' });
    await hook('stop', IDE);
    append(settings.dir, IDE, { id: 'd', at: BASE + 60_000, hook_event_name: 'beforeSubmitPrompt', generation_id: 'g-2' });
    // The first turn's background subagent, begun at a second, stops amid the second turn's own subagent.
    append(settings.dir, IDE, { id: 'e', at: BASE + 65_000, hook_event_name: 'subagentStop', generation_id: IDE, subagent_type: 'explore', status: 'completed', duration_ms: 64_000 });
    append(settings.dir, IDE, { id: 'f', at: BASE + 69_990, hook_event_name: 'subagentStop', generation_id: IDE, subagent_type: 'explore', status: 'completed', duration_ms: 7_900 });
    append(settings.dir, IDE, { id: 'g', at: BASE + 70_000, hook_event_name: 'postToolUse', generation_id: 'g-2', tool_name: 'Task', duration: 8_000 });
    append(settings.dir, IDE, { id: 'h', at: BASE + 72_000, hook_event_name: 'stop', generation_id: 'g-2', status: 'completed' });
    await hook('stop', IDE);
    expect(sent).toHaveLength(2);
    expect(Number(sent[1]!.start)).toBe(BASE + 60_000);
    const steps = (sent[1]!.inside ?? []).filter((item) => item.type === 'step');
    expect(steps.map((step) => [Number(step.start), Number(step.end)])).toEqual([[BASE + 62_000, BASE + 70_000]]);
  });

  it('at the session’s end, closes every turn begun before its latest end, though the copy’s own came earlier', async () => {
    append(settings.dir, IDE, { id: 'p', at: BASE + 1000, hook_event_name: 'beforeSubmitPrompt', generation_id: 'g-4' });
    append(settings.dir, IDE, { id: 't', at: BASE + 2000, hook_event_name: 'postToolUse', generation_id: 'g-4', tool_name: 'Read', duration: 5 });
    append(settings.dir, IDE, { id: 'e', at: BASE + 3000, hook_event_name: 'sessionEnd', reason: 'user_close' });
    await hook('sessionEnd', IDE, {}, {}, BASE + 500);
    expect(sent.map((run) => [run.runId, run.cancelled])).toEqual([[runIdOf(IDE, 'g-4'), true]]);
  });

  it('at the session’s end, closes no turn begun after it, though a copy before spent the end’s line', async () => {
    append(settings.dir, IDE, { id: 'p', at: BASE + 1000, hook_event_name: 'beforeSubmitPrompt', generation_id: 'g-3' });
    append(settings.dir, IDE, { id: 't', at: BASE + 2000, hook_event_name: 'postToolUse', generation_id: 'g-3', tool_name: 'Read', duration: 5 });
    await hook('sessionEnd', IDE, {}, {}, BASE + 500);
    expect(sent).toEqual([]);
    append(settings.dir, IDE, { id: 'u', at: BASE + 3000, hook_event_name: 'postToolUse', generation_id: 'g-3', tool_name: 'Shell', duration: 5 });
    append(settings.dir, IDE, { id: 's', at: BASE + 4000, hook_event_name: 'stop', generation_id: 'g-3', status: 'completed' });
    await hook('stop', IDE);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.cancelled).toBeUndefined();
    expect((sent[0]!.inside ?? []).filter((item) => item.type === 'tool_call')).toHaveLength(2);
  });

  it('catches up a spool of many turns at once, each sent once and in order', async () => {
    // As Telmoni down for a day leaves it: hundreds of turns not yet sent.
    const turns = 400;
    for (let n = 0; n < turns; n++) {
      const generation_id = `g-${String(n).padStart(4, '0')}`;
      const at = BASE + n * 10_000;
      append(settings.dir, IDE, { id: `p-${n}`, at, hook_event_name: 'beforeSubmitPrompt', generation_id });
      for (let call = 0; call < 10; call++) {
        const line: Line = { id: `t-${n}-${call}`, at: at + 100 + call, hook_event_name: 'postToolUse', generation_id };
        append(settings.dir, IDE, { ...line, tool_name: 'Read', duration: 50 });
      }
      append(settings.dir, IDE, { id: `s-${n}`, at: at + 5000, hook_event_name: 'stop', generation_id, status: 'completed' });
    }
    await hook('stop', IDE);
    expect(sent.map((run) => run.runId)).toEqual(
      Array.from({ length: turns }, (_, n) => runIdOf(IDE, `g-${String(n).padStart(4, '0')}`)),
    );
    expect(readSpool(settings.dir, IDE)).toEqual([]);
    expect(readState(settings.dir, IDE).sent).toHaveLength(64);
  }, 60_000);

  it('sends what is left of a turn whose first lines went with the spool, emptied between its hooks', async () => {
    const steps = fixture('ide');
    const [first] = stops(steps);
    through(steps, 0, first! - 1);
    rmSync(join(settings.dir, `${IDE}.jsonl`));
    through(steps, first! - 1, first!);
    await hook('stop', IDE);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.runId).toBe(runIdOf(IDE, 'a1b2c3d4-0001-4a00-8000-000000000001'));
    expect(Number(sent[0]!.end)).toBeGreaterThanOrEqual(Number(sent[0]!.start));
    expect(readSpool(settings.dir, IDE)).toEqual([]);
  });

  it('sends though the state cannot be read, saying so and writing it whole again', async () => {
    const steps = fixture('ide');
    const [first] = stops(steps);
    through(steps, 0, first!);
    writeFileSync(join(settings.dir, `${IDE}.json`), '{"sent":["a1b2c3d4-00');
    await hook('stop', IDE);
    expect(sent.map((run) => run.runId)).toEqual([runIdOf(IDE, 'a1b2c3d4-0001-4a00-8000-000000000001')]);
    expect(readState(settings.dir, IDE).sent).toEqual(['a1b2c3d4-0001-4a00-8000-000000000001']);
    expect(logged).toEqual(['state not read (SyntaxError); read as none']);
  });

  it('sends none of a catch-up again after a copy that died midway', async () => {
    const turns = 200;
    for (let n = 0; n < turns; n++) {
      const generation_id = `g-${String(n).padStart(4, '0')}`;
      const at = BASE + n * 10_000;
      append(settings.dir, IDE, { id: `p-${n}`, at, hook_event_name: 'beforeSubmitPrompt', generation_id });
      append(settings.dir, IDE, { id: `t-${n}`, at: at + 100, hook_event_name: 'postToolUse', generation_id, tool_name: 'Read', duration: 50 });
      append(settings.dir, IDE, { id: `s-${n}`, at: at + 5000, hook_event_name: 'stop', generation_id, status: 'completed' });
    }
    let sends = 0;
    // Killed at its 151st send, between two turns: what it sent and saved stands.
    const dying: Partial<Deps> = {
      sender: () => ({
        send: (record) => {
          if (++sends > 150) return Promise.reject(Object.assign(new Error('killed'), { name: 'Killed' }));
          sent.push(record);
          return Promise.resolve(true);
        },
        close: () => Promise.resolve(),
      }),
    };
    await expect(hook('stop', IDE, {}, dying)).rejects.toThrow('killed');
    expect(sent).toHaveLength(150);
    await hook('stop', IDE);
    const runIds = sent.map((run) => run.runId);
    expect(runIds).toEqual(Array.from({ length: turns }, (_, n) => runIdOf(IDE, `g-${String(n).padStart(4, '0')}`)));
  }, 60_000);

  it('sends none of a catch-up twice after copies that died midway, one after another', async () => {
    const turns = 200;
    for (let n = 0; n < turns; n++) {
      const generation_id = `g-${String(n).padStart(4, '0')}`;
      append(settings.dir, IDE, { id: `p-${n}`, at: BASE + n * 10_000, hook_event_name: 'beforeSubmitPrompt', generation_id });
      append(settings.dir, IDE, { id: `s-${n}`, at: BASE + n * 10_000 + 5000, hook_event_name: 'stop', generation_id, status: 'completed' });
    }
    // Each killed before its first compaction, as a machine put to sleep might.
    const dying = (limit: number): Partial<Deps> => {
      let sends = 0;
      return {
        sender: () => ({
          send: (record) => {
            if (++sends > limit) return Promise.reject(Object.assign(new Error('killed'), { name: 'Killed' }));
            sent.push(record);
            return Promise.resolve(true);
          },
          close: () => Promise.resolve(),
        }),
      };
    };
    for (const limit of [31, 31, 20]) await expect(hook('stop', IDE, {}, dying(limit))).rejects.toThrow('killed');
    await hook('stop', IDE);
    const runIds = sent.map((run) => run.runId);
    expect(runIds).toHaveLength(turns);
    expect(new Set(runIds).size).toBe(turns);
  }, 60_000);

  it('sends nothing past a key file it passed over, and says why once', async () => {
    const steps = fixture('ide');
    through(steps, 0, stops(steps)[0]!);
    // The file may have named a self-hosted endpoint: the key must not go to the default instead.
    await hook('stop', IDE, { apiKey: undefined, keyFileProblem: 'open to other users; chmod 600 it' });
    await hook('stop', IDE, { apiKey: undefined, keyFileProblem: 'open to other users; chmod 600 it' });
    expect(sent).toEqual([]);
    expect(logged).toEqual(['~/.cursor/telmoni.json not used (open to other users; chmod 600 it): fix it, or move it aside and run telmoni-cursor-observability setup, or set TELMONI_API_KEY, with TELMONI_ENDPOINT for a Telmoni of your own; nothing is sent until then']);
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

  it('says once each why nothing is sent: no key, then a key file passed over', async () => {
    await hook('stop', IDE, { apiKey: undefined });
    await hook('stop', IDE, { keyFileProblem: 'open to other users; chmod 600 it' });
    await hook('stop', IDE, { keyFileProblem: 'open to other users; chmod 600 it' });
    expect(logged).toEqual([expect.stringMatching(/^no key/) as unknown, expect.stringMatching(/^~\/\.cursor\/telmoni\.json not used \(open to other users/) as unknown]);
  });

  it('sends nothing without a key, and says so once', async () => {
    replay(fixture('ide'), settings.dir, BASE, ids);
    await hook('stop', IDE, { apiKey: undefined });
    await hook('stop', IDE, { apiKey: undefined });
    expect(sent).toEqual([]);
    expect(logged).toHaveLength(1);
    expect(logged[0]).toMatch(/^no key/);
  });

  it('logs what ingest kept less of for every turn, not only the first, each sent through a client of its own', async () => {
    const ingest = new FakeIngest();
    const endpoint = await ingest.start();
    ingest.refusal = (span) => (span.name === 'execute_tool Shell' ? 'not kept' : undefined);
    replay(fixture('ide'), settings.dir, BASE, ids);
    const log = (line: string): void => void logged.push(line);
    try {
      await sync({ event: 'sessionEnd', conversationId: IDE }, { ...settings, endpoint }, { sender: (to) => new Sender(to, log), log });
    } finally {
      await ingest.stop();
    }
    // The first two turns ran the shell, and the third did not.
    const partly = 'taken in part: telmoni: the server refused a span: not kept';
    expect(logged).toEqual([partly, partly]);
    expect(readSpool(settings.dir, IDE)).toEqual([]);
  });

  it('names an endpoint the SDK refuses once a conversation, in the SDK’s words, and sends nothing', async () => {
    replay(fixture('ide'), settings.dir, BASE, ids);
    replay(fixture('headless'), settings.dir, BASE, ids);
    const real: Partial<Deps> = { sender: (to) => new Sender(to, (line) => void logged.push(line)) };
    const clear = { endpoint: 'http://telmoni.example.com/SENTINEL/path' };
    await hook('stop', IDE, clear, real);
    await hook('sessionEnd', IDE, clear, real);
    await hook('sessionEnd', HEADLESS, { endpoint: 'https://person:SENTINEL@telmoni.example.com' }, real);
    const advice = 'run telmoni-cursor-observability setup, or set TELMONI_ENDPOINT; nothing is sent until then';
    expect(logged).toEqual([
      `endpoint refused by the SDK (refusing to send the API key over unencrypted HTTP to 'telmoni.example.com'; use HTTPS): ${advice}`,
      `endpoint refused by the SDK (the endpoint must be an http:// or https:// URL): ${advice}`,
    ]);
    // No path, no userinfo, no key.
    for (const secret of ['SENTINEL', 'person', 'tm_test']) expect(logged.join('\n')).not.toContain(secret);
    expect(readState(settings.dir, IDE).sent).toEqual([]);
    expect(readSpool(settings.dir, IDE).filter((line) => line.hook_event_name === 'stop')).toHaveLength(3);
    expect(readSpool(settings.dir, HEADLESS)).toHaveLength(fixture('headless').length);
  });
});

describe('the spool', () => {
  const lineAt = (id: string): Line => ({ id, at: BASE, hook_event_name: 'postToolUse', generation_id: 'g-1' });

  it('keeps a line a hook appended while it was compacted', async () => {
    append(settings.dir, 'c-1', lineAt('a'));
    append(settings.dir, 'c-1', lineAt('b'));
    const compacting = compact(settings.dir, 'c-1', new Set(['a']));
    // The hook that had the spool open as it moved aside, and one after.
    writeFileSync(join(settings.dir, `c-1.jsonl.aside.${process.pid}`), `${JSON.stringify(lineAt('c'))}\n`, { flag: 'a' });
    append(settings.dir, 'c-1', lineAt('d'));
    await compacting;
    expect(readSpool(settings.dir, 'c-1').map((line) => line.id).sort()).toEqual(['b', 'c', 'd']);
  });

  it('puts back what each copy that died while compacting had moved aside, under its own name or a version’s before', () => {
    append(settings.dir, 'c-1', lineAt('a'));
    writeFileSync(join(settings.dir, 'c-1.jsonl.aside'), `${JSON.stringify(lineAt('a'))}\n${JSON.stringify(lineAt('b'))}\n`);
    writeFileSync(join(settings.dir, 'c-1.jsonl.aside.4242'), `${JSON.stringify(lineAt('c'))}\n`);
    writeFileSync(join(settings.dir, 'c-10.jsonl.aside.4242'), `${JSON.stringify(lineAt('d'))}\n`);
    recover(settings.dir, 'c-1');
    expect(readSpool(settings.dir, 'c-1').map((line) => line.id).sort()).toEqual(['a', 'b', 'c']);
    expect(readdirSync(settings.dir).sort()).toEqual(['c-1.jsonl', 'c-10.jsonl.aside.4242']);
  });

  it('moves a spool aside under a name of the copy’s own, never over another copy’s', async () => {
    append(settings.dir, 'c-1', lineAt('a'));
    append(settings.dir, 'c-1', lineAt('b'));
    // Another copy's, as one that took a stale lock in the same instant would leave it mid-compaction.
    writeFileSync(join(settings.dir, 'c-1.jsonl.aside.4242'), `${JSON.stringify(lineAt('c'))}\n`);
    await compact(settings.dir, 'c-1', new Set(['a']));
    expect(readFileSync(join(settings.dir, 'c-1.jsonl.aside.4242'), 'utf8')).toBe(`${JSON.stringify(lineAt('c'))}\n`);
    expect(readSpool(settings.dir, 'c-1').map((line) => line.id)).toEqual(['b']);
  });

  it('is deleted, with the conversation’s state, once untouched for a week, and the log and what setup keeps are not', () => {
    append(settings.dir, 'old', lineAt('a'));
    append(settings.dir, 'new', lineAt('b'));
    const kept = ['hook.log', 'hook.log.1', 'hooks.json.found-0123456789abcdef'];
    for (const name of ['old.json', 'old.lock', 'old.jsonl.aside', 'old.jsonl.aside.4242', 'old.json.tmp', 'old.json.4242.tmp', ...kept]) {
      writeFileSync(join(settings.dir, name), '');
    }
    const weekAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
    for (const name of readdirSync(settings.dir).filter((name) => name !== 'new.jsonl')) {
      utimesSync(join(settings.dir, name), weekAgo, weekAgo);
    }
    const said: string[] = [];
    sweep(settings.dir, Date.now(), (line) => void said.push(line));
    expect(readdirSync(settings.dir).sort()).toEqual([...kept, 'new.jsonl'].sort());
    // What went unsent is said, by count alone.
    expect(said).toEqual(['old: 1 lines of a conversation untouched for a week deleted, unsent']);
  });

  it('keeps of a line read back only what a hook would have kept, checked again field by field', () => {
    mkdirSync(settings.dir, { recursive: true, mode: 0o700 });
    const planted = { id: 'l1', at: BASE, hook_event_name: 'postToolUse', tool_name: 'Shell: cat /home/person/secret', model: 'm', prompt: 'PLANTED' };
    writeFileSync(join(settings.dir, 'c.jsonl'), `${JSON.stringify(planted)}\n${JSON.stringify({ id: 'l2', at: 'then', hook_event_name: 'stop' })}\n`, { mode: 0o600 });
    expect(readSpool(settings.dir, 'c')).toEqual([{ id: 'l1', at: BASE, hook_event_name: 'postToolUse', model: 'm' }]);
  });

  it('reads a line once though a compaction cut short wrote it twice', () => {
    mkdirSync(settings.dir, { recursive: true });
    const text = `${JSON.stringify(lineAt('a'))}\n${JSON.stringify(lineAt('a'))}\nnot json\n{"id":"torn"`;
    writeFileSync(join(settings.dir, 'c-1.jsonl'), text);
    expect(readSpool(settings.dir, 'c-1').map((line) => line.id)).toEqual(['a']);
    expect(readFileSync(join(settings.dir, 'c-1.jsonl'), 'utf8')).toBe(text);
  });
});

describe('a spool cut short', () => {
  const lineAt = (id: string): Line => ({ id, at: BASE, hook_event_name: 'postToolUse', generation_id: 'g-1' });

  it('reads the line a hook appended onto one a full disk cut short', () => {
    mkdirSync(settings.dir, { recursive: true });
    const torn = `${JSON.stringify(lineAt('a')).slice(0, 30)}`;
    writeFileSync(join(settings.dir, 'c-1.jsonl'), `${JSON.stringify(lineAt('a'))}\n${torn}${JSON.stringify(lineAt('b'))}\n`);
    expect(readSpool(settings.dir, 'c-1').map((line) => line.id)).toEqual(['a', 'b']);
  });
});

describe('a spool that cannot be read', () => {
  const lineAt = (id: string): Line => ({ id, at: BASE, hook_event_name: 'postToolUse', generation_id: 'g-1' });

  it.skipIf(process.getuid?.() === 0)('is never taken for an empty one, nor deleted, set aside or not', async () => {
    append(settings.dir, 'c-1', lineAt('a'));
    const spool = join(settings.dir, 'c-1.jsonl');
    chmodSync(spool, 0o000);
    expect(() => readSpool(settings.dir, 'c-1')).toThrow();
    await expect(compact(settings.dir, 'c-1', new Set(['b']))).rejects.toThrow();
    expect(() => recover(settings.dir, 'c-1')).toThrow();
    // Readable again, what was set aside is put back whole.
    chmodSync(`${spool}.aside.${process.pid}`, 0o600);
    recover(settings.dir, 'c-1');
    expect(readSpool(settings.dir, 'c-1').map((line) => line.id)).toEqual(['a']);
  });
});

describe('the log', () => {
  it('moves aside past a megabyte and begins again, every line the person’s alone', () => {
    const line = 'x'.repeat(1024);
    for (let n = 0; n < 1100; n++) log(settings.dir, line);
    const path = join(settings.dir, 'hook.log');
    expect(readFileSync(`${path}.1`, 'utf8').length).toBeGreaterThan(1024 * 1024);
    expect(readFileSync(path, 'utf8').length).toBeLessThan(1024 * 1024);
    for (const file of [path, `${path}.1`]) expect(statSync(file).mode & 0o777).toBe(0o600);
  });
});

describe('the lock', () => {
  it('is given up past its wait at a stop, which a later stop or the session’s end follows, and outwaited at the session’s end', async () => {
    replay(fixture('ide'), settings.dir, BASE, ids);
    let entered: () => void = () => undefined;
    let release: () => void = () => undefined;
    const inside = new Promise<void>((resolve) => (entered = resolve));
    const held = new Promise<void>((resolve) => (release = resolve));
    const holder = withLock(settings.dir, IDE, 1000, async () => {
      entered();
      await held;
    });
    await inside;
    let ended = false;
    const ending = hook('sessionEnd', IDE, {}, { lockWaitMs: 10 }).then(() => {
      ended = true;
    });
    await hook('stop', IDE, {}, { lockWaitMs: 10 });
    expect(logged).toEqual([
      "busy: another copy of this conversation held the lock past its wait; the next stop or the session's end sends what is left",
    ]);
    // The stop gave up after the session's end began to wait, and that waits on.
    expect(ended).toBe(false);
    release();
    await Promise.all([holder, ending]);
    expect(sent).toHaveLength(3);
    expect(logged).toHaveLength(1);
  });

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

  it('leaves in place a lock another copy took from it', async () => {
    const lockDir = join(dir.path, 'locks');
    const lock = join(lockDir, 'c-1.lock');
    await withLock(lockDir, 'c-1', 1000, async () => {
      // Another copy, finding this one's lock stale, took it.
      writeFileSync(lock, 'another copy');
    });
    expect(readFileSync(lock, 'utf8')).toBe('another copy');
  });

  it('is kept in a folder only its owner can open, readable by its owner alone', async () => {
    const lockDir = join(dir.path, 'locks');
    let mode = 0;
    await withLock(lockDir, 'c-1', 1000, async () => {
      mode = statSync(join(lockDir, 'c-1.lock')).mode & 0o777;
    });
    expect(mode).toBe(0o600);
    expect(statSync(lockDir).mode & 0o777).toBe(0o700);
  });
});
