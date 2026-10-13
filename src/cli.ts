#!/usr/bin/env node
/**
 * `telmoni-cursor-observability`: `setup` writes the plugin's hooks into Cursor's
 * `hooks.json` and the key beside it, `remove` takes them out again, and
 * `hook <event>` is what Cursor runs at each event.
 */

import { realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { delimiter, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { hook } from './hook.js';

/** The bundle itself, resolved past the bin's link: what the user's hooks and the detached copy run. */
const SCRIPT = fileURLToPath(import.meta.url);

const USAGE = `Usage:
  telmoni-cursor-observability setup [--project]   Record Cursor's agent conversations in Telmoni: write the hooks
                                     into ~/.cursor/hooks.json and the key (TELMONI_API_KEY, or typed)
                                     into ~/.cursor/telmoni.json; with --project, write the hooks into
                                     this repository's .cursor/hooks.json, which cloud agents read.
  telmoni-cursor-observability remove [--project]  Take it all out again: the hooks, the key and the plugin's folder;
                                     with --project, the repository's hooks alone.
  telmoni-cursor-observability hook <event>        What Cursor runs at each event.
`;

/**
 * The node the user's hooks run: the one on `PATH` where it is this one — a
 * link that outlives an upgrade, as Homebrew's does — else this one by its
 * own path.
 */
function nodeOf(env: NodeJS.ProcessEnv): string {
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

const [command, ...args] = process.argv.slice(2);

if (command === 'hook') {
  await hook(args, SCRIPT);
  // Nothing Cursor could see: whatever happened is in hook.log.
  process.exitCode = 0;
} else if ((command === 'setup' || command === 'remove') && args.every((arg) => arg === '--project')) {
  // Imported here, not above: Cursor waits on every hook, and a hook needs none of it.
  const { askKey, remove, setup } = await import('./setup.js');
  const options = {
    project: args.includes('--project'),
    home: homedir(),
    cwd: process.cwd(),
    env: process.env,
    node: nodeOf(process.env),
    script: SCRIPT,
    ask: process.stdin.isTTY ? askKey : undefined,
    print: (line: string): void => void process.stdout.write(`${line}\n`),
  };
  try {
    process.exitCode = command === 'setup' ? await setup(options) : remove(options);
  } catch (error) {
    process.stderr.write(`telmoni-cursor-observability ${command}: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
} else if (command === undefined || command === 'help' || command === '--help' || command === '-h') {
  process.stdout.write(USAGE);
} else {
  process.stderr.write(USAGE);
  process.exitCode = 2;
}
