/**
 * Where the plugin sends, and where it keeps its state: the SDKs' own variables first — how a cloud agent is handed its
 * key, as a secret — then the key file `telmoni-cursor-observability setup` writes, `~/.cursor/telmoni.json`.
 */

import { closeSync, constants, fstatSync, openSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { kindOf } from './log.js';

export interface Settings {
  apiKey: string | undefined;
  /** Unset, the SDK's own default, Telmoni's machine host. */
  endpoint: string | undefined;
  /** The plugin's folder: each conversation's spool and state, the locks and `hook.log`. */
  dir: string;
  /** What kept the key file from being read, where it is there and was not. */
  keyFileProblem?: string;
}

/** The files the plugin reads and writes in Cursor's own folder. */
export interface Paths {
  hooks: string;
  /** The key and the endpoint, mode `600`. */
  keyFile: string;
  /** The plugin's folder. */
  dir: string;
}

export function pathsOf(home: string = homedir()): Paths {
  const cursor = join(home, '.cursor');
  return {
    hooks: join(cursor, 'hooks.json'),
    keyFile: join(cursor, 'telmoni.json'),
    dir: join(cursor, 'telmoni'),
  };
}

export interface KeyFile {
  apiKey?: string;
  endpoint?: string;
  /** What kept the file from being read, where it is there and was not. */
  problem?: string;
}

/** A key file larger than this is not the plugin's two settings. */
const MAX_KEY_FILE_BYTES = 64 * 1024;

/**
 * The key file as `setup` wrote it, read only where it is the person's own and shut to everyone else, as `ssh` reads a
 * key: one others could write could name an endpoint of theirs. Nothing where it is missing.
 */
export function readKeyFile(path: string): KeyFile {
  let fd: number;
  try {
    // Without blocking, so a FIFO at the path cannot hold the hook until something writes to it.
    fd = openSync(path, constants.O_RDONLY | constants.O_NONBLOCK);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT' || code === 'ENOTDIR') return {};
    if (code === 'EISDIR') return { problem: 'not a file' };
    return { problem: `unreadable (${kindOf(error)})` };
  }
  let parsed: unknown;
  try {
    // Checked on the descriptor it is read from, so the file checked is the file read.
    const stat = fstatSync(fd);
    if (!stat.isFile()) return { problem: 'not a file' };
    if (process.platform !== 'win32') {
      // The owner first: another's file is not the person's to chmod.
      const uid = process.getuid?.();
      if (uid !== undefined && stat.uid !== uid) return { problem: 'owned by another user' };
      if ((stat.mode & 0o077) !== 0) return { problem: 'open to other users; chmod 600 it' };
    }
    if (stat.size > MAX_KEY_FILE_BYTES) return { problem: 'too large' };
    parsed = JSON.parse(readFileSync(fd, 'utf8'));
  } catch (error) {
    return { problem: error instanceof SyntaxError ? 'not JSON' : `unreadable (${kindOf(error)})` };
  } finally {
    closeSync(fd);
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return { problem: 'not a JSON object' };
  const fields = parsed as Record<string, unknown>;
  const out: KeyFile = {};
  for (const field of ['apiKey', 'endpoint'] as const) {
    const given = fields[field];
    if (given === undefined) continue;
    const value = typeof given === 'string' ? given.trim() : '';
    // Passed over as unset, an endpoint meant would give way to the default, and the key go there.
    if (value === '') return { problem: `${field} empty or not a string` };
    out[field] = value;
  }
  return out;
}

export function settingsFrom(env: NodeJS.ProcessEnv, home: string = homedir()): Settings {
  const paths = pathsOf(home);
  const fromEnv = (name: string): string | undefined => env[name]?.trim() || undefined;
  let file: KeyFile | undefined;
  const saved = (): KeyFile => (file ??= readKeyFile(paths.keyFile));
  const settings: Settings = {
    apiKey: fromEnv('TELMONI_API_KEY') ?? saved().apiKey,
    endpoint: fromEnv('TELMONI_ENDPOINT') ?? saved().endpoint,
    dir: paths.dir,
  };
  const problem = file?.problem;
  if (problem !== undefined) settings.keyFileProblem = problem;
  return settings;
}
