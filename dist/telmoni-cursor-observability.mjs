#!/usr/bin/env node
import {
  pathsOf,
  registersProject,
  registersUser,
  settingsFrom
} from "./chunk-2OGJLPD5.mjs";
import {
  append,
  sweep
} from "./chunk-XPQ2DAB3.mjs";
import {
  answerFor,
  isClosing,
  isEvent,
  isId,
  kindOf,
  log,
  received
} from "./chunk-65DK5VQ4.mjs";

// src/cli.ts
import { homedir } from "os";
import { fileURLToPath } from "url";

// src/hook.ts
import { accessSync, constants, readFileSync, readSync, writeSync } from "fs";
import { delimiter, isAbsolute, join } from "path";
var HANDOFF = "TELMONI_CURSOR_HOOK_INPUT";
var MAX_INPUT_BYTES = 16 * 1024 * 1024;
var INPUT_WAIT_MS = 5e3;
var SETTLE_MS = 1e3;
function lineId() {
  return Math.floor(Math.random() * 2 ** 48).toString(16).padStart(12, "0");
}
function endsInBrace(bytes, length) {
  let at = length - 1;
  while (at >= 0 && (bytes[at] === 32 || bytes[at] === 10 || bytes[at] === 13 || bytes[at] === 9)) at--;
  return at >= 0 && bytes[at] === 125;
}
function whole(chunks) {
  const text = Buffer.concat(chunks).toString("utf8");
  try {
    JSON.parse(text.replace(/^\uFEFF/, ""));
    return text;
  } catch {
    return void 0;
  }
}
function streamed(chunks, size) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(Object.assign(new Error("no hook input"), { name: "NoHookInput" }));
      process.stdin.destroy();
    }, INPUT_WAIT_MS);
    process.stdin.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_INPUT_BYTES) {
        clearTimeout(timer);
        reject(new RangeError("hook input too large"));
        process.stdin.destroy();
        return;
      }
      chunks.push(chunk);
      const text = endsInBrace(chunk, chunk.length) ? whole(chunks) : void 0;
      if (text === void 0) return;
      clearTimeout(timer);
      process.stdin.destroy();
      resolve(text);
    });
    process.stdin.on("end", () => {
      clearTimeout(timer);
      resolve(Buffer.concat(chunks).toString("utf8"));
    });
    process.stdin.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}
function readInput() {
  process.stdin.pause();
  const chunks = [];
  let size = 0;
  const buffer = Buffer.allocUnsafe(64 * 1024);
  for (; ; ) {
    let read;
    try {
      read = readSync(0, buffer, 0, buffer.length, null);
    } catch (error) {
      const code = error.code;
      if (code === "EAGAIN") return streamed(chunks, size);
      if (code === "EOF") break;
      throw error;
    }
    if (read === 0) break;
    size += read;
    if (size > MAX_INPUT_BYTES) throw new RangeError("hook input too large");
    chunks.push(Buffer.from(buffer.subarray(0, read)));
    const text = endsInBrace(buffer, read) ? whole(chunks) : void 0;
    if (text !== void 0) return Promise.resolve(text);
  }
  return Promise.resolve(Buffer.concat(chunks).toString("utf8"));
}
function projectRuns(env, event) {
  const root = env["CURSOR_PROJECT_DIR"]?.trim();
  if (!root || !isAbsolute(root)) return false;
  try {
    if (!registersProject(JSON.parse(readFileSync(join(root, ".cursor", "hooks.json"), "utf8")), event)) return false;
  } catch {
    return false;
  }
  return onPath(env, "telmoni-cursor-observability", root);
}
function userRuns(env, event) {
  if (!env["CURSOR_PLUGIN_ROOT"]?.trim()) return false;
  try {
    return registersUser(JSON.parse(readFileSync(pathsOf().hooks, "utf8")), event);
  } catch {
    return false;
  }
}
function onPath(env, name, cwd) {
  const names = process.platform === "win32" ? (env["PATHEXT"] ?? ".COM;.EXE;.BAT;.CMD").split(";").filter(Boolean).map((ext) => `${name}${ext}`) : [name];
  for (const folder of (env["PATH"] ?? "").split(delimiter)) {
    for (const file of names) {
      try {
        accessSync(join(isAbsolute(folder) ? folder : join(cwd, folder), file), constants.X_OK);
        return true;
      } catch {
      }
    }
  }
  return false;
}
function handedOffFrom(raw) {
  if (raw === null || typeof raw !== "object") return void 0;
  const fields = raw;
  const event = fields["event"];
  const conversationId = fields["conversation_id"];
  if (!isClosing(event) || !isId(conversationId)) return void 0;
  const input = { event, conversationId };
  const at = fields["at"];
  if (typeof at === "number" && Number.isFinite(at) && at > 0) input.at = at;
  return input;
}
async function copy(handedOff, env) {
  let settings;
  try {
    settings = settingsFrom(env);
  } catch {
    return;
  }
  let tag;
  try {
    const input = handedOffFrom(JSON.parse(handedOff));
    if (input === void 0) return;
    const tagged = `${input.event} ${input.conversationId.slice(0, 8)}:`;
    tag = tagged;
    await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));
    const [{ sendLeft, sync }, { Sender }] = await Promise.all([import("./session-IBKZ3J4Y.mjs"), import("./send-LWC3BJQF.mjs")]);
    const deps = (prefix) => {
      const said = (line) => log(settings.dir, `${prefix} ${line}`);
      return { sender: (destination) => new Sender(destination, said), log: said };
    };
    if (await sync(input, settings, deps(tagged))) {
      await sendLeft(input.conversationId, settings, (other) => deps(`sessionEnd ${other.slice(0, 8)}:`));
    }
  } catch (error) {
    log(settings.dir, tag === void 0 ? `failed: ${kindOf(error)}` : `${tag} failed: ${kindOf(error)}`);
  } finally {
    sweep(settings.dir, Date.now(), (line) => log(settings.dir, line));
  }
}
async function hook(args2, script, env = process.env) {
  const event = args2[0];
  const handedOff = env[HANDOFF];
  if (handedOff !== void 0) {
    await copy(handedOff, env);
    return;
  }
  try {
    writeSync(1, answerFor(event));
  } catch {
  }
  if (!isEvent(event)) return;
  let dir;
  try {
    const settings = settingsFrom(env);
    dir = settings.dir;
    const at = Math.round(performance.timeOrigin);
    const got = received(event, JSON.parse((await readInput()).replace(/^\uFEFF/, "")), at, lineId());
    if (got === void 0) {
      log(settings.dir, `${event}: hook input not understood; nothing kept`);
      return;
    }
    if (!args2.includes("--project") && (projectRuns(env, event) || userRuns(env, event))) return;
    if (settings.apiKey !== void 0 && settings.keyFileProblem === void 0) append(settings.dir, got.conversationId, got.line);
    if (!isClosing(event)) return;
    const input = { event, conversationId: got.conversationId, at };
    const { spawn } = await import("child_process");
    const child = spawn(process.execPath, [script, "hook", event], {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
      env: { ...env, [HANDOFF]: JSON.stringify({ event: input.event, conversation_id: input.conversationId, at: input.at }) }
    });
    child.on("error", (error) => log(settings.dir, `${event}: could not start the sender: ${kindOf(error)}`));
    child.unref();
  } catch (error) {
    if (dir !== void 0) log(dir, `${event}: failed: ${kindOf(error)}`);
  }
}

// src/cli.ts
var SCRIPT = fileURLToPath(import.meta.url);
var USAGE = `Usage:
  telmoni-cursor-observability setup [--project]   Record Cursor's agent conversations in Telmoni: write the hooks
                                     into ~/.cursor/hooks.json and the key (TELMONI_API_KEY, or typed)
                                     into ~/.cursor/telmoni.json; with --project, write the hooks into
                                     this repository's .cursor/hooks.json, which cloud agents read.
  telmoni-cursor-observability remove [--project]  Take it all out again: the hooks, the key and the plugin's folder;
                                     with --project, the repository's hooks alone.
  telmoni-cursor-observability hook <event>        What Cursor runs at each event.
`;
var [command, ...args] = process.argv.slice(2);
if (command === "hook") {
  await hook(args, SCRIPT);
  process.exitCode = 0;
} else if ((command === "setup" || command === "remove") && args.every((arg) => arg === "--project")) {
  const { askKey, nodeOf, remove, setup } = await import("./setup-UXYZA2IC.mjs");
  const options = {
    project: args.includes("--project"),
    home: homedir(),
    cwd: process.cwd(),
    env: process.env,
    node: nodeOf(process.env),
    script: SCRIPT,
    ask: process.stdin.isTTY ? askKey : void 0,
    print: (line) => void process.stdout.write(`${line}
`)
  };
  try {
    process.exitCode = command === "setup" ? await setup(options) : remove(options);
  } catch (error) {
    process.stderr.write(`telmoni-cursor-observability ${command}: ${error instanceof Error ? error.message : String(error)}
`);
    process.exitCode = 1;
  }
} else if (command === void 0 || command === "help" || command === "--help" || command === "-h") {
  process.stdout.write(USAGE);
} else {
  process.stderr.write(USAGE);
  process.exitCode = 2;
}
