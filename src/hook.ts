/**
 * What Cursor runs at each event, `telmoni-cursor-observability hook <event>`: it answers Cursor first, keeps what may be
 * kept of the event in the spool, and at `stop` and `sessionEnd` hands the conversation to a detached copy that sends (`session.ts`); Cursor waits on every hook, so it never loads the SDK.
 */

import { accessSync, constants, readFileSync, readSync, writeSync } from 'node:fs';
import { delimiter, isAbsolute, join } from 'node:path';

import { registersProject } from './hooks.js';
import { type CursorEvent, answerFor, isClosing, isEvent, isId, received } from './input.js';
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

/** Whether the bytes read end in `}`, as a whole event does but for whitespace. */
function endsInBrace(bytes: Buffer, length: number): boolean {
  let at = length - 1;
  while (at >= 0 && (bytes[at] === 0x20 || bytes[at] === 0x0a || bytes[at] === 0x0d || bytes[at] === 0x09)) at--;
  return at >= 0 && bytes[at] === 0x7d;
}

/** The event read so far, where it is whole: Cursor may leave its end of the pipe open once it has written one. */
function whole(chunks: Buffer[]): string | undefined {
  const text = Buffer.concat(chunks).toString('utf8');
  try {
    JSON.parse(text.replace(/^\uFEFF/, ''));
    return text;
  } catch {
    return undefined;
  }
}

function streamed(chunks: Buffer[], size: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(Object.assign(new Error('no hook input'), { name: 'NoHookInput' }));
      // Let go of it, or the process lives on for as long as it stays open.
      process.stdin.destroy();
    }, INPUT_WAIT_MS);
    process.stdin.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_INPUT_BYTES) {
        clearTimeout(timer);
        reject(new RangeError('hook input too large'));
        process.stdin.destroy();
        return;
      }
      chunks.push(chunk);
      const text = endsInBrace(chunk, chunk.length) ? whole(chunks) : undefined;
      if (text === undefined) return;
      clearTimeout(timer);
      process.stdin.destroy();
      resolve(text);
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
 * What Cursor wrote on stdin, read to its end straight from the file descriptor: `process.stdin`, a socket's stream,
 * costs a hook Cursor waits on more than the rest of its work, and is used only where the pipe would block.
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
    // A blocking read would wait on a pipe Cursor leaves open for good: an event read whole is all there is.
    const text = endsInBrace(buffer, read) ? whole(chunks) : undefined;
    if (text !== undefined) return Promise.resolve(text);
  }
  return Promise.resolve(Buffer.concat(chunks).toString('utf8'));
}

/**
 * Whether the workspace's own hooks run the plugin at `event` too: Cursor runs the user's and the workspace's both, a
 * cloud agent the workspace's alone, so where both are set up the workspace's record and the user's stand aside.
 */
function projectRuns(env: NodeJS.ProcessEnv, event: CursorEvent): boolean {
  const root = env['CURSOR_PROJECT_DIR']?.trim();
  if (!root || !isAbsolute(root)) return false;
  try {
    if (!registersProject(JSON.parse(readFileSync(join(root, '.cursor', 'hooks.json'), 'utf8')), event)) return false;
  } catch {
    return false;
  }
  // They run the bin from `PATH`, in the workspace: where it is not there, they cannot start, and the user's record.
  return onPath(env, 'telmoni-cursor-observability', root);
}

/** Whether `name` is a program in a folder of `env`'s `PATH`, a relative one read from `cwd`, by Windows's `PATHEXT` there. */
function onPath(env: NodeJS.ProcessEnv, name: string, cwd: string): boolean {
  const names =
    process.platform === 'win32' ? (env['PATHEXT'] ?? '.COM;.EXE;.BAT;.CMD').split(';').filter(Boolean).map((ext) => `${name}${ext}`) : [name];
  for (const folder of (env['PATH'] ?? '').split(delimiter)) {
    for (const file of names) {
      try {
        accessSync(join(isAbsolute(folder) ? folder : join(cwd, folder), file), constants.X_OK);
        return true;
      } catch {
        // Not here.
      }
    }
  }
  return false;
}

function handedOffFrom(raw: unknown): HookInput | undefined {
  if (raw === null || typeof raw !== 'object') return undefined;
  const fields = raw as Record<string, unknown>;
  const event = fields['event'];
  const conversationId = fields['conversation_id'];
  if (!isClosing(event) || !isId(conversationId)) return undefined;
  const input: HookInput = { event, conversationId };
  const at = fields['at'];
  if (typeof at === 'number' && Number.isFinite(at) && at > 0) input.at = at;
  return input;
}

async function copy(handedOff: string, env: NodeJS.ProcessEnv): Promise<void> {
  let settings: Settings;
  try {
    settings = settingsFrom(env);
  } catch {
    // No home folder to keep anything in, nor to say so.
    return;
  }
  let tag: string | undefined;
  try {
    const input = handedOffFrom(JSON.parse(handedOff));
    if (input === undefined) return;
    const tagged = `${input.event} ${input.conversationId.slice(0, 8)}:`;
    tag = tagged;
    const write = (line: string): void => log(settings.dir, `${tagged} ${line}`);
    await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));
    const [{ sync }, { Sender }] = await Promise.all([import('./session.js'), import('./send.js')]);
    await sync(input, settings, { sender: (destination) => new Sender(destination, write), log: write });
  } catch (error) {
    log(settings.dir, tag === undefined ? `failed: ${kindOf(error)}` : `${tag} failed: ${kindOf(error)}`);
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
    // Straight to the file descriptor, as stdin is read: `process.stdout` on Cursor's pipe is a socket's stream, and costs as much again.
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
    // Without a key, or past a key file passed over, nothing is sent, so nothing of the conversation is kept.
    if (settings.apiKey !== undefined && settings.keyFileProblem === undefined) append(settings.dir, got.conversationId, got.line);
    if (!isClosing(event)) return;
    const input: HookInput = { event, conversationId: got.conversationId, at };
    const { spawn } = await import('node:child_process');
    const child = spawn(process.execPath, [script, 'hook', event], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
      env: { ...env, [HANDOFF]: JSON.stringify({ event: input.event, conversation_id: input.conversationId, at: input.at }) },
    });
    child.on('error', (error) => log(settings.dir, `${event}: could not start the sender: ${kindOf(error)}`));
    child.unref();
  } catch (error) {
    if (dir !== undefined) log(dir, `${event}: failed: ${kindOf(error)}`);
  }
}
