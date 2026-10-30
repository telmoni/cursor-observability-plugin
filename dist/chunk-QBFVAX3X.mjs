import {
  EVENTS,
  kindOf
} from "./chunk-O4E2KSHU.mjs";

// src/hooks.ts
var TIMEOUT_S = 10;
var OURS = /telmoni-cursor-observability(?:\.mjs)?["']?\s+hook\s/;
function isOurs(entry) {
  if (entry === null || typeof entry !== "object") return false;
  const command = entry.command;
  return typeof command === "string" && OURS.test(command);
}
function quote(path, platform) {
  return platform === "win32" ? `'${path.replace(/['\u2018-\u201b]/g, "$&$&")}'` : `'${path.replaceAll("'", "'\\''")}'`;
}
function commandFor(scope, event, node, script, platform = process.platform) {
  if (scope === "project") return `telmoni-cursor-observability hook ${event} --project`;
  const call = `${quote(node, platform)} ${quote(script, platform)} hook ${event}`;
  return platform === "win32" ? `& ${call}` : call;
}
function parseHooks(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return "is not JSON";
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return "is not a JSON object";
  const config = parsed;
  if (config.hooks === void 0) return config;
  if (config.hooks === null || typeof config.hooks !== "object" || Array.isArray(config.hooks)) {
    return 'has a "hooks" that is not an object';
  }
  for (const event of EVENTS) {
    const entries = config.hooks[event];
    if (entries !== void 0 && !Array.isArray(entries)) return `has a "${event}" that is not a list`;
  }
  return config;
}
function withoutOurs(hooks) {
  const out = {};
  for (const [event, entries] of Object.entries(hooks)) {
    if (!Array.isArray(entries) || !entries.some(isOurs)) {
      out[event] = entries;
      continue;
    }
    const kept = entries.filter((entry) => !isOurs(entry));
    if (kept.length > 0) out[event] = kept;
  }
  return out;
}
function withOurs(config, commands) {
  const hooks = withoutOurs(config.hooks ?? {});
  for (const [event, command] of commands) {
    const entries = hooks[event] ?? [];
    hooks[event] = [...entries, { command, timeout: TIMEOUT_S }];
  }
  return { version: 1, ...config, hooks };
}
function withoutOursIn(config) {
  const hooks = withoutOurs(config.hooks ?? {});
  const others = Object.keys(config).filter((key) => key !== "version" && key !== "hooks");
  if (Object.keys(hooks).length === 0 && others.length === 0) return void 0;
  return { ...config, hooks };
}
function holdsOurs(config) {
  return Object.values(config.hooks ?? {}).some((entries) => Array.isArray(entries) && entries.some(isOurs));
}
var PROJECT = /\s--project(?:\s|$)/;
function oursAt(config, event) {
  if (config === null || typeof config !== "object") return [];
  const hooks = config.hooks;
  if (hooks === null || typeof hooks !== "object") return [];
  const entries = hooks[event];
  return Array.isArray(entries) ? entries.filter(isOurs).map((entry) => entry.command) : [];
}
function registersProject(config, event) {
  return oursAt(config, event).some((command) => PROJECT.test(command));
}
function registersUser(config, event) {
  return oursAt(config, event).some((command) => !PROJECT.test(command));
}

// src/settings.ts
import { closeSync, constants, fstatSync, openSync, readFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";
function pathsOf(home = homedir()) {
  const cursor = join(home, ".cursor");
  return {
    hooks: join(cursor, "hooks.json"),
    keyFile: join(cursor, "telmoni.json"),
    dir: join(cursor, "telmoni")
  };
}
var MAX_KEY_FILE_BYTES = 64 * 1024;
function readKeyFile(path) {
  let fd;
  try {
    fd = openSync(path, constants.O_RDONLY | constants.O_NONBLOCK);
  } catch (error) {
    const code = error.code;
    if (code === "ENOENT" || code === "ENOTDIR") return {};
    if (code === "EISDIR") return { problem: "not a file" };
    return { problem: `unreadable (${kindOf(error)})` };
  }
  let parsed;
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile()) return { problem: "not a file" };
    if (process.platform !== "win32") {
      const uid = process.getuid?.();
      if (uid !== void 0 && stat.uid !== uid) return { problem: "owned by another user" };
      if ((stat.mode & 63) !== 0) return { problem: "open to other users; chmod 600 it" };
    }
    if (stat.size > MAX_KEY_FILE_BYTES) return { problem: "too large" };
    parsed = JSON.parse(readFileSync(fd, "utf8"));
  } catch (error) {
    return { problem: error instanceof SyntaxError ? "not JSON" : `unreadable (${kindOf(error)})` };
  } finally {
    closeSync(fd);
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return { problem: "not a JSON object" };
  const fields = parsed;
  const out = {};
  for (const field of ["apiKey", "endpoint"]) {
    const given = fields[field];
    if (given === void 0) continue;
    const value = typeof given === "string" ? given.trim() : "";
    if (value === "") return { problem: `${field} empty or not a string` };
    out[field] = value;
  }
  return out;
}
function settingsFrom(env, home = homedir()) {
  const paths = pathsOf(home);
  const fromEnv = (name) => env[name]?.trim() || void 0;
  const apiKey = fromEnv("TELMONI_API_KEY");
  if (apiKey !== void 0) return { apiKey, endpoint: fromEnv("TELMONI_ENDPOINT"), dir: paths.dir };
  const file = readKeyFile(paths.keyFile);
  const settings = { apiKey: file.apiKey, endpoint: file.endpoint, dir: paths.dir };
  if (file.problem !== void 0) settings.keyFileProblem = file.problem;
  return settings;
}

export {
  commandFor,
  parseHooks,
  withOurs,
  withoutOursIn,
  holdsOurs,
  registersProject,
  registersUser,
  pathsOf,
  readKeyFile,
  settingsFrom
};
