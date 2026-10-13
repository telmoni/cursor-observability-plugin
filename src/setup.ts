/**
 * `telmoni-cursor-observability setup` and `remove`: the plugin's hooks merged into
 * Cursor's `hooks.json`, the user's or, with `--project`, the repository's,
 * and the key written to `~/.cursor/telmoni.json`, mode `600`; then both taken
 * out again. The key's shape is checked here and nowhere is it sent: the first
 * turn's export is what tells whether the platform takes it, in `hook.log`.
 */

import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { isIP } from 'node:net';
import { dirname, join, sep } from 'node:path';

import { type HooksFile, type Scope, commandFor, parseHooks, withOurs, withoutOursIn } from './hooks.js';
import { EVENTS } from './input.js';
import { type KeyFile, pathsOf, readKeyFile } from './settings.js';

export interface Options {
  project: boolean;
  home: string;
  cwd: string;
  env: NodeJS.ProcessEnv;
  /** The node and the bundle the user's own hooks run. */
  node: string;
  script: string;
  /** Asks for the key without echoing it, saying whether Enter keeps a saved one; none where there is no terminal to ask at. */
  ask: ((saved: boolean) => Promise<string>) | undefined;
  print: (line: string) => void;
}

/** As the platform mints a key: `telmoni_` and 32 random bytes in URL-safe base64. */
const KEY = /^telmoni_[A-Za-z0-9_-]{43}$/;

/** As the SDK sends: HTTPS, or plain HTTP to this machine alone, since every export carries the key. */
function isEndpoint(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol === 'https:') return true;
  if (url.protocol !== 'http:') return false;
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (isIP(host) === 4) return host.startsWith('127.');
  if (isIP(host) === 6) return host === '::1';
  return host === 'localhost' || host.endsWith('.localhost');
}

/** The repository the working folder is in, whose root holds the `.cursor` its cloud agents read; else the folder itself. */
function repositoryOf(cwd: string): string {
  for (let dir = cwd; ; dir = dirname(dir)) {
    if (existsSync(join(dir, '.git'))) return dir;
    if (dirname(dir) === dir) return cwd;
  }
}

function hooksFileOf(options: Options): string {
  return options.project ? join(repositoryOf(options.cwd), '.cursor', 'hooks.json') : pathsOf(options.home).hooks;
}

/** A path as the person knows it: their home folder as `~`. */
function shown(path: string, home: string): string {
  return path === home || path.startsWith(`${home}${sep}`) ? `~${path.slice(home.length)}` : path;
}

/** The file to write: a link's target, so a `hooks.json` kept among someone's dotfiles stays there. */
function targetOf(path: string): string {
  return existsSync(path) ? realpathSync(path) : path;
}

/** What is in `path`, a reason it cannot be added to, or nothing where it does not exist. */
function readHooks(path: string): HooksFile | string | undefined {
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
  return parseHooks(text);
}

/** Written aside and renamed over, so Cursor, which reloads the file as it changes, never reads half of it. */
function writeAtomically(path: string, text: string, mode: number): void {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.telmoni-${process.pid}`;
  writeFileSync(temporary, text, { mode });
  renameSync(temporary, path);
}

function writeHooks(path: string, config: HooksFile): void {
  const target = targetOf(path);
  const mode = existsSync(target) ? statSync(target).mode & 0o777 : 0o644;
  writeAtomically(target, `${JSON.stringify(config, null, 2)}\n`, mode);
}

export async function setup(options: Options): Promise<number> {
  const { print } = options;
  const file = hooksFileOf(options);
  const config = readHooks(file);
  if (typeof config === 'string') {
    print(`${shown(file, options.home)} ${config}; fix it or move it aside, then run setup again. Nothing was changed.`);
    return 1;
  }
  const scope: Scope = options.project ? 'project' : 'user';
  const commands = new Map(EVENTS.map((event) => [event, commandFor(scope, event, options.node, options.script)]));
  const merged = withOurs(config ?? {}, commands);
  if (options.project) {
    writeHooks(file, merged);
    print(`Cursor's hooks for this repository: ${shown(file, options.home)}. Commit it.`);
    print(
      "Cloud agents run it once their environment has the package — npm install -g telmoni-cursor-observability-plugin in .cursor/environment.json's install step — and the key, as the Cloud Agents secret TELMONI_API_KEY.",
    );
    print('On your own machine, telmoni-cursor-observability setup gives these hooks your key.');
    return 0;
  }
  const paths = pathsOf(options.home);
  const saved = readKeyFile(paths.keyFile);
  let apiKey = options.env['TELMONI_API_KEY']?.trim() || undefined;
  if (apiKey === undefined && options.ask !== undefined) {
    apiKey = (await options.ask(saved.apiKey !== undefined)).trim() || undefined;
  }
  apiKey ??= saved.apiKey;
  if (apiKey === undefined) {
    print('No key: set TELMONI_API_KEY, or run telmoni-cursor-observability setup in a terminal to type it. Nothing was changed.');
    return 1;
  }
  if (!KEY.test(apiKey)) {
    print(
      "That is not a Telmoni API key: a project's key starts telmoni_ and runs 51 characters. Make one holding the ingest scope on your project's API keys page. Nothing was changed.",
    );
    return 1;
  }
  const endpoint = options.env['TELMONI_ENDPOINT']?.trim() || saved.endpoint;
  if (endpoint !== undefined && !isEndpoint(endpoint)) {
    print('TELMONI_ENDPOINT must be an https:// address, or http:// to this machine. Nothing was changed.');
    return 1;
  }
  const key: KeyFile = { apiKey };
  if (endpoint !== undefined) key.endpoint = endpoint;
  writeAtomically(paths.keyFile, `${JSON.stringify(key, null, 2)}\n`, 0o600);
  writeHooks(file, merged);
  print(`Cursor's hooks: ${shown(file, options.home)}. Your key: ${shown(paths.keyFile, options.home)}.`);
  print('Each turn of a Cursor agent conversation is recorded in Telmoni from your next prompt.');
  return 0;
}

export function remove(options: Options): number {
  const { print } = options;
  const file = hooksFileOf(options);
  const config = readHooks(file);
  if (typeof config === 'string') {
    print(`${shown(file, options.home)} ${config}; take the telmoni-cursor-observability entries out by hand. Nothing was changed.`);
    return 1;
  }
  if (config !== undefined) {
    const left = withoutOursIn(config);
    // A file that held the plugin's hooks alone goes, unless it is a link,
    // which would be left pointing at nothing.
    if (left === undefined && !lstatSync(file).isSymbolicLink()) rmSync(file, { force: true });
    else writeHooks(file, left ?? { version: 1, hooks: {} });
  }
  print(`Taken out of ${shown(file, options.home)}.`);
  if (!options.project) {
    const paths = pathsOf(options.home);
    rmSync(paths.keyFile, { force: true });
    rmSync(paths.dir, { recursive: true, force: true });
    print(`Deleted your key, ${shown(paths.keyFile, options.home)}, and the plugin's folder, ${shown(paths.dir, options.home)}.`);
  }
  return 0;
}

/** The key, typed at the terminal with nothing echoed; Ctrl-C leaves without a change. */
export function askKey(saved: boolean): Promise<string> {
  const input = process.stdin;
  process.stderr.write(`Telmoni API key, holding the ingest scope${saved ? ' (Enter keeps the one saved)' : ''}: `);
  input.setRawMode(true);
  input.setEncoding('utf8');
  input.resume();
  return new Promise((resolve) => {
    let value = '';
    const done = (): void => {
      input.removeListener('data', onData);
      input.setRawMode(false);
      input.pause();
      process.stderr.write('\n');
    };
    const onData = (chunk: string): void => {
      for (const character of chunk) {
        if (character === '\r' || character === '\n' || character === '\u0004') {
          done();
          resolve(value);
          return;
        }
        if (character === '\u0003') {
          done();
          process.exit(130);
        }
        if (character === '\u007f' || character === '\b') value = value.slice(0, -1);
        else if (character >= ' ') value += character;
      }
    };
    input.on('data', onData);
  });
}
