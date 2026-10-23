# Architecture

How the Cursor plugin records a conversation, and why it is built so. What a person installs and sees is the book's page, [telmoni.com/docs/api/coding-agents](https://telmoni.com/docs/api/coding-agents).

## The shape

```
Cursor ──(sessionStart, beforeSubmitPrompt, postToolUse, postToolUseFailure,
          subagentStop, afterAgentResponse, stop, sessionEnd)──▶ telmoni-cursor-observability hook <event>
                              │ answers, keeps the event's metadata in the conversation's spool, exits 0;
                              │ at stop and sessionEnd starts a detached copy first
                              ▼
               the copy: waits 1 s, takes the conversation's lock, reads the spool,
               cuts it into turns, and for each that has ended:
               RunRecord ──▶ the SDK's recordRun ──▶ POST /otlp/v1/traces
               then marks it sent and takes its lines out of the spool
```

A turn of the agent — the work one prompt starts, which Cursor names with a generation id — is a run of `cursor`; the conversation's id is the run's session, so a conversation reads in the console as a session of traces. The turn's model and tokens are one model call spanning the turn, each tool a tool call, and each subagent a step. Cursor's transcript is not read: it holds the conversation's text, and no times, tokens or tool results.

## The hooks, and why these

Cursor runs a command for each event a `hooks.json` names, hands it the event as JSON on stdin and reads its answer from stdout. The plugin is registered for eight, all of them hooks whose answer can block nothing:

| Hook | What it gives a run |
|---|---|
| `beforeSubmitPrompt` | The turn's start. Answered `{"continue":true}`. |
| `postToolUse`, `postToolUseFailure` | Each tool's name, its duration, and how it failed: `failure_type`, or `is_interrupt` where the person stopped it. |
| `subagentStop` | A subagent's kind, its status and its duration. |
| `afterAgentResponse`, `stop` | The turn's tokens, which Cursor puts on both, undocumented; `stop`'s status, the turn's outcome. |
| `sessionStart`, `sessionEnd` | Where the headless CLI's session, its one turn, begins and ends, and how it ended (`reason`, `final_status`). |

The rest answer `{}`. The permission hooks — `preToolUse`, `beforeShellExecution`, `beforeMCPExecution`, `beforeReadFile`, `beforeTabFileRead`, `subagentStart` — are never registered: Cursor blocks the person's action on an answer it cannot read from one of those, whatever the hook meant. `postToolUse` and `postToolUseFailure` fire for every tool, the shell, file edits and MCP calls among them, with a duration and an outcome, and run in cloud agents, so the older per-tool hooks — `afterShellExecution`, `afterFileEdit` and `afterMCPExecution`, the last of which cloud agents never run — are not registered beside them, where they would keep the same call twice.

## A hook that never holds the agent

Cursor waits on its hooks, on one per tool call among them, so a hook's cost is a cost on every step the agent takes. The hook writes its answer first, straight to the file descriptor, then reads the event from file descriptor 0 to its end, which Cursor closes once it has written the event, as the shell hooks its documentation shows rely on (`input=$(cat)`): `process.stdin` and `process.stdout` on Cursor's pipes are sockets' streams, and each costs a hook more than all the rest of its work. An input that cannot be read without waiting is read as a stream instead, which the hook lets go of, logging it, where Cursor has not closed it within five seconds. It never loads the SDK, whose OpenTelemetry costs a process about 70 ms to evaluate: tsup splits the sending code into chunks that only the detached copy imports, and a test holds the hook's entry, and all it imports at once, to none of it. A hook so costs about what Node costs to start, and some 10 ms more.

At `stop` and `sessionEnd` the hook starts a copy of itself, detached, in a session of its own and with no stdio, so the end of the hook's process group is not its end, handing it the event and the conversation's id in its environment rather than its command line, which anyone on the machine can list. Then it exits 0, so a slow network or a Telmoni that does not answer never slows a turn. Whatever goes wrong after is a line in `hook.log`, never an error Cursor shows.

## What is kept

Cursor puts the person's email, the workspace's folders and the transcript's path in every event, and the prompt, the reply, a tool's input and output, a command, a file's edits, a subagent's task and summary, an error's message and a branch in some. The hook keeps a line of each event made from an allowlist (`src/input.ts`): the event, the time the hook started, the generation id, the model's slug and structured id, and of each event the fields the table above names — each kept only where it is a plain name, a number or a flag, so nothing written in place of one passes either. `CURSOR_USER_EMAIL` is never read. Without a key nothing is sent, so nothing is kept.

A name is cut to what ingest takes for a span's, rather than have the span refused: 128 characters of a tool's, which names its call, and 123 of a model's, whose call is named `chat <model>`.

## Turns

A turn is every line that carries its generation id. A line that comes without one goes to the latest turn begun before it, until the session's next start or end, its stop past or not: a subagent's stop among them, which Cursor fires in the parent's conversation with the conversation's own id where the turn's would be (Cursor's staff, forum topic 163054), and which comes after the turn's own stop where the person stopped the turn over the subagent. One that comes after its turn was sent is dropped; a subagent's stop never makes a run of its own.

A subagent's own calls are in no run of its parent's: Cursor runs them under a conversation of their own, with nothing in them naming the parent (the same topic). Their lines wait in that conversation's spool, and go as a run of that conversation only where Cursor ends a turn there.

Cursor's headless CLI (`agent -p`) fires no prompt, reply or `stop` hook, and gives every event the conversation's own id where a generation id would be. There a turn is a session's work, from its `sessionStart` to its `sessionEnd`, a session that answered without a tool among them. Every session of a conversation resumed headless carries the same id, so such a turn is named by the conversation and the time its session began. A session's start and end in the editor carry no turn's id, and are no run.

**When a turn has ended.** At `stop`: each turn Cursor stopped, each headless session that ended, and any turn that went quiet before the last stopped one began, whose own stop never came. At `sessionEnd`: every turn begun before the session's end; one begun after is a session resumed, and waits for its own end.

**Outcomes.** `stop`'s status says: `aborted` cancels the run, and `error` fails it as an `AgentError`. A turn with no `stop` takes how the session ended — `completed`, or `error` — and is cancelled where the window or the chat was closed on it, or where the next turn began over it. A tool that failed is failed with Cursor's kind of failure: a `TimeoutError`, a `PermissionDenied`, or a `ToolError`, as Claude Code's plugin names a failed tool; one the person interrupted is cancelled.

## Tokens

Cursor reports a turn's tokens, never a call's, so the turn's model is one model call spanning the turn: `model_id` where Cursor gives it, which names the model as its maker does (`claude-opus-4-7`), else the legacy slug every event carries (`claude-opus-4-7-thinking-max`). The tokens are `stop`'s, else the last reply's. The SDK takes input as the GenAI conventions count it, the cache's reads and writes among it. Cursor's `input_tokens` appears to count them in already: in every payload seen it is larger than the cache's reads, and Langfuse's plugin reads it so. It is taken as given; where it is less than the cache's reads and writes together it cannot hold them, and they are added. Cursor does not document the four fields.

## Times

Cursor's input carries no time. A line's time is when Cursor started the hook (`performance.timeOrigin`), a moment after the event. A tool call ends then and starts its `duration` earlier; a subagent's step ends at its stop and starts its `duration_ms` earlier. A subagent runs inside the `Task` call that started it, so the `Task` call running as a subagent stopped, the one ending nearest, becomes that subagent's step and is no call of its own: a call beside a step of the same work would count it twice. A background subagent's `Task` call, which returns as it starts, stays a call. The run runs from the first of its times to the last; a session's start and end bound a headless turn, and in the editor, where they may come long after, nothing.

## Ids, and sending each turn once

A run's id is a version 5 UUID of the conversation's id and the turn's, under the plugin's own namespace, so a turn read twice is the same run, by every version of the plugin. The SDK derives every span's id from the run's id and its place in the record, and a turn's lines are ordered by time and then by their own random ids, so the same turn sent again is the same bytes; ingest's claim on a body answers a second copy as it answered the first, for an hour. Past the hour a copy is stored again: ingest keeps no span's id unique.

Each turn goes in an export of its own, through a client of its own, flushed before the next, and is marked sent (`<conversation>.json`) once ingest has every export of it: a turn the platform took is never sent again, and one it did not — Telmoni unreachable, or busy past the SDK's retries — is sent by the next copy, and nothing after it before then. A turn's flush waits out the SDK's worst case for each of its exports of 512 spans, 150 s — three attempts of ten seconds, with the longest `Retry-After` it honours, a minute, between each two — and thirty seconds more: a turn the platform took late is never counted as not sent, to be stored again past the hour. A turn ingest took less a span it refused, or an attribute it dropped, counts as taken, and the log names what, for every turn, since the SDK warns of each kind once a client: sent again, it would be answered the same, and hold up every turn after it. A turn the SDK itself refuses — an impossible time — is logged and passed over, for the same reason. The SDK's queue takes a turn whole, past its own bound of 2,048 spans, which a long cloud agent's turn would pass. A line that comes after its turn was sent is dropped, rather than sent as a second run under the same id.

A lock per conversation (`<conversation>.lock`) keeps a `stop`'s copy and a `sessionEnd`'s from sending the same turns at once. A `stop`'s copy that waits a minute without it gives up, and the conversation's next stop or end sends what it leaves; a `sessionEnd`'s copy, which no hook need follow, waits on for as long as a live copy holds the lock, whose time only its sends bound, while a dead one's lock goes stale and is taken. The copy holding it touches it every thirty seconds, and a lock untouched for two minutes is taken as left by a copy that died: a copy still sending a long turn is never taken for one. A copy lets go of its own lock alone, known by the token it wrote into it, and never of one another copy took from it as stale. Hooks append without a lock, so Cursor never waits on one. The copy compacts the spool by moving it aside, waiting a tenth of a second for a hook that had it open, and appending back what it keeps; a copy that dies doing so leaves the file aside, and the next puts it back, every line read once by its id. A spool, or one set aside, that cannot be read is never taken for an empty one: it is left as it is, and the log names the kind. A line torn by a write cut short — a full disk — is lost alone: the next hook's line, appended onto it, is read from where it begins, since every line is written with its id first. The hook only appends, so its cost is the same beside a spool of half a million lines; a copy reads the spool whole, which compaction keeps to the turns not yet sent, and caught up two thousand turns in four seconds, sending aside.

## Where things are kept

In `~/.cursor/telmoni/`: `<conversation>.jsonl` (the lines of turns not yet sent), `<conversation>.json` (the turns sent, and whether a missing key or a refused endpoint was logged), the locks, `hook.log`, moved to `hook.log.1` past a megabyte, and each `hooks.json` as setup found it (`hooks.json.found-<hash of its path>`). All of it mode `600` in a folder of mode `700`. A conversation untouched for a week is over, and what is left of it is deleted.

The key and the endpoint are `TELMONI_API_KEY` and `TELMONI_ENDPOINT`, as the SDKs read them — how a cloud agent is handed its key, as a secret — or, unset, `~/.cursor/telmoni.json`, mode `600`, which `setup` writes. Without a key nothing is kept or sent, and the log says so once per conversation. An endpoint the SDK refuses, as setup would have, is named in the log once per conversation in the SDK's words, which name its host at most, never its path, its userinfo or the key; nothing is sent until it changes, and the turns wait in the spool. The provider is `cursor`: Cursor serves every model through its own backend, whichever lab made it.

## Two places, one conversation

The editor's agent reads the user's hooks (`~/.cursor/hooks.json`) and the workspace's (`.cursor/hooks.json`), and runs both; a cloud agent never sees a home folder and runs the workspace's alone. Where both run the plugin, the user's hook stands aside — it finds the plugin's repository entries, which pass `--project`, among the workspace's hooks (`CURSOR_PROJECT_DIR`) — and the workspace's records the conversation, rather than every event be kept twice. A workspace that is the home folder has the person's own hooks file for its `.cursor/hooks.json`, and there nothing stands aside. The workspace's hooks run `telmoni-cursor-observability hook <event> --project`, through `PATH`, since they run on teammates' machines and in cloud agents' VMs, wherever each installed the package; `--project` tells the hook which it is.

## Setup

`telmoni-cursor-observability setup` merges the plugin's hooks into the user's `hooks.json`, keeping `"version": 1` and every other tool's entries as they were, and tells its own apart by the command they run (`telmoni-cursor-observability`, or the bundle `telmoni-cursor-observability.mjs`, then `hook`): a second run replaces them rather than doubling them. `remove` takes them out: where the file is as setup left it, it puts back the very bytes setup found there, kept in the plugin's folder before its hooks first went in; where anything else in it has changed since, it writes what is left, and deletes the file where nothing is. The user's hooks run the node that ran setup and the installed bundle, both by absolute path: Cursor opened from the Dock or a launcher has no shell's `PATH`. The node is the one on `PATH` where it is the same binary — Homebrew's link, which outlives an upgrade — else the running one's own path. Each path is in single quotes: a POSIX shell expands nothing inside them, and on Windows, where Cursor runs a hook's command inside PowerShell (Cursor's staff, forum topic 168129), PowerShell reads nothing but a quote doubled; there the command opens with `&`, since PowerShell reads a quoted path that opens a command as a string, not a program. PowerShell pipes the event in with a byte order mark before it, which the hook reads past. A `hooks.json` that is a link, kept among someone's dotfiles, is written through. A `hooks.json` the plugin cannot read as Cursor does is left alone, and setup changes nothing.

The key is checked for its shape alone — `telmoni_` and 43 characters of URL-safe base64, as the platform mints one — and never sent by setup: the first turn's export tells whether the platform takes it, in `hook.log`. The endpoint is checked by the SDK itself, a client made with it and shut down, sending nothing, so setup takes exactly what a copy sends to: HTTPS, or plain HTTP to this machine alone, since every export carries the key. Of one it refuses, setup shows the SDK's reason, which names the host at most.

## Claude Code

Cursor runs Claude Code's hooks too, an installed plugin's among them, handing them its own events. Telmoni's Claude Code plugin does nothing where its input carries `cursor_version` or `CURSOR_VERSION` is set: this plugin records those conversations.

## What ships

The npm package `@telmoni/cursor-observability-plugin` holds `dist/` — tsup's bundle of the plugin, the SDK and OpenTelemetry, split so the hook's entry (`dist/telmoni-cursor-observability.mjs`, the bin `telmoni-cursor-observability`) loads none of the SDK — beside `package.json`, `README.md` and `LICENSE`, which npm always adds; it needs Node 22.23.4, 24.22.1, 26.12.1 or later, October 2026's security releases, as `engines` says, and nothing installed beside it. A person installs it with `npm install -g`, never by cloning the repository into `~/.cursor/plugins/local/`, which would bring its source and tests. A listing in Cursor's marketplace, which installs from a Git repository, waits until one can install no more than the package.

**A release** is the version bumped in one commit on `main` — `package.json` and both of `package-lock.json`'s — and nothing else by hand. Its push starts `.github/workflows/release.yml`, which waits for CI to pass on that commit, verifies and packs the package as CI does, and waits for the owner's approval in its `release` environment: one job tags the commit `v*`, and another stages the package on npm by trusted publishing, with provenance, so no token is stored anywhere. The GitHub release follows, and the version goes live once the owner approves it in the package's *Staged Packages* tab on npmjs.com. `0.1.0` went up by hand, untagged, so the first release from CI is the next version.

The SDK is a development dependency, the registry's `telmoni`, bundled at build.

## Testing

`tests/` runs what a hook keeps of each event over synthetic conversations (`tests/fixtures/`), written from Cursor's documented payloads with an email, paths and text planted in every field the plugin must never keep; cutting a spool into turns, and which have ended, a subagent's late stop among them; the record of each, a background subagent's `Task` call kept a call among them, and of hundreds of random turns, their clocks run back, through the SDK's own `recordRun`; the run's id against values Python's `uuid5` derives; the copy's work against a fake sender: a late line, a sender that fails, a copy that died before saving, no key, four hundred turns at once, a spool emptied mid-turn, a state cut short; compaction while a hook appends; a line torn by a full disk; a spool that cannot be read, kept; the log moved aside past a megabyte; the lock, kept fresh, taken when stale, let go of by its holder alone, given up at a stop and outwaited at the session's end; an endpoint the SDK refuses, named once a conversation; setup and remove against a `hooks.json` holding other tools' hooks, its bytes put back, the endpoints setup takes as the SDK does, and the node on `PATH` it prefers; the sender through the real SDK to a fake ingest that caps names and claims bodies as ingest does: a turn of three thousand calls, a span refused and logged turn by turn, a turn sent twice, and a flush's bound; and the built binary as Cursor runs it, a process handed the event on stdin that must answer and exit at once while its copy sends: hooks run at once, Telmoni down and back, a subagent's own conversation, an event as PowerShell pipes it, an input Cursor never closes, the copy's command line and process group, every file's mode and content, the hook's entry free of the SDK, and the commands setup writes, run through a shell. The suites run one file at a time, since the binary's are timed, and wait on a copy's exit and its lock let go, never on a fixed time.

## Not confirmed

Cursor documents none of these, and none has been seen in a session of the plugin's own: each is how the plugin reads what Cursor's forum and Langfuse's plugin have seen, and a real session should settle it.

- That `input_tokens` counts the cache's reads and writes in, and `output_tokens` the model's reasoning, as the SDK counts them. In a payload posted to Cursor's forum (3.16.17) the input is larger than the cache's reads, and Langfuse's plugin reads it so; a turn whose cache's reads pass its input would show otherwise.
- That `afterAgentResponse`, where it fires more than once a turn, carries the turn's tokens so far rather than one reply's: in a session Langfuse recorded (3.20.10) it fired once a turn, two replies in it, so the question did not arise there.
- That an MCP tool's `postToolUse` names it `MCP:<tool>`: the documentation gives that form for the matchers alone. The name is kept as Cursor gives it.
- Where a subagent's own calls go once it ends: Cursor runs them under a conversation of their own (Cursor's staff, of 3.7.27, still so on 2026-09-25); whether a `stop` ever fires there, which would send them as a run of that conversation.
- That a detached copy outlives a cloud agent's VM long enough to send the turn that ended last; a cloud agent fires no `sessionStart` or `sessionEnd`.
- That Cursor on Windows runs the editor's hooks as its CLI does, in PowerShell: the hook's command and its input were run so, in PowerShell 7.6 on Linux, never on Windows itself. Whether a copy there outlives the hook, and whether a repository's hooks, which run npm's shim through `PATH`, are let run it by PowerShell's execution policy.
- That a multi-root workspace's `CURSOR_PROJECT_DIR` names the root whose `.cursor/hooks.json` Cursor runs: where it runs another root's too, the person's own hooks do not stand aside, and every event is kept twice.
