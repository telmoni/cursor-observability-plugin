/** The built binary, run as Cursor runs a hook: a process handed the event on stdin that must answer and exit at once, while at a turn's end a detached copy sends. */

import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { type AddressInfo, type Socket, connect, createServer } from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { EVENTS } from '../src/input';
import { runIdOf } from '../src/record';
import { FakeIngest, PLANTED, type Step, attributesOf, fixture, tempDir } from './helpers';

const CLI = fileURLToPath(new URL('../dist/telmoni-cursor-observability.mjs', import.meta.url));
const IDE = '7f3c2a10-5b4e-4c61-9d2a-0e8f1b2c3d4e';
const HEADLESS = '5e6f7a8b-9c0d-4e1f-8a2b-3c4d5e6f7a8b';
const KEY = `telmoni_${'Ab3dE6gH9j'.repeat(4)}K-_`;

/** What Cursor puts in every hook's environment, planted as the fixtures plant their fields. */
const CURSOR_ENV = {
  CURSOR_USER_EMAIL: 'person@example.com',
  CURSOR_TRANSCRIPT_PATH: '/home/person/.cursor/projects/SENTINEL/agent-transcripts/7f3c2a10.jsonl',
  CURSOR_VERSION: '3.16.17',
};

let home: { path: string; remove: () => void };
let ingest: FakeIngest;
let endpoint: string;

beforeEach(async () => {
  home = tempDir();
  ingest = new FakeIngest();
  endpoint = await ingest.start();
});

afterEach(async () => {
  // No copy outlives its test, to write into a home folder already removed.
  await copiesDone();
  await ingest.stop();
  home.remove();
}, 40_000);

interface Ran {
  code: number | null;
  ms: number;
  stdout: string;
}

interface Run {
  /** Run through a shell, as Cursor runs a hook's command, rather than the binary with `args`. */
  command?: string;
  cwd?: string;
  env?: Record<string, string>;
}

/** The binary with `args` and `input` on its stdin, with only what Cursor hands a hook in its environment, under a home of the test's own. */
function run(args: string[], input: string, { command, cwd, env = {} }: Run = {}): Promise<Ran> {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const options = {
      stdio: ['pipe', 'pipe', 'ignore'] as ['pipe', 'pipe', 'ignore'],
      env: { PATH: process.env['PATH'] ?? '', HOME: home.path, ...env },
      ...(cwd === undefined ? {} : { cwd }),
    };
    const child =
      command === undefined ? spawn(process.execPath, [CLI, ...args], options) : spawn('/bin/sh', ['-c', command], options);
    const out: Buffer[] = [];
    child.stdout.on('data', (chunk: Buffer) => out.push(chunk));
    // A hook may answer and leave before reading all it was handed.
    child.stdin.on('error', () => undefined);
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, ms: Date.now() - started, stdout: Buffer.concat(out).toString('utf8') }));
    child.stdin.end(input);
  });
}

/** Each step's hook in turn, as Cursor fires them. */
async function conversation(steps: readonly Step[], env: Record<string, string>): Promise<Ran[]> {
  const ran: Ran[] = [];
  for (const step of steps) ran.push(await run(['hook', step.payload.hook_event_name], JSON.stringify(step.payload), { env }));
  return ran;
}

async function until(check: () => boolean, ms: number): Promise<boolean> {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (check()) return true;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return check();
}

const telmoni = (): string => join(home.path, '.cursor', 'telmoni');

/** The command lines of this test's detached copies still running, which /proc alone shows. */
function copies(): string[][] {
  if (!existsSync('/proc')) return [];
  return readdirSync('/proc')
    .filter((pid) => /^\d+$/.test(pid))
    .flatMap((pid) => {
      try {
        const env = readFileSync(`/proc/${pid}/environ`, 'utf8').split('\0');
        if (!env.includes(`HOME=${home.path}`) || !env.some((entry) => entry.startsWith('TELMONI_CURSOR_HOOK_INPUT='))) return [];
        return [readFileSync(`/proc/${pid}/cmdline`, 'utf8').split('\0')];
      } catch {
        return [];
      }
    });
}

/** What this test's detached copies running now were handed, in their environment. */
function handoffs(): unknown[] {
  if (!existsSync('/proc')) return [];
  return readdirSync('/proc')
    .filter((pid) => /^\d+$/.test(pid))
    .flatMap((pid) => {
      try {
        const env = readFileSync(`/proc/${pid}/environ`, 'utf8').split('\0');
        const handoff = env.find((entry) => entry.startsWith('TELMONI_CURSOR_HOOK_INPUT='));
        return env.includes(`HOME=${home.path}`) && handoff !== undefined ? [JSON.parse(handoff.slice(handoff.indexOf('=') + 1)) as unknown] : [];
      } catch {
        return [];
      }
    });
}

/** Until every copy of this test has exited and none holds a lock. */
async function copiesDone(): Promise<void> {
  const locked = (): boolean => existsSync(telmoni()) && readdirSync(telmoni()).some((name) => name.endsWith('.lock'));
  expect(await until(() => copies().length === 0 && !locked(), 30_000)).toBe(true);
}

const listing = (): string => (existsSync(telmoni()) ? readdirSync(telmoni()).sort().join(' ') : '');
const runs = (): number => ingest.spans().filter((span) => span.name === 'invoke_agent cursor').length;
const stored = (): string[] =>
  ingest.stored.filter((span) => span.name === 'invoke_agent cursor').map((span) => String(attributesOf(span)['telmoni.run_id']));
const logged = (): string => (existsSync(join(telmoni(), 'hook.log')) ? readFileSync(join(telmoni(), 'hook.log'), 'utf8') : '');
const turnOf = (n: string): string => runIdOf(IDE, `a1b2c3d4-${n}-4a00-8000-00000000${n}`);

/** Each step's hook at once, as Cursor runs the hooks of a turn's calls side by side. */
async function together(steps: readonly Step[], env: Record<string, string>): Promise<Ran[]> {
  return Promise.all(steps.map((step) => run(['hook', step.payload.hook_event_name], JSON.stringify(step.payload), { env })));
}

describe('the hook', () => {
  it('answers each event as Cursor reads it, at once, and exits 0', async () => {
    expect(existsSync(CLI), 'build the plugin first: npm run build').toBe(true);
    for (const event of EVENTS) {
      const { code, ms, stdout } = await run(['hook', event], JSON.stringify({ hook_event_name: event, conversation_id: 'c-1' }));
      expect(code).toBe(0);
      expect(stdout).toBe(event === 'beforeSubmitPrompt' ? '{"continue":true}' : '{}');
      expect(ms).toBeLessThan(1500);
    }
  }, 15_000);

  it('loads none of the SDK, nor what only a turn’s end or setup needs, before it answers', () => {
    const loaded = new Set<string>();
    const load = (file: string): void => {
      if (loaded.has(file)) return;
      loaded.add(file);
      const text = readFileSync(join(dirname(CLI), file), 'utf8');
      // Static imports alone: `import(...)`, as the copy and setup load theirs, is not followed.
      for (const [, imported] of text.matchAll(/(?:\bfrom\s*|^import\s*)"\.\/([^"]+)"/gm)) load(imported!);
    };
    load('telmoni-cursor-observability.mjs');
    expect(loaded.size).toBeGreaterThan(1);
    for (const file of loaded) {
      const text = readFileSync(join(dirname(CLI), file), 'utf8');
      expect(text, file).not.toMatch(/opentelemetry|recordRun/);
      // The bundle names a builtin without its `node:`.
      expect(text, file).not.toMatch(/from\s*"(?:node:)?(?:crypto|child_process|http|https|net)"/);
    }
  });

  it('reads an event as PowerShell pipes it on Windows: a byte order mark before it, a line’s end after', async () => {
    const env = { TELMONI_API_KEY: 'telmoni_test' };
    const payload = `\uFEFF${JSON.stringify(fixture('ide')[2]!.payload)}\r\n`;
    expect(await run(['hook', 'postToolUse'], payload, { env })).toMatchObject({ code: 0, stdout: '{}' });
    expect(readFileSync(join(telmoni(), `${IDE}.jsonl`), 'utf8')).toContain('"tool_name":"Read"');
    expect(existsSync(join(telmoni(), 'hook.log'))).toBe(false);
  });

  it('answers input it cannot read, and an event it does not record, exits 0, and logs the kind alone', async () => {
    const garbled = await run(['hook', 'beforeSubmitPrompt'], 'SENTINEL not json');
    expect(garbled).toMatchObject({ code: 0, stdout: '{"continue":true}' });
    const unknown = await run(['hook', 'preCompact'], JSON.stringify({ hook_event_name: 'preCompact', conversation_id: 'c-1' }));
    expect(unknown).toMatchObject({ code: 0, stdout: '{}' });
    const log = readFileSync(join(telmoni(), 'hook.log'), 'utf8');
    expect(log).toMatch(/^\S+ beforeSubmitPrompt: failed: SyntaxError\n$/);
  });

  it('answers and exits, saying why, when Cursor never closes an input it has to wait for', async () => {
    const held: Socket[] = [];
    const server = createServer((socket) => void held.push(socket));
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const input = connect((server.address() as AddressInfo).port, '127.0.0.1');
    await once(input, 'connect');
    try {
      // libuv makes a child's stdin blocking but leaves its fd 3 alone: the shell moves that socket onto stdin.
      const child = spawn('/bin/sh', ['-c', 'exec "$0" "$1" hook stop <&3 3<&-', process.execPath, CLI], {
        stdio: ['ignore', 'pipe', 'ignore', input],
        env: { PATH: process.env['PATH'] ?? '', HOME: home.path },
      });
      const out: Buffer[] = [];
      child.stdout!.on('data', (chunk: Buffer) => out.push(chunk));
      const code = await new Promise<number | null>((resolve) => {
        const timer = setTimeout(() => {
          child.kill();
          resolve(-1);
        }, 9_000);
        child.on('exit', (exited) => {
          clearTimeout(timer);
          resolve(exited);
        });
      });
      expect(code).toBe(0);
      expect(Buffer.concat(out).toString('utf8')).toBe('{}');
      expect(readFileSync(join(telmoni(), 'hook.log'), 'utf8')).toMatch(/^\S+ stop: failed: NoHookInput\n$/);
    } finally {
      input.destroy();
      for (const socket of held) socket.destroy();
      server.close();
    }
  }, 15_000);

  it.skipIf(process.platform === 'win32')('keeps nothing past a key file it passed over, though the key is in its environment', async () => {
    mkdirSync(join(home.path, '.cursor'), { recursive: true });
    const file = join(home.path, '.cursor', 'telmoni.json');
    writeFileSync(file, JSON.stringify({ apiKey: KEY, endpoint: 'https://telmoni.example.com' }));
    chmodSync(file, 0o644);
    const payload = JSON.stringify(fixture('ide')[2]!.payload);
    expect(await run(['hook', 'postToolUse'], payload, { env: { TELMONI_API_KEY: KEY } })).toMatchObject({ code: 0, stdout: '{}' });
    expect(existsSync(join(telmoni(), `${IDE}.jsonl`))).toBe(false);
  });

  it('reads an event whole on a pipe Cursor never closes, rather than wait for an end that never comes', async () => {
    const child = spawn(process.execPath, [CLI, 'hook', 'postToolUse'], {
      stdio: ['pipe', 'pipe', 'ignore'],
      env: { PATH: process.env['PATH'] ?? '', HOME: home.path, TELMONI_API_KEY: 'telmoni_test' },
    });
    const out: Buffer[] = [];
    child.stdout.on('data', (chunk: Buffer) => out.push(chunk));
    const started = Date.now();
    // Written and never ended: a child's stdin is a blocking pipe, so only an event read whole lets the hook go.
    child.stdin.write(JSON.stringify(fixture('ide')[2]!.payload));
    const code = await new Promise<number | null>((resolve) => {
      const timer = setTimeout(() => {
        child.kill();
        resolve(-1);
      }, 9_000);
      child.on('exit', (exited) => {
        clearTimeout(timer);
        resolve(exited);
      });
    });
    child.stdin.destroy();
    expect(code).toBe(0);
    expect(Date.now() - started).toBeLessThan(3_000);
    expect(Buffer.concat(out).toString('utf8')).toBe('{}');
    expect(readFileSync(join(telmoni(), `${IDE}.jsonl`), 'utf8')).toContain('"tool_name":"Read"');
  }, 15_000);

  it('records a whole conversation: each turn sent by a detached copy as it ends, the spool emptied, nothing said kept', async () => {
    const ran = await conversation(fixture('ide'), { ...CURSOR_ENV, TELMONI_API_KEY: KEY, TELMONI_ENDPOINT: endpoint });
    for (const { code, ms } of ran) {
      expect(code).toBe(0);
      expect(ms).toBeLessThan(1500);
    }
    // What is left is the record of what was sent, and no line of the conversation.
    expect(await until(() => runs() === 3 && listing() === `${IDE}.json`, 20_000)).toBe(true);
    const roots = ingest.spans().filter((span) => span.name === 'invoke_agent cursor');
    expect(new Set(roots.map((span) => attributesOf(span)['telmoni.run_id']))).toEqual(
      new Set(['0001', '0002', '0003'].map((n) => runIdOf(IDE, `a1b2c3d4-${n}-4a00-8000-00000000${n}`))),
    );
    for (const span of roots) expect(attributesOf(span)['gen_ai.conversation.id']).toBe(IDE);
    const names = ingest.spans().map((span) => span.name);
    expect(names).toContain('execute_tool MCP:create_issue');
    expect(names).toContain('subagent explore');
    expect(names).not.toContain('execute_tool Task');
    expect(names.filter((name) => name === 'chat claude-opus-4-7')).toHaveLength(3);
    const bodies = ingest.received.map((request) => request.body).join('');
    for (const planted of PLANTED) expect(bodies).not.toContain(planted);
    expect(bodies).not.toContain(home.path);
    expect(bodies).not.toContain(KEY);
    // The session's end started a copy too, which found nothing left to send.
    await copiesDone();
    expect(runs()).toBe(3);
    expect(listing()).toBe(`${IDE}.json`);
    const kept = readFileSync(join(telmoni(), `${IDE}.json`), 'utf8');
    for (const planted of [...PLANTED, KEY, home.path]) expect(kept).not.toContain(planted);
  }, 40_000);

  it.skipIf(process.platform !== 'linux')('hands the copy its work in its environment, never on a command line, which anyone may list', async () => {
    const env = { ...CURSOR_ENV, TELMONI_API_KEY: KEY, TELMONI_ENDPOINT: endpoint };
    const steps = fixture('ide');
    const stop = steps.findIndex((step) => step.payload.hook_event_name === 'stop');
    await conversation(steps.slice(0, stop + 1), env);
    // The copy waits a second for the turn's last hooks: long enough to look at it.
    expect(copies()).toEqual([[process.execPath, CLI, 'hook', 'stop', '']]);
    // With the time the stop's hook ran, which a session's end closes no later turn past.
    expect(handoffs()).toEqual([{ event: 'stop', conversation_id: IDE, at: expect.any(Number) as unknown }]);
    expect(await until(() => runs() === 1, 20_000)).toBe(true);
  }, 30_000);

  it('closes a headless session’s turn at the session’s end, with no stop', async () => {
    const ran = await conversation(fixture('headless'), { TELMONI_API_KEY: 'telmoni_test', TELMONI_ENDPOINT: endpoint });
    expect(ran.every(({ code }) => code === 0)).toBe(true);
    expect(await until(() => runs() === 1 && listing() === `${HEADLESS}.json`, 20_000)).toBe(true);
    const names = ingest.spans().map((span) => span.name);
    expect(names.filter((name) => name.startsWith('execute_tool '))).toEqual(['execute_tool Grep', 'execute_tool Read']);
    expect(names).toContain('chat composer-2.5');
  }, 30_000);

  it('keeps and sends nothing without a key, and says so once a conversation', async () => {
    const ran = await conversation(fixture('ide'), { TELMONI_ENDPOINT: endpoint });
    expect(ran.every(({ code }) => code === 0)).toBe(true);
    const log = join(telmoni(), 'hook.log');
    expect(await until(() => existsSync(log), 10_000)).toBe(true);
    // Three stops and the session's end each start a copy: the last takes its time.
    await copiesDone();
    expect(readFileSync(log, 'utf8').trim().split('\n')).toHaveLength(1);
    expect(readFileSync(log, 'utf8')).toMatch(/: no key: /);
    expect(listing()).toBe(`${IDE}.json hook.log`);
    expect(ingest.received).toEqual([]);
  }, 30_000);

  it('says once a conversation that the SDK refuses its endpoint, in its words, never the path, the userinfo or the key', async () => {
    const env = { TELMONI_API_KEY: KEY, TELMONI_ENDPOINT: 'http://person:SENTINEL@telmoni.example.com/SENTINEL' };
    const ran = await conversation(fixture('ide'), env);
    expect(ran.every(({ code }) => code === 0)).toBe(true);
    await copiesDone();
    const log = logged();
    expect(log.trim().split('\n')).toHaveLength(1);
    expect(log).toMatch(/: endpoint refused by the SDK \(the endpoint must be an http:\/\/ or https:\/\/ URL\): /);
    for (const secret of ['SENTINEL', 'person', KEY]) expect(log).not.toContain(secret);
    expect(readFileSync(join(telmoni(), `${IDE}.jsonl`), 'utf8')).toContain('"hook_event_name":"stop"');
  }, 30_000);

  it('keeps every line of hooks that run at once, and sends their turn once', async () => {
    const env = { TELMONI_API_KEY: 'telmoni_test', TELMONI_ENDPOINT: endpoint };
    const [, prompt, read] = fixture('ide');
    await run(['hook', 'beforeSubmitPrompt'], JSON.stringify(prompt!.payload), { env });
    const calls = Array.from({ length: 12 }, (_, index) => ({
      ...read!,
      payload: { ...read!.payload, tool_use_id: `tool_${index}`, duration: index + 1 },
    }));
    const ran = await together(calls, env);
    expect(ran.every(({ code, stdout }) => code === 0 && stdout === '{}')).toBe(true);
    const stop = fixture('ide').find((step) => step.payload.hook_event_name === 'stop')!;
    await run(['hook', 'stop'], JSON.stringify(stop.payload), { env });
    expect(await until(() => runs() === 1 && listing() === `${IDE}.json`, 20_000)).toBe(true);
    await copiesDone();
    expect(ingest.spans().filter((span) => span.name === 'execute_tool Read')).toHaveLength(12);
    expect(stored()).toEqual([turnOf('0001')]);
  }, 30_000);

  it('sends a turn Telmoni could not take with the next, and ingest stores each once', async () => {
    const env = { TELMONI_API_KEY: 'telmoni_test', TELMONI_ENDPOINT: endpoint };
    const steps = fixture('ide');
    const second = steps.findIndex((step) => step.payload.generation_id === 'a1b2c3d4-0002-4a00-8000-000000000002');
    ingest.status = 503;
    await conversation(steps.slice(0, second), env);
    expect(await until(() => logged().includes('not sent:'), 20_000)).toBe(true);
    await copiesDone();
    expect(stored()).toEqual([]);
    expect(readFileSync(join(telmoni(), `${IDE}.jsonl`), 'utf8')).toContain('"hook_event_name":"stop"');
    ingest.status = 200;
    await conversation(steps.slice(second), env);
    expect(await until(() => stored().length === 3 && listing() === `${IDE}.json hook.log`, 30_000)).toBe(true);
    await copiesDone();
    expect(stored().sort()).toEqual([turnOf('0001'), turnOf('0002'), turnOf('0003')].sort());
  }, 60_000);

  it('never takes a subagent’s own calls, which Cursor gives a conversation of their own, into its parent’s run', async () => {
    const env = { TELMONI_API_KEY: 'telmoni_test', TELMONI_ENDPOINT: endpoint };
    const subagent = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';
    const steps = fixture('ide');
    const read = steps[2]!.payload;
    // As Cursor's staff describe a subagent's own hooks: its own conversation and turn, nothing naming the parent.
    const own = (after: number): Step => ({
      after_ms: after,
      payload: { ...read, conversation_id: subagent, session_id: subagent, generation_id: 'b5c6d7e8-0001-4b00-8000-000000000001', transcript_path: null },
    });
    const at = steps.findIndex((step) => step.payload.hook_event_name === 'subagentStop');
    await conversation([...steps.slice(0, at), own(30_000), own(40_000), ...steps.slice(at)], env);
    expect(await until(() => runs() === 3, 20_000)).toBe(true);
    await copiesDone();
    const calls = ingest
      .spans()
      .filter((span) => attributesOf(span)['telmoni.run_id'] === turnOf('0001') && span.name.startsWith('execute_tool '));
    expect(calls.map((span) => span.name).sort()).toEqual(
      ['execute_tool MCP:create_issue', 'execute_tool Read', 'execute_tool Shell', 'execute_tool Shell'].sort(),
    );
    expect(ingest.spans().filter((span) => attributesOf(span)['gen_ai.conversation.id'] === subagent)).toEqual([]);
    // Cursor ends no turn of that conversation: its lines wait for the week's sweep.
    expect(listing()).toBe(`${IDE}.json ${subagent}.jsonl`);
  }, 40_000);

  it('keeps everything it writes for the person alone, and nothing said: files of mode 600 in a folder of mode 700', async () => {
    await conversation(fixture('ide').slice(0, 4), { ...CURSOR_ENV, TELMONI_API_KEY: KEY, TELMONI_ENDPOINT: endpoint });
    await conversation(fixture('headless'), { ...CURSOR_ENV, TELMONI_ENDPOINT: endpoint });
    await copiesDone();
    expect(statSync(telmoni()).mode & 0o777).toBe(0o700);
    const files = readdirSync(telmoni());
    expect(files.sort()).toEqual([`${HEADLESS}.json`, `${IDE}.jsonl`, 'hook.log']);
    for (const file of files) {
      expect(statSync(join(telmoni(), file)).mode & 0o777).toBe(0o600);
      const text = readFileSync(join(telmoni(), file), 'utf8');
      for (const planted of [...PLANTED, KEY, home.path]) expect(text, file).not.toContain(planted);
    }
  }, 30_000);

  it('hands the turn to a copy outside its own process group, which outlives the group’s end', async () => {
    const env = { TELMONI_API_KEY: 'telmoni_test', TELMONI_ENDPOINT: endpoint };
    const steps = fixture('ide');
    const stop = steps.findIndex((step) => step.payload.hook_event_name === 'stop');
    await conversation(steps.slice(0, stop), env);
    // The stop's hook in a process group of its own, which is ended whole once the hook exits.
    const hook = spawn(process.execPath, [CLI, 'hook', 'stop'], {
      detached: true,
      stdio: ['pipe', 'ignore', 'ignore'],
      env: { PATH: process.env['PATH'] ?? '', HOME: home.path, ...env },
    });
    const exited = new Promise((resolve) => hook.on('exit', resolve));
    hook.stdin.end(JSON.stringify(steps[stop]!.payload));
    await exited;
    let ended: unknown;
    try {
      process.kill(-hook.pid!, 'SIGKILL');
    } catch (error) {
      ended = error;
    }
    // Nothing left in the hook's group: the copy is in a session of its own.
    expect((ended as NodeJS.ErrnoException | undefined)?.code).toBe('ESRCH');
    expect(await until(() => runs() === 1, 20_000)).toBe(true);
  }, 30_000);

  /** A repository whose own hooks run the plugin, as `setup --project` writes them. */
  function repository(): string {
    const project = join(home.path, 'repository');
    mkdirSync(join(project, '.cursor'), { recursive: true });
    writeFileSync(
      join(project, '.cursor', 'hooks.json'),
      JSON.stringify({ version: 1, hooks: { postToolUse: [{ command: 'telmoni-cursor-observability hook postToolUse --project' }] } }),
    );
    return project;
  }

  it.skipIf(process.platform === 'win32')('stands aside where the workspace’s own hooks run the plugin, which then record alone', async () => {
    const project = repository();
    // The bin those hooks run, on the PATH Cursor hands them.
    const bin = join(home.path, 'bin');
    mkdirSync(bin, { recursive: true });
    writeFileSync(join(bin, 'telmoni-cursor-observability'), '#!/bin/sh\n', { mode: 0o755 });
    const env = { TELMONI_API_KEY: 'telmoni_test', CURSOR_PROJECT_DIR: project, PATH: bin };
    const payload = JSON.stringify(fixture('ide')[2]!.payload);
    expect((await run(['hook', 'postToolUse'], payload, { env })).stdout).toBe('{}');
    expect(existsSync(join(telmoni(), `${IDE}.jsonl`))).toBe(false);
    expect((await run(['hook', 'postToolUse', '--project'], payload, { env })).stdout).toBe('{}');
    expect(readFileSync(join(telmoni(), `${IDE}.jsonl`), 'utf8').trim().split('\n')).toHaveLength(1);
  });

  it.skipIf(process.platform === 'win32')('stands aside where the bin is on a folder of the PATH named from the workspace', async () => {
    const project = repository();
    mkdirSync(join(project, 'tools'), { recursive: true });
    writeFileSync(join(project, 'tools', 'telmoni-cursor-observability'), '#!/bin/sh\n', { mode: 0o755 });
    const env = { TELMONI_API_KEY: 'telmoni_test', CURSOR_PROJECT_DIR: project, PATH: 'tools' };
    expect((await run(['hook', 'postToolUse'], JSON.stringify(fixture('ide')[2]!.payload), { env })).stdout).toBe('{}');
    expect(existsSync(join(telmoni(), `${IDE}.jsonl`))).toBe(false);
  });

  it('records where the workspace’s own hooks cannot start, the plugin being on no folder of the PATH they run with', async () => {
    const env = { TELMONI_API_KEY: 'telmoni_test', CURSOR_PROJECT_DIR: repository(), PATH: join(home.path, 'empty') };
    expect((await run(['hook', 'postToolUse'], JSON.stringify(fixture('ide')[2]!.payload), { env })).stdout).toBe('{}');
    expect(readFileSync(join(telmoni(), `${IDE}.jsonl`), 'utf8').trim().split('\n')).toHaveLength(1);
  });

  it('closes, as its session ends, no turn begun after that end, though a copy before it spent the end’s line', async () => {
    const at = Date.UTC(2026, 9, 12, 9);
    const lines = [
      { id: 'p', at: at + 1000, hook_event_name: 'beforeSubmitPrompt', generation_id: 'g-3' },
      { id: 't', at: at + 2000, hook_event_name: 'postToolUse', generation_id: 'g-3', tool_name: 'Read', duration: 5 },
    ];
    mkdirSync(telmoni(), { recursive: true, mode: 0o700 });
    writeFileSync(join(telmoni(), `${IDE}.jsonl`), lines.map((line) => `${JSON.stringify(line)}\n`).join(''), { mode: 0o600 });
    const handoff = JSON.stringify({ event: 'sessionEnd', conversation_id: IDE, at: at + 500 });
    const env = { TELMONI_API_KEY: 'telmoni_test', TELMONI_ENDPOINT: endpoint, TELMONI_CURSOR_HOOK_INPUT: handoff };
    expect((await run(['hook', 'sessionEnd'], '', { env })).code).toBe(0);
    expect(runs()).toBe(0);
    expect(readFileSync(join(telmoni(), `${IDE}.jsonl`), 'utf8').trim().split('\n')).toHaveLength(2);
  }, 30_000);

  it('records a workspace that is the home folder, whose hooks file is the person’s own', async () => {
    mkdirSync(join(home.path, '.cursor'), { recursive: true });
    const command = `'${process.execPath}' '${CLI}' hook postToolUse`;
    writeFileSync(join(home.path, '.cursor', 'hooks.json'), JSON.stringify({ version: 1, hooks: { postToolUse: [{ command }] } }));
    const env = { TELMONI_API_KEY: 'telmoni_test', CURSOR_PROJECT_DIR: home.path };
    expect((await run(['hook', 'postToolUse'], JSON.stringify(fixture('ide')[2]!.payload), { env })).stdout).toBe('{}');
    expect(readFileSync(join(telmoni(), `${IDE}.jsonl`), 'utf8').trim().split('\n')).toHaveLength(1);
  });
});

describe('setup, run as the bin', () => {
  it('writes hooks whose commands run the hook as Cursor runs them, and remove takes them out', async () => {
    const setup = await run(['setup'], '', { env: { TELMONI_API_KEY: KEY } });
    expect(setup.code).toBe(0);
    expect(setup.stdout).not.toContain(KEY);
    const cursor = join(home.path, '.cursor');
    const config = JSON.parse(readFileSync(join(cursor, 'hooks.json'), 'utf8')) as {
      hooks: Record<string, Array<{ command: string }>>;
    };
    const command = config.hooks['postToolUse']![0]!.command;
    const [, node, script] = /^'([^']+)' '([^']+)' hook postToolUse$/.exec(command) ?? [];
    expect(realpathSync(node!)).toBe(realpathSync(process.execPath));
    expect(script).toBe(CLI);
    // As Cursor runs a user's hook: through a shell, from Cursor's own folder, the key from the file setup wrote.
    const ran = await run([], JSON.stringify(fixture('ide')[2]!.payload), { command, cwd: cursor });
    expect(ran).toMatchObject({ code: 0, stdout: '{}' });
    expect(readFileSync(join(telmoni(), `${IDE}.jsonl`), 'utf8')).toContain('"tool_name":"Read"');
    const removed = await run(['remove'], '');
    expect(removed.code).toBe(0);
    expect(existsSync(join(cursor, 'hooks.json'))).toBe(false);
    expect(existsSync(join(cursor, 'telmoni.json'))).toBe(false);
    expect(existsSync(telmoni())).toBe(false);
  });

  it('prints how it is used, and refuses what it does not know', async () => {
    expect((await run(['--help'], '')).stdout).toMatch(/telmoni-cursor-observability setup \[--project\]/);
    expect((await run(['setup', '--everywhere'], '')).code).toBe(2);
  });
});
