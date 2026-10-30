import {
  commandFor,
  holdsOurs,
  parseHooks,
  pathsOf,
  readKeyFile,
  withOurs,
  withoutOursIn
} from "./chunk-QBFVAX3X.mjs";
import {
  EVENTS
} from "./chunk-O4E2KSHU.mjs";
import {
  Telmoni
} from "./chunk-FCY6IAVY.mjs";
import "./chunk-SWUHJDYO.mjs";

// src/setup.ts
import { createHash } from "crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync
} from "fs";
import { delimiter, dirname, isAbsolute, join, sep } from "path";
var KEY = /^tm_[A-Za-z0-9_-]{43}$/;
async function refusalOf(endpoint) {
  let client;
  try {
    client = new Telmoni({ endpoint });
  } catch (error) {
    if (error instanceof TypeError) return error.message;
    throw error;
  }
  await client.shutdown();
  return void 0;
}
function nodeOf(env) {
  let running;
  try {
    running = realpathSync(process.execPath);
  } catch {
    return process.execPath;
  }
  const name = process.platform === "win32" ? "node.exe" : "node";
  for (const dir of (env["PATH"] ?? "").split(delimiter)) {
    if (!isAbsolute(dir)) continue;
    try {
      if (realpathSync(join(dir, name)) === running) return join(dir, name);
    } catch {
    }
  }
  return process.execPath;
}
function repositoryOf(cwd) {
  for (let dir = cwd; ; dir = dirname(dir)) {
    if (existsSync(join(dir, ".git"))) return dir;
    if (dirname(dir) === dir) return cwd;
  }
}
function hooksFileOf(options) {
  return options.project ? join(repositoryOf(options.cwd), ".cursor", "hooks.json") : pathsOf(options.home).hooks;
}
function shown(path, home) {
  return path === home || path.startsWith(`${home}${sep}`) ? `~${path.slice(home.length)}` : path;
}
function targetOf(path) {
  return existsSync(path) ? realpathSync(path) : path;
}
function readText(path) {
  try {
    return readFileSync(path, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return void 0;
    throw error;
  }
}
function writeAtomically(path, text, mode) {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.telmoni-${process.pid}`;
  writeFileSync(temporary, text, { mode });
  renameSync(temporary, path);
}
function writeThrough(path, text) {
  const target = targetOf(path);
  const mode = existsSync(target) ? statSync(target).mode & 511 : 420;
  writeAtomically(target, text, mode);
}
function writeHooks(path, config) {
  writeThrough(path, `${JSON.stringify(config, null, 2)}
`);
}
function foundOf(file, home) {
  return join(pathsOf(home).dir, `hooks.json.found-${createHash("sha256").update(file).digest("hex").slice(0, 16)}`);
}
function keepFound(file, home, text) {
  mkdirSync(pathsOf(home).dir, { recursive: true, mode: 448 });
  writeAtomically(foundOf(file, home), JSON.stringify({ text: text ?? null }), 384);
}
function readFound(path) {
  try {
    const { text } = JSON.parse(readFileSync(path, "utf8"));
    return typeof text === "string" ? text : void 0;
  } catch {
    return void 0;
  }
}
function same(a, b) {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const left = a;
  const right = b;
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length && keys.every((key) => Object.hasOwn(right, key) && same(left[key], right[key]));
}
function leftOf(text) {
  const config = parseHooks(text);
  return typeof config === "string" ? config : withoutOursIn(withOurs(config, /* @__PURE__ */ new Map()));
}
async function setup(options) {
  const { print } = options;
  const file = hooksFileOf(options);
  const text = readText(file);
  const config = text === void 0 ? void 0 : parseHooks(text);
  if (typeof config === "string") {
    print(`${shown(file, options.home)} ${config}; fix it or move it aside, then run setup again. Nothing was changed.`);
    return 1;
  }
  const scope = options.project ? "project" : "user";
  const commands = new Map(EVENTS.map((event) => [event, commandFor(scope, event, options.node, options.script)]));
  const merged = withOurs(config ?? {}, commands);
  const found = config === void 0 || !holdsOurs(config);
  if (options.project) {
    if (found) keepFound(file, options.home, text);
    writeHooks(file, merged);
    print(`Cursor's hooks for this repository: ${shown(file, options.home)}. Commit it.`);
    print(
      "Cloud agents run it once their environment has the package \u2014 npm install -g @telmoni/cursor-observability-plugin in .cursor/environment.json's install step \u2014 and the key, as the Cloud Agents secret TELMONI_API_KEY."
    );
    print("On your own machine, telmoni-cursor-observability setup gives these hooks your key.");
    return 0;
  }
  const paths = pathsOf(options.home);
  const saved = readKeyFile(paths.keyFile);
  if (saved.problem !== void 0) {
    print(`${shown(paths.keyFile, options.home)} not used (${saved.problem}): fix it or move it aside, then run setup again. Nothing was changed.`);
    return 1;
  }
  let apiKey = options.env["TELMONI_API_KEY"]?.trim() || void 0;
  if (apiKey === void 0 && options.ask !== void 0) {
    apiKey = (await options.ask(saved.apiKey !== void 0)).trim() || void 0;
  }
  apiKey ??= saved.apiKey;
  if (apiKey === void 0) {
    print("No key: set TELMONI_API_KEY, or run telmoni-cursor-observability setup in a terminal to type it. Nothing was changed.");
    return 1;
  }
  if (!KEY.test(apiKey)) {
    print(
      "That is not a Telmoni API key: a project's key starts tm_ and runs 46 characters. Make one holding the ingest scope on your project's API keys page. Nothing was changed."
    );
    return 1;
  }
  const endpoint = options.env["TELMONI_ENDPOINT"]?.trim() || saved.endpoint;
  const refused = endpoint === void 0 ? void 0 : await refusalOf(endpoint);
  if (refused !== void 0) {
    print(`TELMONI_ENDPOINT is not one the SDK sends to: ${refused}. Nothing was changed.`);
    return 1;
  }
  const key = { apiKey };
  if (endpoint !== void 0) key.endpoint = endpoint;
  writeAtomically(paths.keyFile, `${JSON.stringify(key, null, 2)}
`, 384);
  if (found) keepFound(file, options.home, text);
  writeHooks(file, merged);
  print(`Cursor's hooks: ${shown(file, options.home)}. Your key: ${shown(paths.keyFile, options.home)}.`);
  print("Each turn of a Cursor agent conversation is recorded in Telmoni from your next prompt.");
  return 0;
}
function remove(options) {
  const { print } = options;
  const file = hooksFileOf(options);
  const text = readText(file);
  const config = text === void 0 ? void 0 : parseHooks(text);
  if (typeof config === "string") {
    print(`${shown(file, options.home)} ${config}; take the telmoni-cursor-observability entries out by hand. Nothing was changed.`);
    return 1;
  }
  const kept = foundOf(file, options.home);
  if (config !== void 0) {
    const left = withoutOursIn(config);
    const found = readFound(kept);
    if (found !== void 0 && same(left, leftOf(found))) writeThrough(file, found);
    else if (left === void 0 && !lstatSync(file).isSymbolicLink()) rmSync(file, { force: true });
    else writeHooks(file, left ?? { version: 1, hooks: {} });
  }
  rmSync(kept, { force: true });
  print(`Taken out of ${shown(file, options.home)}.`);
  if (!options.project) {
    const paths = pathsOf(options.home);
    rmSync(paths.keyFile, { force: true });
    const kept2 = clearFolder(paths.dir);
    const but = kept2 ? ", but what setup --project found of a repository's hooks file, for that repository's remove --project" : "";
    print(`Deleted your key, ${shown(paths.keyFile, options.home)}, and the plugin's folder, ${shown(paths.dir, options.home)}${but}.`);
  }
  return 0;
}
function clearFolder(dir) {
  let names;
  try {
    names = readdirSync(dir);
  } catch {
    return false;
  }
  const found = names.filter((name) => name.startsWith("hooks.json.found-"));
  for (const name of names) if (!found.includes(name)) rmSync(join(dir, name), { recursive: true, force: true });
  if (found.length === 0) rmSync(dir, { recursive: true, force: true });
  return found.length > 0;
}
function askKey(saved) {
  const input = process.stdin;
  process.stderr.write(`Telmoni API key, holding the ingest scope${saved ? " (Enter keeps the one saved)" : ""}: `);
  input.setRawMode(true);
  input.setEncoding("utf8");
  input.resume();
  return new Promise((resolve) => {
    let value = "";
    const done = () => {
      input.removeListener("data", onData);
      input.setRawMode(false);
      input.pause();
      process.stderr.write("\n");
    };
    const onData = (chunk) => {
      for (const character of chunk) {
        if (character === "\r" || character === "\n" || character === "") {
          done();
          resolve(value);
          return;
        }
        if (character === "") {
          done();
          process.exit(130);
        }
        if (character === "\x7F" || character === "\b") value = value.slice(0, -1);
        else if (character >= " ") value += character;
      }
    };
    input.on("data", onData);
  });
}
export {
  askKey,
  nodeOf,
  remove,
  setup
};
