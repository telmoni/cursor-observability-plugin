import { existsSync, mkdirSync, readFileSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { commandFor, isOurs } from '../src/hooks';
import { EVENTS } from '../src/input';
import { type Options, remove, setup } from '../src/setup';
import { tempDir } from './helpers';

/** A key of the shape the platform mints, and no key of anyone's. */
const KEY = `telmoni_${'Ab3dE6gH9j'.repeat(4)}K-_`;
const NODE = '/opt/node 22/bin/node';
const SCRIPT = '/opt/node 22/lib/node_modules/telmoni-cursor-observability-plugin/dist/telmoni-cursor-observability.mjs';

/** Another tool's hooks, among them two at events the plugin records too. */
const OTHERS = {
  version: 1,
  hooks: {
    afterFileEdit: [{ command: './hooks/format.sh' }],
    stop: [{ command: './hooks/audit.sh', loop_limit: 10 }],
    preToolUse: [{ command: 'node /opt/guard.js', matcher: 'Shell', failClosed: true }],
    postToolUse: [{ command: './hooks/count-tools.sh', timeout: 5 }],
  },
};

/** A hooks.json as Cursor's documentation writes one, as a tool writes one, and one emptied by hand. */
const FOUND = [
  '{\n  "version": 1,\n  "hooks": {\n    "afterFileEdit": [{ "command": "./hooks/format.sh" }],\n    "stop": [{ "command": "./audit.sh", "loop_limit": 10 }]\n  }\n}\n',
  JSON.stringify(OTHERS, null, 4),
  '{"version":1,"hooks":{}}',
];

let home: { path: string; remove: () => void };
let printed: string[];

beforeEach(() => {
  home = tempDir();
  printed = [];
});

afterEach(() => {
  home.remove();
});

function options(overrides: Partial<Options> = {}): Options {
  return {
    project: false,
    home: home.path,
    cwd: home.path,
    env: { TELMONI_API_KEY: KEY },
    node: NODE,
    script: SCRIPT,
    ask: undefined,
    print: (line) => void printed.push(line),
    ...overrides,
  };
}

const cursor = (): string => join(home.path, '.cursor');
const hooksFile = (): string => join(cursor(), 'hooks.json');
const keyFile = (): string => join(cursor(), 'telmoni.json');
const read = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8'));

function writeOthers(): void {
  mkdirSync(cursor(), { recursive: true });
  writeFileSync(hooksFile(), JSON.stringify(OTHERS, null, 4));
}

describe('setup', () => {
  it('adds the plugin’s hooks beside every other tool’s, and nothing more on a second run', async () => {
    writeOthers();
    expect(await setup(options())).toBe(0);
    const config = read(hooksFile()) as { version: number; hooks: Record<string, Array<Record<string, unknown>>> };
    expect(config.version).toBe(1);
    for (const event of EVENTS) {
      expect(config.hooks[event]!.at(-1)).toEqual({ command: `'${NODE}' '${SCRIPT}' hook ${event}`, timeout: 10 });
    }
    expect(config.hooks['stop']).toEqual([OTHERS.hooks.stop[0], { command: `'${NODE}' '${SCRIPT}' hook stop`, timeout: 10 }]);
    expect(config.hooks['afterFileEdit']).toEqual(OTHERS.hooks.afterFileEdit);
    expect(config.hooks['preToolUse']).toEqual(OTHERS.hooks.preToolUse);
    // Observe-only: none of the hooks whose answer can block the person.
    for (const permission of ['preToolUse', 'beforeShellExecution', 'beforeMCPExecution', 'beforeReadFile', 'beforeTabFileRead', 'subagentStart']) {
      expect(JSON.stringify(config.hooks[permission] ?? [])).not.toContain('telmoni-cursor-observability');
    }
    const once = readFileSync(hooksFile(), 'utf8');
    expect(await setup(options())).toBe(0);
    expect(readFileSync(hooksFile(), 'utf8')).toBe(once);
  });

  it('replaces its own hooks where the node or the bundle moved', async () => {
    writeOthers();
    await setup(options());
    await setup(options({ node: '/usr/bin/node', script: '/usr/lib/node_modules/telmoni-cursor-observability-plugin/dist/telmoni-cursor-observability.mjs' }));
    const config = read(hooksFile()) as { hooks: Record<string, Array<{ command: string }>> };
    expect(config.hooks['stop']!.map((entry) => entry.command)).toEqual([
      './hooks/audit.sh',
      `'/usr/bin/node' '/usr/lib/node_modules/telmoni-cursor-observability-plugin/dist/telmoni-cursor-observability.mjs' hook stop`,
    ]);
  });

  it('writes the key alone, mode 600, and never prints it', async () => {
    expect(await setup(options({ env: { TELMONI_API_KEY: ` ${KEY} `, TELMONI_ENDPOINT: 'https://telmoni.example.com' } }))).toBe(0);
    expect(read(keyFile())).toEqual({ apiKey: KEY, endpoint: 'https://telmoni.example.com' });
    expect(statSync(keyFile()).mode & 0o777).toBe(0o600);
    expect(printed.join('\n')).not.toContain(KEY);
    expect(printed.length).toBeGreaterThan(0);
  });

  it('asks for the key at a terminal, where Enter keeps the one saved', async () => {
    const asked: boolean[] = [];
    expect(await setup(options({ env: {}, ask: (saved) => (asked.push(saved), Promise.resolve(KEY)) }))).toBe(0);
    expect(await setup(options({ env: {}, ask: (saved) => (asked.push(saved), Promise.resolve('')) }))).toBe(0);
    expect(asked).toEqual([false, true]);
    expect(read(keyFile())).toEqual({ apiKey: KEY });
  });

  it('changes nothing for a key of the wrong shape, an endpoint the key would cross in the clear, or a file it cannot read', async () => {
    writeOthers();
    const before = readFileSync(hooksFile(), 'utf8');
    expect(await setup(options({ env: { TELMONI_API_KEY: 'sk-ant-not-a-telmoni-key' } }))).toBe(1);
    expect(await setup(options({ env: { TELMONI_API_KEY: `${KEY}x` } }))).toBe(1);
    expect(await setup(options({ env: { TELMONI_API_KEY: KEY, TELMONI_ENDPOINT: 'http://telmoni.example.com' } }))).toBe(1);
    expect(await setup(options({ env: {} }))).toBe(1);
    expect(readFileSync(hooksFile(), 'utf8')).toBe(before);
    expect(existsSync(keyFile())).toBe(false);
    writeFileSync(hooksFile(), '{"version": 1, "hooks": {"stop": {"command": "./audit.sh"}}}');
    expect(await setup(options())).toBe(1);
    writeFileSync(hooksFile(), '{"version": 1, "hooks": ');
    expect(await setup(options())).toBe(1);
    expect(existsSync(keyFile())).toBe(false);
    expect(printed.join('\n')).not.toContain(KEY);
  });

  it('takes plain HTTP to this machine alone: a Telmoni of one’s own', async () => {
    expect(await setup(options({ env: { TELMONI_API_KEY: KEY, TELMONI_ENDPOINT: 'http://127.0.0.1:8080' } }))).toBe(0);
    expect(await setup(options({ env: { TELMONI_API_KEY: KEY, TELMONI_ENDPOINT: 'http://localhost:8080' } }))).toBe(0);
    expect(await setup(options({ env: { TELMONI_API_KEY: KEY, TELMONI_ENDPOINT: 'http://[::1]:8080' } }))).toBe(0);
    expect(await setup(options({ env: { TELMONI_API_KEY: KEY, TELMONI_ENDPOINT: 'http://10.0.0.5:8080' } }))).toBe(1);
    expect(read(keyFile())).toEqual({ apiKey: KEY, endpoint: 'http://[::1]:8080' });
  });

  it('writes through a link to the file it names, so a hooks.json among dotfiles stays there', async () => {
    const dotfiles = join(home.path, 'dotfiles');
    mkdirSync(dotfiles);
    mkdirSync(cursor());
    writeFileSync(join(dotfiles, 'hooks.json'), JSON.stringify(OTHERS));
    symlinkSync(join(dotfiles, 'hooks.json'), hooksFile());
    await setup(options());
    expect(readFileSync(join(dotfiles, 'hooks.json'), 'utf8')).toContain('telmoni-cursor-observability');
    remove(options());
    expect(read(join(dotfiles, 'hooks.json'))).toEqual(OTHERS);
  });

  it('leaves a link it emptied pointing at a file, rather than at nothing', async () => {
    const dotfiles = join(home.path, 'dotfiles');
    mkdirSync(dotfiles);
    mkdirSync(cursor());
    writeFileSync(join(dotfiles, 'hooks.json'), '{"version": 1, "hooks": {}}');
    symlinkSync(join(dotfiles, 'hooks.json'), hooksFile());
    await setup(options());
    remove(options());
    expect(read(hooksFile())).toEqual({ version: 1, hooks: {} });
  });
});

describe('the command a hook runs', () => {
  it('quotes each path whole for a POSIX shell', () => {
    expect(commandFor('user', 'stop', "/home/o'brien/node", '/opt/x/telmoni-cursor-observability.mjs', 'linux')).toBe(
      `'/home/o'\\''brien/node' '/opt/x/telmoni-cursor-observability.mjs' hook stop`,
    );
  });

  it('calls the node with & for PowerShell, which Cursor runs a hook’s command in on Windows', () => {
    const command = commandFor(
      'user',
      'stop',
      'C:\\Program Files\\nodejs\\node.exe',
      'C:\\Users\\o’brien\\AppData\\Roaming\\npm\\node_modules\\telmoni-cursor-observability-plugin\\dist\\telmoni-cursor-observability.mjs',
      'win32',
    );
    expect(command).toBe(
      "& 'C:\\Program Files\\nodejs\\node.exe' 'C:\\Users\\o’’brien\\AppData\\Roaming\\npm\\node_modules\\telmoni-cursor-observability-plugin\\dist\\telmoni-cursor-observability.mjs' hook stop",
    );
    expect(isOurs({ command })).toBe(true);
  });

  it('runs the bin through PATH in a repository’s hooks, on every platform', () => {
    for (const platform of ['linux', 'darwin', 'win32'] as const) {
      expect(commandFor('project', 'stop', NODE, SCRIPT, platform)).toBe('telmoni-cursor-observability hook stop --project');
    }
  });
});

describe('setup --project', () => {
  it('writes the repository’s hooks, each the bin through PATH, and no key', async () => {
    const repository = join(home.path, 'work', 'repository');
    mkdirSync(join(repository, '.git'), { recursive: true });
    mkdirSync(join(repository, 'src', 'deep'), { recursive: true });
    const project = options({ project: true, cwd: join(repository, 'src', 'deep'), env: {} });
    expect(await setup(project)).toBe(0);
    const config = read(join(repository, '.cursor', 'hooks.json')) as { version: number; hooks: Record<string, unknown> };
    expect(config).toEqual({
      version: 1,
      hooks: Object.fromEntries(EVENTS.map((event) => [event, [{ command: `telmoni-cursor-observability hook ${event} --project`, timeout: 10 }]])),
    });
    expect(existsSync(keyFile())).toBe(false);
    expect(existsSync(hooksFile())).toBe(false);
    expect(remove(project)).toBe(0);
    expect(existsSync(join(repository, '.cursor', 'hooks.json'))).toBe(false);
  });
});

describe('remove', () => {
  it('takes out the plugin’s hooks, its key and its folder, and leaves every other tool’s as they were', async () => {
    writeOthers();
    await setup(options());
    mkdirSync(join(cursor(), 'telmoni'), { recursive: true });
    writeFileSync(join(cursor(), 'telmoni', 'hook.log'), '');
    expect(remove(options())).toBe(0);
    expect(read(hooksFile())).toEqual(OTHERS);
    expect(existsSync(keyFile())).toBe(false);
    expect(existsSync(join(cursor(), 'telmoni'))).toBe(false);
  });

  it('puts back the very bytes setup found, however they were written', async () => {
    for (const text of FOUND) {
      mkdirSync(cursor(), { recursive: true });
      writeFileSync(hooksFile(), text);
      expect(await setup(options())).toBe(0);
      expect(await setup(options({ node: '/usr/bin/node' }))).toBe(0);
      expect(readFileSync(hooksFile(), 'utf8')).not.toBe(text);
      expect(remove(options())).toBe(0);
      expect(readFileSync(hooksFile(), 'utf8')).toBe(text);
    }
  });

  it('puts back the very bytes of a repository’s hooks.json', async () => {
    const repository = join(home.path, 'repository');
    mkdirSync(join(repository, '.git'), { recursive: true });
    mkdirSync(join(repository, '.cursor'));
    const file = join(repository, '.cursor', 'hooks.json');
    writeFileSync(file, FOUND[0]!);
    const project = options({ project: true, cwd: repository, env: {} });
    expect(await setup(project)).toBe(0);
    expect(remove(project)).toBe(0);
    expect(readFileSync(file, 'utf8')).toBe(FOUND[0]);
  });

  it('keeps what another tool changed since setup, rather than put back what setup found', async () => {
    writeOthers();
    await setup(options());
    const config = read(hooksFile()) as { hooks: Record<string, unknown[]> };
    config.hooks['afterFileEdit'] = [{ command: './hooks/lint.sh' }];
    writeFileSync(hooksFile(), JSON.stringify(config));
    expect(remove(options())).toBe(0);
    expect(read(hooksFile())).toEqual({ ...OTHERS, hooks: { ...OTHERS.hooks, afterFileEdit: [{ command: './hooks/lint.sh' }] } });
  });

  it('deletes a hooks.json setup made, which holds nothing else', async () => {
    await setup(options());
    expect(existsSync(hooksFile())).toBe(true);
    expect(remove(options())).toBe(0);
    expect(existsSync(hooksFile())).toBe(false);
    expect(remove(options())).toBe(0);
  });
});
