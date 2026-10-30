import {
  isEvent
} from "./chunk-QMSA2DQT.mjs";

// src/spool.ts
import {
  appendFileSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync
} from "fs";
import { join } from "path";
var GRACE_MS = 100;
var EXPIRY_MS = 7 * 24 * 60 * 60 * 1e3;
var CONVERSATION_FILE = /^[A-Za-z0-9_-]{1,128}\.(?:jsonl(?:\.aside(?:\.\d+)?)?|json(?:\.(?:\d+\.)?tmp)?|lock|left)$/;
function spoolOf(dir, conversationId) {
  return join(dir, `${conversationId}.jsonl`);
}
function asideOf(dir, conversationId) {
  return `${spoolOf(dir, conversationId)}.aside.${process.pid}`;
}
function append(dir, conversationId, line) {
  mkdirSync(dir, { recursive: true, mode: 448 });
  appendFileSync(spoolOf(dir, conversationId), `${JSON.stringify(line)}
`, { mode: 384 });
}
var LINE_START = '{"id":';
function parsed(piece) {
  try {
    return JSON.parse(piece);
  } catch {
    const start = piece.lastIndexOf(LINE_START);
    if (start <= 0) return void 0;
    try {
      return JSON.parse(piece.slice(start));
    } catch {
      return void 0;
    }
  }
}
function linesIn(path) {
  let text;
  try {
    text = readFileSync(path, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
  const lines = [];
  const seen = /* @__PURE__ */ new Set();
  for (const piece of text.split("\n").slice(0, -1)) {
    if (piece.trim() === "") continue;
    const line = parsed(piece);
    if (line === null || line === void 0 || typeof line !== "object" || typeof line.id !== "string" || typeof line.at !== "number" || !Number.isFinite(line.at) || !isEvent(line.hook_event_name) || seen.has(line.id)) {
      continue;
    }
    seen.add(line.id);
    lines.push(line);
  }
  return lines;
}
function readSpool(dir, conversationId) {
  return linesIn(spoolOf(dir, conversationId));
}
function recover(dir, conversationId) {
  const prefix = `${conversationId}.jsonl.aside`;
  let names;
  try {
    names = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of names.filter((each) => each === prefix || each.startsWith(`${prefix}.`))) {
    const aside = join(dir, name);
    const lines = linesIn(aside);
    if (lines.length > 0) {
      appendFileSync(spoolOf(dir, conversationId), lines.map((line) => `${JSON.stringify(line)}
`).join(""), {
        mode: 384
      });
    }
    rmSync(aside, { force: true });
  }
}
async function compact(dir, conversationId, drop) {
  if (drop.size === 0) return;
  const spool = spoolOf(dir, conversationId);
  const aside = asideOf(dir, conversationId);
  try {
    renameSync(spool, aside);
  } catch (error) {
    if (error.code === "ENOENT") return;
    throw error;
  }
  await new Promise((resolve) => setTimeout(resolve, GRACE_MS));
  const kept = linesIn(aside).filter((line) => !drop.has(line.id));
  if (kept.length > 0) {
    appendFileSync(spool, kept.map((line) => `${JSON.stringify(line)}
`).join(""), { mode: 384 });
  }
  rmSync(aside, { force: true });
}
function sweep(dir, now, log = () => {
}) {
  let names;
  try {
    names = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of names) {
    if (!CONVERSATION_FILE.test(name)) continue;
    const path = join(dir, name);
    try {
      if (now - statSync(path).mtimeMs <= EXPIRY_MS) continue;
      const unsent = name.endsWith(".jsonl") ? linesIn(path).length : 0;
      if (unsent > 0) log(`${name.split(".")[0].slice(0, 8)}: ${unsent} lines of a conversation untouched for a week deleted, unsent`);
      rmSync(path, { force: true });
    } catch {
    }
  }
}

export {
  append,
  readSpool,
  recover,
  compact,
  sweep
};
