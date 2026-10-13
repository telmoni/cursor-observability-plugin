/**
 * The built binary, run as Cursor runs a hook: a process handed the event on
 * stdin, which must answer and exit at once, while at a turn's end a detached
 * copy of it sends.
 */

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { EVENTS } from '../src/input';
import { runIdOf } from '../src/record';
import { FakeIngest, PLANTED, type Step, attributesOf, fixture, tempDir } from './helpers';

const CLI = fileURLToPath(new URL('../dist/telmoni-cursor-observability.mjs', import.meta.url));
const IDE = '7f3c2a10-5b4e-4c61-9d2a-0e8f1b2c3d4e';
const HEADLESS = '5e6f7a8b-9c0d-4e1f-8a2b-3c4d5e6f7a8b';
const KEY = `telmoni_${'Ab3dE6gH9j'.repeat(4)}K-_`;

let home: { path: string; remove: () => void };
let ingest: FakeIngest;
let endpoint: string;

beforeEach(async () => {
  home = tempDir();
  ingest = new FakeIngest();
  endpoint = await ingest.start();
});

afterEach(async () => {
  await ingest.stop();
  home.remove();
});

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

/** Long enough for a detached copy, which waits a second for the turn's last hooks, to finish. */
const copiesDone = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 2_500));

const telmoni = (): string => join(home.path, '.cursor', 'telmoni');
const listing = (): string => (existsSync(telmoni()) ? readdirSync(telmoni()).sort().join(' ') : '');
const runs = (): number => ingest.spans().filter((span) => span.name === 'invoke_agent cursor').length;

describe('the hook', () => {
  it('answers each event as Cursor reads it, at once, and exits 0', async () => {
    expect(existsSync(CLI), 'build the plugin first: npm run build').toBe(true);
    for (const event of EVENTS) {
      const { code, ms, stdout } = await run(['hook', event], JSON.stringify({ hook_event_name: event, conversation_id: 'c-1' }));
      expect(code).toBe(0);
      expect(stdout).toBe(event === 'beforeSubmitPrompt' ? '{"continue":true}' : '{}');
      expect(ms).toBeLessThan(1500);
    }
    await copiesDone();
  }, 15_000);

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

  it('records a whole conversation: each turn sent by a detached copy as it ends, the spool emptied, nothing said kept', async () => {
    const ran = await conversation(fixture('ide'), { TELMONI_API_KEY: 'telmoni_test', TELMONI_ENDPOINT: endpoint });
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
    // The session's end started a copy too, which found nothing left to send.
    await copiesDone();
    expect(runs()).toBe(3);
    expect(listing()).toBe(`${IDE}.json`);
  }, 40_000);

  it('closes a headless session’s turn at the session’s end, with no stop', async () => {
    const ran = await conversation(fixture('headless'), { TELMONI_API_KEY: 'telmoni_test', TELMONI_ENDPOINT: endpoint });
    expect(ran.every(({ code }) => code === 0)).toBe(true);
    expect(await until(() => runs() === 1 && listing() === `${HEADLESS}.json`, 20_000)).toBe(true);
    const names = ingest.spans().map((span) => span.name);
    expect(names.filter((name) => name.startsWith('execute_tool '))).toEqual(['execute_tool Grep', 'execute_tool Read']);
    expect(names).toContain('chat composer-2.5');
    await copiesDone();
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

  it('stands aside where the workspace’s own hooks run the plugin, which then record alone', async () => {
    const project = join(home.path, 'repository');
    mkdirSync(join(project, '.cursor'), { recursive: true });
    writeFileSync(
      join(project, '.cursor', 'hooks.json'),
      JSON.stringify({ version: 1, hooks: { postToolUse: [{ command: 'telmoni-cursor-observability hook postToolUse --project' }] } }),
    );
    const env = { TELMONI_API_KEY: 'telmoni_test', CURSOR_PROJECT_DIR: project };
    const payload = JSON.stringify(fixture('ide')[2]!.payload);
    expect((await run(['hook', 'postToolUse'], payload, { env })).stdout).toBe('{}');
    expect(existsSync(join(telmoni(), `${IDE}.jsonl`))).toBe(false);
    expect((await run(['hook', 'postToolUse', '--project'], payload, { env })).stdout).toBe('{}');
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
