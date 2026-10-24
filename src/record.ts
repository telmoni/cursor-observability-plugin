/**
 * A turn as a run record: the turn a run of `cursor`, the model and the turn's tokens one model call spanning the turn,
 * since Cursor reports the turn's tokens and never a call's, each tool a tool call, and each subagent a step.
 */

import { createHash } from 'node:crypto';

import type { ModelCallRecord, RecordOutcome, RunRecord, StepRecord, ToolCallRecord } from 'telmoni';

import type { Line } from './input.js';
import { type Turn, isSessionLine, sessionEndOf, stopOf } from './turns.js';

export const AGENT = 'cursor';

/** Cursor serves every model through its own backend, whichever lab made it. */
export const PROVIDER = 'cursor';

/** The plugin's own namespace for run ids, so no other tool's ids can meet them. */
const NAMESPACE = '4a535453-1668-44c0-9fb8-637aa6591fae';

/** How far outside a `Task` call's span a subagent's stop may fall and still be that call's work. */
const SLACK_MS = 2_000;

/** Ingest's caps, as the SDK's: a tool's name to 145 characters, a model's to 128, cut to fit, since past either the SDK refuses the whole turn. */
const NAME_MAX = 145;
const MODEL_MAX = 128;

/** `name` cut to `max` characters, as ingest counts them: never inside one. */
function fit(name: string, max: number): string {
  const characters = [...name];
  return characters.length > max ? characters.slice(0, max).join('') : name;
}

/** A file's path, which a custom model's name, set in a person's settings, may be: never sent. */
const PATH = /^(?:[/\\]|~(?:[/\\]|$)|\.{1,2}[/\\]|[A-Za-z]:[/\\]|file:)/i;

/** A path ending in a local model's weights, from anywhere: the file's name is the model's, and is sent without its folders. */
const MODEL_FILE = /[/\\]([^/\\]+\.(?:gguf|ggml|bin|safetensors|llamafile))$/i;

/** A model's name as Cursor gives it, cut to ingest's cap: a model file's own name for its path, `unknown` for any other path. */
function modelOf(name: string): string {
  const file = MODEL_FILE.exec(name.trim())?.[1];
  if (file !== undefined) return fit(file, MODEL_MAX);
  return PATH.test(name.trim()) ? 'unknown' : fit(name, MODEL_MAX);
}

/** A version 5 UUID (RFC 9562): the same turn always gets the same run id. */
export function uuid5(namespace: string, name: string): string {
  const hash = createHash('sha1').update(Buffer.from(namespace.replaceAll('-', ''), 'hex')).update(name, 'utf8').digest();
  hash[6] = ((hash[6] ?? 0) & 0x0f) | 0x50;
  hash[8] = ((hash[8] ?? 0) & 0x3f) | 0x80;
  const hex = hash.subarray(0, 16).toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function runIdOf(conversationId: string, turnId: string): string {
  return uuid5(NAMESPACE, `${conversationId}/${turnId}`);
}

export interface Context {
  conversationId: string;
  /** The session's end, where it closed the turn rather than the turn's own `stop`. */
  sessionEnd: Line | undefined;
}

/** Cursor's kinds of failure, as error types: a failed tool is a `ToolError`, as Claude Code's plugin names one. */
const FAILURES: Record<NonNullable<Line['failure_type']>, string> = {
  error: 'ToolError',
  timeout: 'TimeoutError',
  permission_denied: 'PermissionDenied',
};

/** An agent's loop, the turn's or a subagent's, that Cursor says ended in error. */
const AGENT_ERROR = 'AgentError';

function statusOutcome(status: string | undefined): RecordOutcome {
  if (status === 'aborted') return { cancelled: true };
  if (status === 'error') return { errorType: AGENT_ERROR };
  return {};
}

/**
 * Whether the turn completed, failed or was cancelled: its `stop` says; else the session's end, which completed a
 * headless session's work or cut the turn short; else nothing did, and the next turn began over it.
 */
function outcomeOf(turn: Turn, context: Context): RecordOutcome {
  const stop = stopOf(turn);
  if (stop !== undefined) return statusOutcome(stop.status);
  const end = sessionEndOf(turn) ?? context.sessionEnd;
  if (end === undefined) return { cancelled: true };
  // How the session ended, before its final status: a window closed on a turn still running cut that turn short, whatever the turns before it did.
  const status = end.reason ?? end.final_status;
  return status === 'completed' || status === 'error' ? statusOutcome(status) : { cancelled: true };
}

/**
 * The turn's tokens: its `stop`'s, else its last reply's. Cursor's input appears to count the cache's reads and writes
 * in already, as the SDK takes it; where it is less than those two, it cannot have, and they are added.
 */
function usageOf(turn: Turn): ModelCallRecord['usage'] {
  const has = (line: Line): boolean =>
    [line.input_tokens, line.output_tokens, line.cache_read_tokens, line.cache_write_tokens].some((n) => n !== undefined);
  const stop = stopOf(turn);
  const from =
    stop !== undefined && has(stop)
      ? stop
      : turn.lines.findLast((line) => line.hook_event_name === 'afterAgentResponse' && has(line));
  if (from === undefined) return undefined;
  const read = from.cache_read_tokens ?? 0;
  const write = from.cache_write_tokens ?? 0;
  let input = from.input_tokens ?? 0;
  if (input < read + write) input += read + write;
  return {
    inputTokens: input,
    outputTokens: from.output_tokens ?? 0,
    cacheReadInputTokens: read,
    cacheWriteInputTokens: write,
  };
}

function toolCallOf(line: Line): ToolCallRecord {
  const tool: ToolCallRecord = {
    type: 'tool_call',
    name: fit(line.tool_name ?? 'unknown', NAME_MAX),
    start: line.at - (line.duration ?? 0),
    end: line.at,
  };
  if (line.hook_event_name === 'postToolUseFailure') {
    if (line.is_interrupt === true) tool.cancelled = true;
    else tool.errorType = FAILURES[line.failure_type ?? 'error'];
  }
  return tool;
}

/** The `Task` call that ran a subagent stopping at `at`, taken out of `tools`: of those running then, the one ending nearest. */
function takeTask(tools: ToolCallRecord[], at: number): ToolCallRecord | undefined {
  let best = -1;
  for (let index = 0; index < tools.length; index++) {
    const tool = tools[index]!;
    if (tool.name.toLowerCase() !== 'task') continue;
    if (at < Number(tool.start) - SLACK_MS || at > Number(tool.end) + SLACK_MS) continue;
    if (best === -1 || Math.abs(Number(tool.end) - at) < Math.abs(Number(tools[best]!.end) - at)) best = index;
  }
  return best === -1 ? undefined : tools.splice(best, 1)[0];
}

/**
 * A subagent as a step, in place of the `Task` call that ran it, since a call beside a step of the same work would
 * count it twice. A background subagent's call, which ends as it starts, stays a call.
 */
function stepOf(line: Line, tools: ToolCallRecord[]): StepRecord {
  const end = line.at;
  const step: StepRecord = {
    type: 'step',
    name: `subagent ${line.subagent_type ?? 'unknown'}`,
    start: end - (line.duration_ms ?? 0),
    end,
  };
  const task = takeTask(tools, end);
  if (task !== undefined) {
    step.start = Math.min(Number(step.start), Number(task.start));
    step.end = Math.max(end, Number(task.end));
  }
  const outcome: RecordOutcome = line.status === undefined && task !== undefined ? task : statusOutcome(line.status);
  if (outcome.errorType !== undefined) step.errorType = outcome.errorType;
  if (outcome.cancelled === true) step.cancelled = true;
  return step;
}

/** The turn as a run, or nothing where it holds none of the agent's work. */
export function recordOf(turn: Turn, context: Context): RunRecord | undefined {
  // A session's start and end bound a headless session's work; in the editor they may come long after the turn, and bound nothing of it.
  const work = turn.headless ? turn.lines : turn.lines.filter((line) => !isSessionLine(line));
  if (work.length === 0) return undefined;
  const tools = work
    .filter((line) => line.hook_event_name === 'postToolUse' || line.hook_event_name === 'postToolUseFailure')
    .map(toolCallOf);
  const steps = work.filter((line) => line.hook_event_name === 'subagentStop').map((line) => stepOf(line, tools));
  const items: Array<ToolCallRecord | StepRecord> = [...tools, ...steps];
  // In the order they started, so the record and the ids derived from each span's place come out the same however often the turn is read.
  const order = new Map(items.map((item, index) => [item, index]));
  items.sort((a, b) => Number(a.start) - Number(b.start) || order.get(a)! - order.get(b)!);
  // Reduced rather than spread: a turn of many thousand tool calls would pass more arguments than a call takes.
  const times = [...work.map((line) => line.at), ...items.flatMap((item) => [Number(item.start), Number(item.end)])];
  const start = times.reduce((a, b) => Math.min(a, b));
  const end = times.reduce((a, b) => Math.max(a, b));
  const inside: Array<ModelCallRecord | ToolCallRecord | StepRecord> = [];
  // The structured id names the model as its maker does (`claude-opus-4-7`); the legacy slug, which every event carries, adds Cursor's settings to it.
  const model =
    work.findLast((line) => line.model_id !== undefined)?.model_id ??
    work.findLast((line) => line.model !== undefined)?.model;
  // A prompt alone, which nothing answered, is no model call.
  const answered = turn.headless || work.some((line) => line.hook_event_name !== 'beforeSubmitPrompt');
  if (model !== undefined && answered) {
    const call: ModelCallRecord = { type: 'model_call', model: modelOf(model), provider: PROVIDER, start, end };
    const usage = usageOf(turn);
    if (usage !== undefined) call.usage = usage;
    inside.push(call);
  }
  inside.push(...items);
  const record: RunRecord = {
    runId: runIdOf(context.conversationId, turn.id),
    agent: AGENT,
    sessionId: context.conversationId,
    start,
    end,
    inside,
  };
  const outcome = outcomeOf(turn, context);
  if (outcome.errorType !== undefined) record.errorType = outcome.errorType;
  if (outcome.cancelled === true) record.cancelled = true;
  return record;
}
