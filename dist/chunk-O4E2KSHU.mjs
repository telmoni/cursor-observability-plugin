// src/input.ts
var EVENTS = [
  "sessionStart",
  "beforeSubmitPrompt",
  "postToolUse",
  "postToolUseFailure",
  "subagentStop",
  "afterAgentResponse",
  "stop",
  "sessionEnd"
];
function isEvent(value) {
  return typeof value === "string" && EVENTS.includes(value);
}
var CLOSING = /* @__PURE__ */ new Set(["stop", "sessionEnd"]);
function isClosing(value) {
  return typeof value === "string" && CLOSING.has(value);
}
function answerFor(event) {
  return event === "beforeSubmitPrompt" ? '{"continue":true}' : "{}";
}
var ID = /^[A-Za-z0-9_-]{1,128}$/;
function isId(value) {
  return typeof value === "string" && ID.test(value);
}
var matching = (pattern) => (value) => typeof value === "string" && pattern.test(value) ? value : void 0;
var oneOf = (...values) => (value) => typeof value === "string" && values.includes(value) ? value : void 0;
var MAX_MS = 7 * 24 * 60 * 60 * 1e3;
var milliseconds = (value) => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= MAX_MS ? value : void 0;
var count = (value) => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER ? Math.trunc(value) : void 0;
var flag = (value) => typeof value === "boolean" ? value : void 0;
var generation = (value) => isId(value) ? value : void 0;
var model = matching(/^[\w.:\/@+ ()-]{1,128}$/);
var tool = matching(/^[\w.:\/@+-]{1,160}$/);
var subagent = matching(/^[\w.:-]{1,64}$/);
var status = oneOf("completed", "aborted", "error");
var TOKENS = {
  input_tokens: count,
  output_tokens: count,
  cache_read_tokens: count,
  cache_write_tokens: count
};
var KEPT = {
  sessionStart: {},
  beforeSubmitPrompt: {},
  postToolUse: { tool_name: tool, duration: milliseconds },
  postToolUseFailure: {
    tool_name: tool,
    duration: milliseconds,
    failure_type: oneOf("error", "timeout", "permission_denied"),
    is_interrupt: flag
  },
  subagentStop: { subagent_type: subagent, status, duration_ms: milliseconds },
  // Undocumented: a turn's tokens, seen on both in Cursor's own payloads.
  afterAgentResponse: TOKENS,
  stop: { status, ...TOKENS },
  sessionEnd: {
    reason: oneOf("completed", "aborted", "error", "window_close", "user_close"),
    final_status: status
  }
};
var version = matching(/^[\w.+-]{1,64}$/);
var EVERY = { generation_id: generation, model, model_id: model, cursor_version: version };
function received(event, raw, at, id) {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return void 0;
  const fields = raw;
  const named = fields["hook_event_name"];
  if (named !== void 0 && named !== event) return void 0;
  const conversationId = fields["conversation_id"];
  if (!isId(conversationId)) return void 0;
  const line = { id, at, hook_event_name: event };
  for (const [name, check] of Object.entries({ ...EVERY, ...KEPT[event] })) {
    const value = check(fields[name]);
    if (value !== void 0) line[name] = value;
  }
  return { conversationId, line };
}

// src/log.ts
import { appendFileSync, mkdirSync, renameSync, statSync } from "fs";
import { join } from "path";
var MAX_BYTES = 1024 * 1024;
function log(dir, line) {
  try {
    mkdirSync(dir, { recursive: true, mode: 448 });
    const path = join(dir, "hook.log");
    try {
      if (statSync(path).size > MAX_BYTES) renameSync(path, `${path}.1`);
    } catch {
    }
    appendFileSync(path, `${(/* @__PURE__ */ new Date()).toISOString()} ${line}
`, { mode: 384 });
  } catch {
  }
}
function kindOf(error) {
  if (error instanceof Error) {
    const code = error.code;
    return typeof code === "string" ? `${error.name}:${code}` : error.name;
  }
  return typeof error;
}

export {
  EVENTS,
  isEvent,
  isClosing,
  answerFor,
  isId,
  received,
  log,
  kindOf
};
