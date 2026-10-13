/**
 * What Cursor runs at each event the plugin is registered for:
 * `telmoni-cursor-observability hook <event>`.
 *
 * It answers Cursor first, keeps what may be kept of the event in the
 * conversation's spool, and at `stop` and `sessionEnd` starts a detached copy
 * of itself, handing it the conversation, then exits. Cursor waits on its
 * hooks, on one per tool call among them, so the hook never loads the SDK and
 * never waits on the network: the copy waits for the turn's last hooks to
 * finish, then sends what has ended (`session.ts`).
 */

import { readFileSync, readSync, writeSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';

import { registersProject } from './hooks.js';
import { CLOSING, type CursorEvent, answerFor, isEvent, isId, received } from './input.js';
import { kindOf, log } from './log.js';
import type { HookInput } from './session.js';
import { type Settings, settingsFrom } from './settings.js';
import { append, sweep } from './spool.js';

/** How the detached copy is handed its input: in its environment, never on its command line, which anyone on the machine may list. */
const HANDOFF = 'TELMONI_CURSOR_HOOK_INPUT';
/** A tool's whole output can ride in its event: past this, the event is passed over. */
const MAX_INPUT_BYTES = 16 * 1024 * 1024;
const INPUT_WAIT_MS = 5_000;
/** Cursor runs a turn's last hooks side by side: the last reply's may finish after the `stop`'s. */
const SETTLE_MS = 1_000;

/**
 * A line's id: unique within one conversation's spool, which is all it must
 * be, without loading `crypto` into a hook Cursor waits on.
 */
function lineId(): string {
  return Math.floor(Math.random() * 2 ** 48)
    .toString(16)
    .padStart(12, '0');
}

function streamed(chunks: Buffer[], size: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('no hook input')), INPUT_WAIT_MS);
    process.stdin.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_INPUT_BYTES) {
        clearTimeout(timer);
        reject(new RangeError('hook input too large'));
        process.stdin.destroy();
        return;
      }
      chunks.push(chunk);
    });
    process.stdin.on('end', () => {
      clearTimeout(timer);
      resolve(Buffer.concat(chunks).toString('utf8'));
    });
    process.stdin.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

/**
 * What Cursor wrote on stdin, read to its end. Read straight from the file
 * descriptor: `process.stdin`, a socket's stream, costs a hook Cursor waits
 * on more than the rest of its work, and is used only where the pipe will
 * not block.
 */
function readInput(): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  const buffer = Buffer.allocUnsafe(64 * 1024);
  for (;;) {
    let read: number;
    try {
      read = readSync(0, buffer, 0, buffer.length, null);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'EAGAIN') return streamed(chunks, size);
      if (code === 'EOF') break;
      throw error;
    }
    if (read === 0) break;
    size += read;
    if (size > MAX_INPUT_BYTES) throw new RangeError('hook input too large');
    chunks.push(Buffer.from(buffer.subarray(0, read)));
  }
  return Promise.resolve(Buffer.concat(chunks).toString('utf8'));
}

/**
 * Whether the workspace's own hooks run the plugin at `event` too. Cursor
 * runs the user's and the workspace's both, and a cloud agent the workspace's
 * alone, so where both are set up the workspace's record the conversation and
 * the user's stand aside, rather than every event be kept twice.
 */
function projectRuns(env: NodeJS.ProcessEnv, event: CursorEvent): boolean {
  const root = env['CURSOR_PROJECT_DIR']?.trim();
  if (!root || !isAbsolute(root)) return false;
  try {
    return registersProject(JSON.parse(readFileSync(join(root, '.cursor', 'hooks.json'), 'utf8')), event);
  } catch {
    return false;
  }
}

function handedOffFrom(raw: unknown): HookInput | undefined {
  if (raw === null || typeof raw !== 'object') return undefined;
  const fields = raw as Record<string, unknown>;
  const event = fields['event'];
  const conversationId = fields['conversation_id'];
  if ((event !== 'stop' && event !== 'sessionEnd') || !isId(conversationId)) return undefined;
  return { event, conversationId };
}

async function copy(handedOff: string, env: NodeJS.ProcessEnv): Promise<void> {
  let settings: Settings;
  try {
    settings = settingsFrom(env);
  } catch {
    // No home folder to keep anything in, nor to say so.
    return;
  }
  try {
    const input = handedOffFrom(JSON.parse(handedOff));
    if (input === undefined) return;
    const tag = `${input.event} ${input.conversationId.slice(0, 8)}:`;
    const write = (line: string): void => log(settings.dir, `${tag} ${line}`);
    await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));
    const [{ sync }, { Sender }] = await Promise.all([import('./session.js'), import('./send.js')]);
    await sync(input, settings, { sender: (destination) => new Sender(destination, write), log: write });
  } catch (error) {
    log(settings.dir, `failed: ${kindOf(error)}`);
  } finally {
    sweep(settings.dir, Date.now());
  }
}

/** `script` is the bundle itself, which the copy runs. Never throws: whatever happens is in hook.log. */
export async function hook(args: readonly string[], script: string, env: NodeJS.ProcessEnv = process.env): Promise<void> {
  const event = args[0];
  const handedOff = env[HANDOFF];
  if (handedOff !== undefined) {
    await copy(handedOff, env);
    return;
  }
  try {
    // Straight to the file descriptor, as stdin is read: `process.stdout` on
    // Cursor's pipe is a socket's stream, and costs as much again.
    writeSync(1, answerFor(event));
  } catch {
    // Cursor gone before the answer is no error of the hook's.
  }
  // Registered for an event this version does not record: answered, nothing kept.
  if (!isEvent(event)) return;
  let dir: string | undefined;
  try {
    // Read once Cursor has its answer: a home folder that cannot be found is then no hook that failed.
    const settings = settingsFrom(env);
    dir = settings.dir;
    // When Cursor started the hook, which is when the event happened, give or take a millisecond.
    const at = Math.round(performance.timeOrigin);
    // On Windows Cursor pipes the event through PowerShell, which opens it with a byte order mark.
    const got = received(event, JSON.parse((await readInput()).replace(/^\uFEFF/, '')) as unknown, at, lineId());
    if (got === undefined) {
      log(settings.dir, `${event}: hook input not understood; nothing kept`);
      return;
    }
    if (!args.includes('--project') && projectRuns(env, event)) return;
    // Without a key nothing is sent, so nothing of the conversation is kept.
    if (settings.apiKey !== undefined) append(settings.dir, got.conversationId, got.line);
    if (!CLOSING.has(event)) return;
    const input: HookInput = { event: event === 'stop' ? 'stop' : 'sessionEnd', conversationId: got.conversationId };
    const { spawn } = await import('node:child_process');
    const child = spawn(process.execPath, [script, 'hook', event], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
      env: { ...env, [HANDOFF]: JSON.stringify({ event: input.event, conversation_id: input.conversationId }) },
    });
    child.on('error', (error) => log(settings.dir, `${event}: could not start the sender: ${kindOf(error)}`));
    child.unref();
  } catch (error) {
    if (dir !== undefined) log(dir, `${event}: failed: ${kindOf(error)}`);
  }
}
