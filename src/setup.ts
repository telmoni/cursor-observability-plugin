/**
 * `telmoni-cursor-observability setup` and `remove`: the plugin's hooks merged into
 * Cursor's `hooks.json`, the user's or, with `--project`, the repository's,
 * and the key written to `~/.cursor/telmoni.json`, mode `600`; then both taken
 * out again. The key's shape is checked here and nowhere is it sent: the first
 * turn's export is what tells whether the platform takes it, in `hook.log`.
 */

import { createHash } from 'node:crypto';
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
import { delimiter, dirname, isAbsolute, join, sep } from 'node:path';

import { Telmoni } from 'telmoni';

import {
  type HooksFile,
  type Scope,
  commandFor,
  holdsOurs,
  parseHooks,
  withOurs,
  withoutOursIn,
} from './hooks.js';
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

/** Why the SDK would not send to `endpoint`, in its own words, which name at most the host; nothing where it would. */
async function refusalOf(endpoint: string): Promise<string | undefined> {
  let client: Telmoni;
  try {
    client = new Telmoni({ endpoint });
  } catch (error) {
    if (error instanceof TypeError) return error.message;
    throw error;
  }
  await client.shutdown();
  return undefined;
}

/**
 * The node the user's hooks run: the one on `PATH` that is this one, a link
 * that outlives an upgrade as Homebrew's does; else this one by its own path.
 */
export function nodeOf(env: NodeJS.ProcessEnv): string {
  let running: string;
  try {
    running = realpathSync(process.execPath);
  } catch {
    return process.execPath;
  }
  const name = process.platform === 'win32' ? 'node.exe' : 'node';
  for (const dir of (env['PATH'] ?? '').split(delimiter)) {
    if (!isAbsolute(dir)) continue;
    try {
      if (realpathSync(join(dir, name)) === running) return join(dir, name);
    } catch {
      // No node there.
    }
  }
  return process.execPath;
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

/** What is in `path`, or nothing where it does not exist. */
function readText(path: string): string | undefined {
  try {
    return readFileSync(path, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}

/** Written aside and renamed over, so Cursor, which reloads the file as it changes, never reads half of it. */
function writeAtomically(path: string, text: string, mode: number): void {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.telmoni-${process.pid}`;
  writeFileSync(temporary, text, { mode });
  renameSync(temporary, path);
}

/** Written through a link to the file it names, in the mode that file had. */
function writeThrough(path: string, text: string): void {
  const target = targetOf(path);
  const mode = existsSync(target) ? statSync(target).mode & 0o777 : 0o644;
  writeAtomically(target, text, mode);
}

function writeHooks(path: string, config: HooksFile): void {
  writeThrough(path, `${JSON.stringify(config, null, 2)}\n`);
}

/**
 * Where setup keeps a hooks file as it found it, before it first added the
 * plugin's hooks: remove, finding the file as setup left it, puts back its
 * very bytes rather than the same hooks written out afresh.
 */
function foundOf(file: string, home: string): string {
  return join(pathsOf(home).dir, `hooks.json.found-${createHash('sha256').update(file).digest('hex').slice(0, 16)}`);
}

function keepFound(file: string, home: string, text: string | undefined): void {
  mkdirSync(pathsOf(home).dir, { recursive: true, mode: 0o700 });
  writeAtomically(foundOf(file, home), JSON.stringify({ text: text ?? null }), 0o600);
}

/** The text setup found, where it kept it and the file was there. */
function readFound(path: string): string | undefined {
  try {
    const { text } = JSON.parse(readFileSync(path, 'utf8')) as { text?: unknown };
    return typeof text === 'string' ? text : undefined;
  } catch {
    return undefined;
  }
}

/** Whether two values read from JSON hold the same, whatever the order of their keys. */
function same(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length && keys.every((key) => Object.hasOwn(right, key) && same(left[key], right[key]));
}

/** What remove leaves of the file setup made from `text`. */
function leftOf(text: string): HooksFile | string | undefined {
  const config = parseHooks(text);
  return typeof config === 'string' ? config : withoutOursIn(withOurs(config, new Map()));
}

export async function setup(options: Options): Promise<number> {
  const { print } = options;
  const file = hooksFileOf(options);
  const text = readText(file);
  const config = text === undefined ? undefined : parseHooks(text);
  if (typeof config === 'string') {
    print(`${shown(file, options.home)} ${config}; fix it or move it aside, then run setup again. Nothing was changed.`);
    return 1;
  }
  const scope: Scope = options.project ? 'project' : 'user';
  const commands = new Map(EVENTS.map((event) => [event, commandFor(scope, event, options.node, options.script)]));
  const merged = withOurs(config ?? {}, commands);
  // Kept once, before the plugin's hooks first went in; a second run finds them there.
  const found = config === undefined || !holdsOurs(config);
  if (options.project) {
    if (found) keepFound(file, options.home, text);
    writeHooks(file, merged);
    print(`Cursor's hooks for this repository: ${shown(file, options.home)}. Commit it.`);
    print(
      "Cloud agents run it once their environment has the package — npm install -g @telmoni/cursor-observability-plugin in .cursor/environment.json's install step — and the key, as the Cloud Agents secret TELMONI_API_KEY.",
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
  const refused = endpoint === undefined ? undefined : await refusalOf(endpoint);
  if (refused !== undefined) {
    print(`TELMONI_ENDPOINT is not one the SDK sends to: ${refused}. Nothing was changed.`);
    return 1;
  }
  const key: KeyFile = { apiKey };
  if (endpoint !== undefined) key.endpoint = endpoint;
  writeAtomically(paths.keyFile, `${JSON.stringify(key, null, 2)}\n`, 0o600);
  if (found) keepFound(file, options.home, text);
  writeHooks(file, merged);
  print(`Cursor's hooks: ${shown(file, options.home)}. Your key: ${shown(paths.keyFile, options.home)}.`);
  print('Each turn of a Cursor agent conversation is recorded in Telmoni from your next prompt.');
  return 0;
}

export function remove(options: Options): number {
  const { print } = options;
  const file = hooksFileOf(options);
  const text = readText(file);
  const config = text === undefined ? undefined : parseHooks(text);
  if (typeof config === 'string') {
    print(`${shown(file, options.home)} ${config}; take the telmoni-cursor-observability entries out by hand. Nothing was changed.`);
    return 1;
  }
  const kept = foundOf(file, options.home);
  if (config !== undefined) {
    const left = withoutOursIn(config);
    const found = readFound(kept);
    // As setup left it: what it found, to the byte. A file that held the
    // plugin's hooks alone goes, unless it is a link, which would be left
    // pointing at nothing.
    if (found !== undefined && same(left, leftOf(found))) writeThrough(file, found);
    else if (left === undefined && !lstatSync(file).isSymbolicLink()) rmSync(file, { force: true });
    else writeHooks(file, left ?? { version: 1, hooks: {} });
  }
  rmSync(kept, { force: true });
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
