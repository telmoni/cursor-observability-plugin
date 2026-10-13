/**
 * Cursor's `hooks.json`, the user's (`~/.cursor/hooks.json`) or a
 * repository's (`.cursor/hooks.json`), and the plugin's entries in it, told
 * apart from every other tool's by the command they run: setup adds them again
 * without doubling them, and remove takes them out leaving the rest as it was.
 */

import { type CursorEvent, EVENTS } from './input.js';

/** Seconds. The hook answers in tens of milliseconds and sends nothing itself. */
const TIMEOUT_S = 10;

export type Scope = 'user' | 'project';

export interface HooksFile {
  version?: unknown;
  hooks?: Record<string, unknown>;
  [key: string]: unknown;
}

/** The plugin's bundle (`telmoni-cursor-observability.mjs`) or its installed bin (`telmoni-cursor-observability`), run as `hook <event>`. */
const OURS = /telmoni-cursor-observability(?:\.mjs)?["']?\s+hook\s/;

export function isOurs(entry: unknown): boolean {
  if (entry === null || typeof entry !== 'object') return false;
  const command = (entry as { command?: unknown }).command;
  return typeof command === 'string' && OURS.test(command);
}

/**
 * A path as the shell Cursor runs a hook's command in reads it whole: in
 * single quotes, inside which a POSIX shell expands nothing, and PowerShell,
 * which Cursor runs the command in on Windows, nothing but a quote doubled —
 * any of its four typographic single quotes among them.
 */
function quote(path: string, platform: NodeJS.Platform): string {
  return platform === 'win32' ? `'${path.replace(/['\u2018-\u201b]/g, '$&$&')}'` : `'${path.replaceAll("'", "'\\''")}'`;
}

/**
 * The user's own hooks run the node that ran setup and the installed bundle,
 * both by absolute path, since Cursor opened from the Dock or a launcher has
 * no shell's `PATH`; PowerShell reads a quoted path opening a command as a
 * string, not a program, unless `&` calls it. A repository's run the bin
 * through `PATH`, since they run on teammates' machines and in cloud agents'
 * VMs, wherever each installed it; `--project` tells the hook which it is.
 */
export function commandFor(
  scope: Scope,
  event: CursorEvent,
  node: string,
  script: string,
  platform: NodeJS.Platform = process.platform,
): string {
  if (scope === 'project') return `telmoni-cursor-observability hook ${event} --project`;
  const call = `${quote(node, platform)} ${quote(script, platform)} hook ${event}`;
  return platform === 'win32' ? `& ${call}` : call;
}

/** The file as Cursor reads it, or why the plugin cannot add to it without breaking it. */
export function parseHooks(text: string): HooksFile | string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return 'is not JSON';
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return 'is not a JSON object';
  const config = parsed as HooksFile;
  if (config.hooks === undefined) return config;
  if (config.hooks === null || typeof config.hooks !== 'object' || Array.isArray(config.hooks)) {
    return 'has a "hooks" that is not an object';
  }
  for (const event of EVENTS) {
    const entries = config.hooks[event];
    if (entries !== undefined && !Array.isArray(entries)) return `has a "${event}" that is not a list`;
  }
  return config;
}

function withoutOurs(hooks: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [event, entries] of Object.entries(hooks)) {
    if (!Array.isArray(entries) || !entries.some(isOurs)) {
      out[event] = entries;
      continue;
    }
    const kept = entries.filter((entry) => !isOurs(entry));
    // An event that held the plugin's entry alone was added for it.
    if (kept.length > 0) out[event] = kept;
  }
  return out;
}

/** `config` with the plugin's entries for every event it records, and every other tool's as they were. */
export function withOurs(config: HooksFile, commands: ReadonlyMap<CursorEvent, string>): HooksFile {
  const hooks = withoutOurs(config.hooks ?? {});
  for (const [event, command] of commands) {
    const entries = (hooks[event] as unknown[] | undefined) ?? [];
    hooks[event] = [...entries, { command, timeout: TIMEOUT_S }];
  }
  return { version: 1, ...config, hooks };
}

/** `config` with the plugin's entries taken out; nothing where nothing else was left. */
export function withoutOursIn(config: HooksFile): HooksFile | undefined {
  const hooks = withoutOurs(config.hooks ?? {});
  const others = Object.keys(config).filter((key) => key !== 'version' && key !== 'hooks');
  if (Object.keys(hooks).length === 0 && others.length === 0) return undefined;
  return { ...config, hooks };
}

/** Whether any of `config`'s hooks is the plugin's. */
export function holdsOurs(config: HooksFile): boolean {
  return Object.values(config.hooks ?? {}).some((entries) => Array.isArray(entries) && entries.some(isOurs));
}

/** A repository's own entry, as `setup --project` writes one. */
const PROJECT = /\s--project(?:\s|$)/;

/**
 * Whether `config` runs the plugin at `event` as a repository's hooks do. A
 * workspace that is the home folder has the person's own hooks file for its
 * `.cursor/hooks.json`, whose entries are no repository's.
 */
export function registersProject(config: unknown, event: CursorEvent): boolean {
  if (config === null || typeof config !== 'object') return false;
  const hooks = (config as HooksFile).hooks;
  if (hooks === null || typeof hooks !== 'object') return false;
  const entries = (hooks as Record<string, unknown>)[event];
  return Array.isArray(entries) && entries.some((entry) => isOurs(entry) && PROJECT.test((entry as { command: string }).command));
}
