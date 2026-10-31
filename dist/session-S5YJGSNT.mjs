import {
  compact,
  readSpool,
  recover
} from "./chunk-XPQ2DAB3.mjs";
import {
  kindOf
} from "./chunk-65DK5VQ4.mjs";

// src/session.ts
import { createHmac } from "crypto";

// src/record.ts
import { createHash } from "crypto";

// src/turns.ts
function isSessionLine(line) {
  return line.hook_event_name === "sessionStart" || line.hook_event_name === "sessionEnd";
}
function byTime(a, b) {
  return a.at - b.at || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}
var lastOf = (turn, event) => turn.lines.findLast((line) => line.hook_event_name === event);
function stopOf(turn) {
  return lastOf(turn, "stop");
}
function sessionEndOf(turn) {
  return lastOf(turn, "sessionEnd");
}
function hasWork(turn) {
  if (turn.lines.some((line) => !isSessionLine(line))) return true;
  return turn.headless && lastOf(turn, "sessionStart") !== void 0 && sessionEndOf(turn) !== void 0;
}
var TASK_SLACK_MS = 2e3;
function lateStop(line, span) {
  const begun = line.at - (line.duration_ms ?? 0);
  if (line.hook_event_name !== "subagentStop" || begun >= span.start) return false;
  return !span.turn.lines.some((each) => each.tool_name?.toLowerCase() === "task" && each.at - (each.duration ?? 0) <= begun + TASK_SLACK_MS);
}
function cut(lines, conversationId) {
  const sorted = [...lines].sort(byTime);
  const own = /* @__PURE__ */ new Map();
  const rest = [];
  for (const line of sorted) {
    const generation = line.generation_id;
    if (generation === void 0 || generation === conversationId) {
      rest.push(line);
      continue;
    }
    const found = own.get(generation);
    if (found === void 0) own.set(generation, [line]);
    else found.push(line);
  }
  const turns = [...own].map(([id, turnLines]) => ({ id, lines: turnLines, headless: false }));
  const bounds = sorted.filter(isSessionLine).map((line) => line.at);
  const spans = turns.map((turn) => {
    const start = turn.lines[0].at;
    return { turn, start, end: bounds.find((at) => at > start) ?? Number.POSITIVE_INFINITY };
  }).sort((a, b) => a.start - b.start);
  const loose = [];
  const sessions = [];
  let session;
  const closeSession = () => {
    if (session !== void 0 && session.length > 0) sessions.push(session);
    session = void 0;
  };
  for (const line of rest) {
    if (!isSessionLine(line)) {
      const span = spans.findLast((s) => s.start <= line.at && line.at <= s.end);
      if (span !== void 0 && !lateStop(line, span)) {
        span.turn.lines.push(line);
        continue;
      }
    }
    if (line.generation_id !== conversationId) {
      loose.push(line);
      continue;
    }
    const previous = session?.at(-1);
    if (previous !== void 0 && spans.some((s) => s.start > previous.at && s.start < line.at)) closeSession();
    if (line.hook_event_name === "sessionStart") closeSession();
    if (session === void 0 && line.hook_event_name === "subagentStop") {
      loose.push(line);
      continue;
    }
    (session ??= []).push(line);
    if (line.hook_event_name === "sessionEnd") closeSession();
  }
  closeSession();
  for (const turn of turns) turn.lines.sort(byTime);
  for (const sessionLines of sessions) {
    turns.push({ id: `${conversationId}@${sessionLines[0].at}`, lines: sessionLines, headless: true });
  }
  turns.sort((a, b) => byTime(a.lines[0], b.lines[0]));
  return { turns, loose };
}
function ended(turns, event, endedAt) {
  if (event === "sessionEnd") return turns.filter((turn) => endedAt === void 0 || turn.lines[0].at <= endedAt);
  let latest = Number.NEGATIVE_INFINITY;
  for (const turn of turns) {
    if (stopOf(turn) !== void 0) latest = Math.max(latest, turn.lines[0].at);
  }
  return turns.filter(
    (turn) => stopOf(turn) !== void 0 || sessionEndOf(turn) !== void 0 || turn.lines.at(-1).at < latest
  );
}

// src/record.ts
var AGENT = "cursor";
var PROVIDER = "cursor";
var NAMESPACE = "4a535453-1668-44c0-9fb8-637aa6591fae";
var NAME_MAX = 145;
var MODEL_MAX = 128;
function fit(name, max) {
  const characters = [...name];
  return characters.length > max ? characters.slice(0, max).join("") : name;
}
var PATH = /^(?:[/\\]|~(?:[/\\]|$)|\.{1,2}[/\\]|[A-Za-z]:[/\\]|file:)/i;
var MODEL_FILE = /[/\\]([^/\\]+\.(?:gguf|ggml|bin|safetensors|llamafile))$/i;
function modelOf(name) {
  const trimmed = name.trim();
  const file = MODEL_FILE.exec(trimmed)?.[1];
  if (file !== void 0) return fit(file, MODEL_MAX);
  return PATH.test(trimmed) ? "unknown" : fit(trimmed, MODEL_MAX);
}
function uuid5(namespace, name) {
  const hash = createHash("sha1").update(Buffer.from(namespace.replaceAll("-", ""), "hex")).update(name, "utf8").digest();
  hash[6] = (hash[6] ?? 0) & 15 | 80;
  hash[8] = (hash[8] ?? 0) & 63 | 128;
  const hex = hash.subarray(0, 16).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
function runIdOf(conversationId, turnId) {
  return uuid5(NAMESPACE, `${conversationId}/${turnId}`);
}
var FAILURES = {
  error: "ToolError",
  timeout: "TimeoutError",
  permission_denied: "PermissionDenied"
};
var AGENT_ERROR = "AgentError";
function statusOutcome(status) {
  if (status === "aborted") return { cancelled: true };
  if (status === "error") return { errorType: AGENT_ERROR };
  return {};
}
function outcomeOf(turn, context) {
  const stop = stopOf(turn);
  if (stop !== void 0) return statusOutcome(stop.status);
  const end = sessionEndOf(turn) ?? context.sessionEnd;
  if (end === void 0) return { cancelled: true };
  const status = end.reason ?? end.final_status;
  return status === "completed" || status === "error" ? statusOutcome(status) : { cancelled: true };
}
function usageOf(turn) {
  const has = (line) => [line.input_tokens, line.output_tokens, line.cache_read_tokens, line.cache_write_tokens].some((n) => n !== void 0);
  const stop = stopOf(turn);
  const from = stop !== void 0 && has(stop) ? stop : turn.lines.findLast((line) => line.hook_event_name === "afterAgentResponse" && has(line));
  if (from === void 0) return void 0;
  const read = from.cache_read_tokens ?? 0;
  const write = from.cache_write_tokens ?? 0;
  let input = from.input_tokens ?? 0;
  if (input < read + write) input += read + write;
  return {
    inputTokens: input,
    outputTokens: from.output_tokens ?? 0,
    cacheReadInputTokens: read,
    cacheWriteInputTokens: write
  };
}
function toolCallOf(line) {
  const tool = {
    type: "tool_call",
    name: fit(line.tool_name ?? "unknown", NAME_MAX),
    start: line.at - (line.duration ?? 0),
    end: line.at
  };
  if (line.hook_event_name === "postToolUseFailure") {
    if (line.is_interrupt === true) tool.cancelled = true;
    else tool.errorType = FAILURES[line.failure_type ?? "error"];
  }
  return tool;
}
function takeTask(tools, at) {
  let best = -1;
  for (let index = 0; index < tools.length; index++) {
    const tool = tools[index];
    if (tool.name.toLowerCase() !== "task") continue;
    if (at < Number(tool.start) - TASK_SLACK_MS || at > Number(tool.end) + TASK_SLACK_MS) continue;
    if (best === -1 || Math.abs(Number(tool.end) - at) < Math.abs(Number(tools[best].end) - at)) best = index;
  }
  return best === -1 ? void 0 : tools.splice(best, 1)[0];
}
function stepOf(line, tools) {
  const end = line.at;
  const step = {
    type: "step",
    name: `subagent ${line.subagent_type ?? "unknown"}`,
    start: end - (line.duration_ms ?? 0),
    end
  };
  const task = takeTask(tools, end);
  if (task !== void 0) {
    step.start = Math.min(Number(step.start), Number(task.start));
    step.end = Math.max(end, Number(task.end));
  }
  const outcome = line.status === void 0 && task !== void 0 ? task : statusOutcome(line.status);
  if (outcome.errorType !== void 0) step.errorType = outcome.errorType;
  if (outcome.cancelled === true) step.cancelled = true;
  return step;
}
function recordOf(turn, context) {
  const work = turn.headless ? turn.lines : turn.lines.filter((line) => !isSessionLine(line));
  if (work.length === 0) return void 0;
  const tools = work.filter((line) => line.hook_event_name === "postToolUse" || line.hook_event_name === "postToolUseFailure").map(toolCallOf);
  const steps = work.filter((line) => line.hook_event_name === "subagentStop").map((line) => stepOf(line, tools));
  const items = [...tools, ...steps];
  const order = new Map(items.map((item, index) => [item, index]));
  items.sort((a, b) => Number(a.start) - Number(b.start) || order.get(a) - order.get(b));
  const times = [...work.map((line) => line.at), ...items.flatMap((item) => [Number(item.start), Number(item.end)])];
  const start = times.reduce((a, b) => Math.min(a, b));
  const end = times.reduce((a, b) => Math.max(a, b));
  const inside = [];
  const model = work.findLast((line) => line.model_id !== void 0)?.model_id ?? work.findLast((line) => line.model !== void 0)?.model;
  const answered = turn.headless || work.some((line) => line.hook_event_name !== "beforeSubmitPrompt");
  if (model !== void 0 && answered) {
    const call = { type: "model_call", model: modelOf(model), provider: PROVIDER, start, end };
    const usage = usageOf(turn);
    if (usage !== void 0) call.usage = usage;
    inside.push(call);
  }
  inside.push(...items);
  const record = {
    runId: runIdOf(context.conversationId, turn.id),
    agent: AGENT,
    sessionId: context.conversationId,
    start,
    end,
    inside
  };
  const outcome = outcomeOf(turn, context);
  if (outcome.errorType !== void 0) record.errorType = outcome.errorType;
  if (outcome.cancelled === true) record.cancelled = true;
  return record;
}

// src/state.ts
import { randomUUID } from "crypto";
import { closeSync, fsyncSync, mkdirSync, openSync, readFileSync, readdirSync, renameSync, rmSync, statSync, utimesSync, writeFileSync } from "fs";
import { join } from "path";
import { setTimeout as sleep } from "timers/promises";
var SENT_KEPT = 64;
function markLeft(dir, conversationId, left) {
  const path = join(dir, `${conversationId}.left`);
  if (left !== void 0) writeFileSync(path, JSON.stringify(left), { mode: 384 });
  else rmSync(path, { force: true });
}
function readLeft(dir, conversationId) {
  try {
    const value = JSON.parse(readFileSync(join(dir, `${conversationId}.left`), "utf8"));
    return value !== null && typeof value.at === "number" && Number.isFinite(value.at) && typeof value.destination === "string" ? { at: value.at, destination: value.destination } : void 0;
  } catch {
    return void 0;
  }
}
function leftOf(dir, except) {
  let names = [];
  try {
    names = readdirSync(dir);
  } catch {
  }
  const waited = (name) => {
    try {
      return statSync(join(dir, name)).mtimeMs;
    } catch {
      return 0;
    }
  };
  return names.filter((name) => /^[A-Za-z0-9_-]{1,128}\.left$/.test(name)).sort((a, b) => waited(a) - waited(b) || a.localeCompare(b)).map((name) => name.slice(0, -".left".length)).filter((conversationId) => conversationId !== except);
}
function readState(dir, conversationId) {
  let text;
  try {
    text = readFileSync(join(dir, `${conversationId}.json`), "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return { sent: [] };
    throw error;
  }
  const value = JSON.parse(text);
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new TypeError("conversation state is not an object");
  const parsed = value;
  const state = {
    sent: Array.isArray(parsed.sent) ? parsed.sent.filter((id) => typeof id === "string") : []
  };
  if (parsed.warnedNoKey === true) state.warnedNoKey = true;
  if (parsed.warnedKeyFile === true) state.warnedKeyFile = true;
  if (parsed.warnedEndpoint === true) state.warnedEndpoint = true;
  return state;
}
function writeState(dir, conversationId, state) {
  mkdirSync(dir, { recursive: true, mode: 448 });
  const path = join(dir, `${conversationId}.json`);
  const next = { ...state, sent: state.sent.slice(-SENT_KEPT) };
  const temporary = `${path}.${process.pid}.tmp`;
  const fd = openSync(temporary, "w", 384);
  try {
    writeFileSync(fd, JSON.stringify(next));
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  renameSync(temporary, path);
}
var STALE_MS = 12e4;
async function withLock(dir, conversationId, waitMs, work, staleMs = STALE_MS) {
  mkdirSync(dir, { recursive: true, mode: 448 });
  const path = join(dir, `${conversationId}.lock`);
  const token = `${process.pid}:${randomUUID()}`;
  const deadline = Date.now() + waitMs;
  for (; ; ) {
    try {
      writeFileSync(path, token, { flag: "wx", mode: 384 });
      break;
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      try {
        if (Date.now() - statSync(path).mtimeMs > staleMs) rmSync(path, { force: true });
      } catch {
      }
      if (Date.now() >= deadline) return false;
      await sleep(200);
    }
  }
  const fresh = setInterval(() => {
    try {
      const now = /* @__PURE__ */ new Date();
      utimesSync(path, now, now);
    } catch {
    }
  }, staleMs / 4);
  fresh.unref();
  try {
    await work();
  } finally {
    clearInterval(fresh);
    try {
      if (readFileSync(path, "utf8") === token) rmSync(path, { force: true });
    } catch {
    }
  }
  return true;
}

// src/session.ts
var LOCK_WAIT_MS = 6e4;
async function sendAlone(deps, destination, record, refused) {
  let sender;
  try {
    sender = deps.sender(destination);
  } catch (error) {
    if (!(error instanceof TypeError)) throw error;
    refused(error.message);
    return false;
  }
  try {
    return await sender.send(record);
  } finally {
    await sender.close();
  }
}
function destinationOf(settings) {
  return createHmac("sha256", settings.apiKey ?? "").update(settings.endpoint ?? "").digest("hex").slice(0, 16);
}
async function sendLeft(own, settings, depsFor) {
  const destination = destinationOf(settings);
  for (const other of leftOf(settings.dir, own)) {
    const left = readLeft(settings.dir, other);
    if (left === void 0 || left.destination !== destination) continue;
    if (!await sync({ event: "sessionEnd", conversationId: other, at: left.at }, settings, depsFor(other), 0)) return;
  }
}
async function sync(input, settings, deps, waitFor) {
  const { apiKey } = settings;
  const waitMs = waitFor ?? (input.event === "sessionEnd" ? Number.POSITIVE_INFINITY : deps.lockWaitMs ?? LOCK_WAIT_MS);
  let reached = false;
  const locked = await withLock(settings.dir, input.conversationId, waitMs, async () => {
    let state;
    try {
      state = readState(settings.dir, input.conversationId);
    } catch (error) {
      deps.log(`state not read (${kindOf(error)}); read as none`);
      state = { sent: [] };
      writeState(settings.dir, input.conversationId, state);
    }
    const once = (flag, line) => {
      if (state[flag] === true) return;
      deps.log(line);
      state[flag] = true;
      writeState(settings.dir, input.conversationId, state);
    };
    if (settings.keyFileProblem !== void 0) {
      once("warnedKeyFile", `~/.cursor/telmoni.json not used (${settings.keyFileProblem}): fix it, or move it aside and run telmoni-cursor-observability setup, or set TELMONI_API_KEY, with TELMONI_ENDPOINT for a Telmoni of your own; nothing is sent until then`);
      return;
    }
    if (apiKey === void 0) {
      once("warnedNoKey", "no key: run telmoni-cursor-observability setup, or set TELMONI_API_KEY; nothing is sent until then");
      return;
    }
    const refused = (reason) => once(
      "warnedEndpoint",
      `endpoint refused by the SDK (${reason}): run telmoni-cursor-observability setup, or set TELMONI_ENDPOINT; nothing is sent until then`
    );
    recover(settings.dir, input.conversationId);
    const lines = readSpool(settings.dir, input.conversationId);
    if (lines.length === 0) {
      reached = true;
      markLeft(settings.dir, input.conversationId, void 0);
      return;
    }
    const sent = new Set(state.sent);
    const { turns, loose } = cut(lines, input.conversationId);
    const sessionEnds = lines.filter((line) => line.hook_event_name === "sessionEnd").sort(byTime);
    const lastEnd = sessionEnds.at(-1)?.at;
    const endedAt = input.at === void 0 || lastEnd !== void 0 && lastEnd > input.at ? lastEnd : input.at;
    const closing = new Set(ended(turns, input.event, endedAt));
    const spent = new Set(loose.map((line) => line.id));
    const due = [];
    for (const turn of turns) {
      if (sent.has(turn.id) || closing.has(turn) && !hasWork(turn)) {
        for (const line of turn.lines) spent.add(line.id);
      } else if (closing.has(turn)) {
        due.push(turn);
      }
    }
    if (due.length > 0 && turns.some((turn) => sent.has(turn.id))) {
      await compact(settings.dir, input.conversationId, spent);
      spent.clear();
    }
    const destination = { endpoint: settings.endpoint, apiKey };
    let since = 0;
    let kept = false;
    for (const turn of due) {
      const last = turn.lines.at(-1).at;
      const sessionEnd = sessionEnds.find((line) => line.at >= last);
      const record = recordOf(turn, { conversationId: input.conversationId, sessionEnd });
      const release = [...turn.lines].reverse().find((line) => line.cursor_version !== void 0)?.cursor_version;
      const to = release === void 0 ? destination : { ...destination, release };
      if (record !== void 0 && !await sendAlone(deps, to, record, refused)) {
        kept = true;
        break;
      }
      state.sent.push(turn.id);
      writeState(settings.dir, input.conversationId, state);
      for (const line of turn.lines) spent.add(line.id);
      if (++since >= SENT_KEPT / 2) {
        await compact(settings.dir, input.conversationId, spent);
        spent.clear();
        since = 0;
      }
    }
    await compact(settings.dir, input.conversationId, spent);
    if (input.event === "sessionEnd") {
      markLeft(settings.dir, input.conversationId, kept ? { at: endedAt ?? Date.now(), destination: destinationOf(settings) } : void 0);
    }
    reached = !kept;
  });
  if (!locked && waitFor !== 0) deps.log("busy: another copy of this conversation held the lock past its wait; the next stop or the session's end sends what is left");
  return reached;
}
export {
  sendLeft,
  sync
};
