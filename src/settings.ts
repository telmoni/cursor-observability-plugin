/**
 * Where the plugin sends, and where it keeps its state: the SDKs' own
 * variables first — how a cloud agent is handed its key, as a secret — then
 * the key file `telmoni-cursor-observability setup` writes, `~/.cursor/telmoni.json`.
 */

import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export interface Settings {
  apiKey: string | undefined;
  /** Unset, the SDK's own default, Telmoni's machine host. */
  endpoint: string | undefined;
  /** The plugin's folder: each conversation's spool and state, the locks and `hook.log`. */
  dir: string;
}

/** The files the plugin reads and writes in Cursor's own folder. */
export interface Paths {
  /** `~/.cursor`, whose `hooks.json` the editor's agent reads. */
  cursor: string;
  hooks: string;
  /** The key and the endpoint, mode `600`. */
  keyFile: string;
  /** The plugin's folder. */
  dir: string;
}

export function pathsOf(home: string = homedir()): Paths {
  const cursor = join(home, '.cursor');
  return {
    cursor,
    hooks: join(cursor, 'hooks.json'),
    keyFile: join(cursor, 'telmoni.json'),
    dir: join(cursor, 'telmoni'),
  };
}

export interface KeyFile {
  apiKey?: string;
  endpoint?: string;
}

/** The key file as `setup` wrote it; nothing where it is missing or not the plugin's. */
export function readKeyFile(path: string): KeyFile {
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as unknown;
    if (parsed === null || typeof parsed !== 'object') return {};
    const fields = parsed as Record<string, unknown>;
    const out: KeyFile = {};
    const apiKey = typeof fields['apiKey'] === 'string' ? fields['apiKey'].trim() : '';
    const endpoint = typeof fields['endpoint'] === 'string' ? fields['endpoint'].trim() : '';
    if (apiKey) out.apiKey = apiKey;
    if (endpoint) out.endpoint = endpoint;
    return out;
  } catch {
    return {};
  }
}

export function settingsFrom(env: NodeJS.ProcessEnv, home: string = homedir()): Settings {
  const paths = pathsOf(home);
  const fromEnv = (name: string): string | undefined => env[name]?.trim() || undefined;
  let file: KeyFile | undefined;
  const saved = (): KeyFile => (file ??= readKeyFile(paths.keyFile));
  return {
    apiKey: fromEnv('TELMONI_API_KEY') ?? saved().apiKey,
    endpoint: fromEnv('TELMONI_ENDPOINT') ?? saved().endpoint,
    dir: paths.dir,
  };
}
