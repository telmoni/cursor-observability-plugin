/**
 * What a hook is handed by Cursor on stdin, and what of it is kept: the event, its time, its turn and model, and the
 * few values a run is built from, each checked to be a plain name, number or flag; everything else Cursor sends is never read.
 */

export const EVENTS = [
  'sessionStart',
  'beforeSubmitPrompt',
  'postToolUse',
  'postToolUseFailure',
  'subagentStop',
  'afterAgentResponse',
  'stop',
  'sessionEnd',
] as const;

export type CursorEvent = (typeof EVENTS)[number];

export function isEvent(value: unknown): value is CursorEvent {
  return typeof value === 'string' && (EVENTS as readonly string[]).includes(value);
}

/** The events whose hook hands the conversation to a detached copy, to send what has ended. */
export type ClosingEvent = 'stop' | 'sessionEnd';
const CLOSING: ReadonlySet<CursorEvent> = new Set<ClosingEvent>(['stop', 'sessionEnd']);

export function isClosing(value: unknown): value is ClosingEvent {
  return typeof value === 'string' && (CLOSING as ReadonlySet<string>).has(value);
}

/** What Cursor reads from a hook: leave to go on, and nothing else; `stop` gets no `followup_message`, which Cursor would send as the person's next prompt. */
export function answerFor(event: string | undefined): string {
  return event === 'beforeSubmitPrompt' ? '{"continue":true}' : '{}';
}

export type Status = 'completed' | 'aborted' | 'error';

/** One event of a conversation, as the plugin keeps it: a line of the conversation's spool. */
export interface Line {
  /** Random, so a line read twice counts once. */
  id: string;
  /** When the hook started, in milliseconds since the epoch: Cursor's input carries no time. */
  at: number;
  hook_event_name: CursorEvent;
  /** The turn: Cursor's id for the work one prompt started. */
  generation_id?: string;
  model?: string;
  model_id?: string;
  tool_name?: string;
  /** How long the tool ran, in milliseconds. */
  duration?: number;
  failure_type?: 'error' | 'timeout' | 'permission_denied';
  is_interrupt?: boolean;
  subagent_type?: string;
  /** How long the subagent ran, in milliseconds. */
  duration_ms?: number;
  status?: Status;
  reason?: Status | 'window_close' | 'user_close';
  final_status?: Status;
  input_tokens?: number;
  output_tokens?: number;
  cache_read_tokens?: number;
  cache_write_tokens?: number;
  /** The editor that ran the turn, sent as its release. */
  cursor_version?: string;
}

type Check = (value: unknown) => unknown;

/** Cursor's ids name files and runs here: anything but a plain id is refused. */
const ID = /^[A-Za-z0-9_-]{1,128}$/;

export function isId(value: unknown): value is string {
  return typeof value === 'string' && ID.test(value);
}

const matching =
  (pattern: RegExp): Check =>
  (value) =>
    typeof value === 'string' && pattern.test(value) ? value : undefined;

const oneOf =
  (...values: string[]): Check =>
  (value) =>
    typeof value === 'string' && values.includes(value) ? value : undefined;

/** No tool, subagent or session runs longer than this; a larger number is not a duration. */
const MAX_MS = 7 * 24 * 60 * 60 * 1000;

const milliseconds: Check = (value) =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= MAX_MS ? value : undefined;

const count: Check = (value) =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER
    ? Math.trunc(value)
    : undefined;

const flag: Check = (value) => (typeof value === 'boolean' ? value : undefined);

const generation: Check = (value) => (isId(value) ? value : undefined);
// A model's slug (`claude-opus-4-7-thinking-max`), a tool's name (`Shell`, `MCP:create_issue`) or a subagent's kind (`explore`): names, never text.
const model = matching(/^[\w.:\/@+ ()-]{1,128}$/);
const tool = matching(/^[\w.:\/@+-]{1,160}$/);
const subagent = matching(/^[\w.:-]{1,64}$/);
const status = oneOf('completed', 'aborted', 'error');

const TOKENS: Record<string, Check> = {
  input_tokens: count,
  output_tokens: count,
  cache_read_tokens: count,
  cache_write_tokens: count,
};

/** Of each event, the fields kept beside those every event keeps; nothing else is read. */
const KEPT: Record<CursorEvent, Record<string, Check>> = {
  sessionStart: {},
  beforeSubmitPrompt: {},
  postToolUse: { tool_name: tool, duration: milliseconds },
  postToolUseFailure: {
    tool_name: tool,
    duration: milliseconds,
    failure_type: oneOf('error', 'timeout', 'permission_denied'),
    is_interrupt: flag,
  },
  subagentStop: { subagent_type: subagent, status, duration_ms: milliseconds },
  // Undocumented: a turn's tokens, seen on both in Cursor's own payloads.
  afterAgentResponse: TOKENS,
  stop: { status, ...TOKENS },
  sessionEnd: {
    reason: oneOf('completed', 'aborted', 'error', 'window_close', 'user_close'),
    final_status: status,
  },
};

// The editor's version, a plain version or nothing, sent as the turn's release.
const version = matching(/^[\w.+-]{1,64}$/);
const EVERY: Record<string, Check> = { generation_id: generation, model, model_id: model, cursor_version: version };

/** A line read back from the spool, each field checked again as a hook checked it: a line torn or written by hand keeps nothing else. */
export function lineOf(raw: unknown): Line | undefined {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const fields = raw as Record<string, unknown>;
  const { id, at, hook_event_name: event } = fields;
  if (typeof id !== 'string' || typeof at !== 'number' || !Number.isFinite(at) || !isEvent(event)) return undefined;
  const line: Record<string, unknown> = { id, at, hook_event_name: event };
  for (const [name, check] of Object.entries({ ...EVERY, ...KEPT[event] })) {
    const value = check(fields[name]);
    if (value !== undefined) line[name] = value;
  }
  return line as unknown as Line;
}

/** An event Cursor handed a hook: the conversation it belongs to, and the line kept of it. */
export interface Received {
  conversationId: string;
  line: Line;
}

/**
 * The event `raw` as the plugin keeps it, or nothing where it is not an event of a conversation: `event` is the one the
 * hook was registered for, and Cursor's own name for it, where given, must agree.
 */
export function received(event: CursorEvent, raw: unknown, at: number, id: string): Received | undefined {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const fields = raw as Record<string, unknown>;
  const named = fields['hook_event_name'];
  if (named !== undefined && named !== event) return undefined;
  const conversationId = fields['conversation_id'];
  if (!isId(conversationId)) return undefined;
  const line: Record<string, unknown> = { id, at, hook_event_name: event };
  for (const [name, check] of Object.entries({ ...EVERY, ...KEPT[event] })) {
    const value = check(fields[name]);
    if (value !== undefined) line[name] = value;
  }
  return { conversationId, line: line as unknown as Line };
}
