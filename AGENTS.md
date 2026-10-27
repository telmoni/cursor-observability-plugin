# Telmoni for Cursor — Agent Guidelines

The Cursor plugin for Telmoni ([`telmoni/cursor-observability-plugin`](https://github.com/telmoni/cursor-observability-plugin)): hooks that record each turn of a person's Cursor agent conversations as a run, metadata only, through the TypeScript SDK of the platform ([`telmoni/telmoni`](https://github.com/telmoni/telmoni), `sdk/typescript`). It reaches a person's machine as the npm package `@telmoni/cursor-observability-plugin`, installed with `npm install -g` and wired into Cursor by its `telmoni-cursor-observability setup`, or as a Cursor plugin from this repository itself, whose hooks run the bundle committed in `dist/`. The repository is public, and every file in it is published as written.

## Ground Rules
- **Pre-launch:** nothing has shipped. Change the record, the spool, the state and the hooks to their ideal state; no migration paths.
- **Quality gate:** never weaken a test or leave the tree broken.
- **Ask first:** any dependency change (an edit to `package.json` or `package-lock.json`, lockfile-only refreshes included) and any external-state change (publishing to npm, a listing in Cursor's marketplace, a call to a live Telmoni with a real key).
- **Metadata only, by construction:** a record holds a model, token counts, tool names, subagent kinds, times and outcomes. Never a prompt, a reply, a thought, a tool's input or output, a command, a file's path or edits, the workspace's folders, a subagent's task or summary, an error's message, a branch or an email. What a hook keeps of an event is an allowlist (`src/input.ts`), each value a plain name, number or flag; nothing else Cursor sends is read, and `CURSOR_USER_EMAIL` never is.
- **Observe-only:** register no hook whose answer can block the person — `preToolUse`, `beforeShellExecution`, `beforeMCPExecution`, `beforeReadFile`, `subagentStart` — since Cursor blocks on an answer it cannot read from one. Every hook answers `{}`, or `{"continue":true}` at `beforeSubmitPrompt`, and exits 0.
- **The agent never waits:** Cursor waits on every hook, so the hook answers first, never loads the SDK, and hands sending to a detached copy of itself; a failure is a line in `hook.log` naming its kind, never anything from the conversation.

## Where Things Live
| Path | What |
|---|---|
| `src/cli.ts` | The bin, `telmoni-cursor-observability`: `setup`, `remove` and `hook <event>`. |
| `src/hook.ts` | What Cursor runs at each event: answers, keeps the event's line, starts the detached copy at `stop` and `sessionEnd`, exits. |
| `src/input.ts` | The events, their answers, and the allowlist of what is kept of each. |
| `src/spool.ts`, `src/turns.ts` | Each conversation's spool of lines, and the spool cut into turns, and which have ended. |
| `src/record.ts` | A turn as the SDK's `RunRecord`; the run id derived from the conversation and the turn. |
| `src/session.ts` | The copy's work on one conversation: the turns that have ended, each sent and marked sent, then taken out of the spool. |
| `src/send.ts`, `src/state.ts`, `src/settings.ts`, `src/log.ts` | Sending through the SDK; each conversation's state and lock; the key, endpoint and folder; `hook.log`. |
| `src/setup.ts`, `src/hooks.ts` | `setup` and `remove`; Cursor's `hooks.json` and the plugin's entries in it. |
| `tests/` | The suites; `tests/fixtures/` holds synthetic conversations written from Cursor's documented payloads. |
| `.cursor-plugin/plugin.json`, `hooks/hooks.json`, `dist/` | The repository as a Cursor plugin: the manifest, its `version` the package's; the hooks file, the eight events each running the bundle at `${CURSOR_PLUGIN_ROOT}`; and the bundle itself, committed. |
| `ARCHITECTURE.md` | How the plugin works, and why. |
| [`telmoni/telmoni`](https://github.com/telmoni/telmoni) | Sibling repo, checked out as `../telmoni`: the SDK this plugin is built on (`sdk/typescript`, `recordRun`), which it takes from npm as `telmoni`, and the book, whose `web/content/docs/api/coding-agents.mdx` documents this plugin. |

## Commands
- **After every change** (no permission needed; report failures verbatim): `make check` — the types, the bundle and the suites (`npm run verify`). The suites run the built binary, under a home folder of their own.
- **Locally:** `node dist/telmoni-cursor-observability.mjs setup` wires the build in this checkout into `~/.cursor/hooks.json`, `remove` takes it out again; `HOME=$(mktemp -d) node dist/telmoni-cursor-observability.mjs setup` shows what it writes without touching Cursor.

## Code Rules
- TypeScript on Node 22, bundled by tsup into `dist/`, the SDK inside it, split so the hook's entry loads none of the SDK: Cursor waits on every hook, and evaluating the SDK costs one about 70 ms. Import nothing into `cli.ts` or `hook.ts` that the hook does not need, and only what Node's startup already holds; anything else is imported where it is used. `dist/` is committed, since Cursor installs the repository as it stands: build before committing, and CI refuses a bundle that is not the commit's own build.
- Everything that leaves goes through the SDK's `recordRun`, never a request of the plugin's own: the contract, the content rules and the retries are the SDK's.
- Comments are for a person reading the code, and short: they say *why*, never *what* — a doc comment in a line or two, an inline comment in one, a test's doc in one line on what it proves. The reasoning behind a change (a race worked through, the designs turned down, its history) goes in `ARCHITECTURE.md` or the commit message, never above a function, and editing a comment means shortening its whole block. No AI signatures anywhere.
- Never log a key, a token or anything read from a conversation; log kinds.

## Agent Hygiene
- **This repo only:** change nothing in another repository unless the user says so for this task; that binds subagents too. Reading is fine.
- Edit `AGENTS.md` only when the user asks outright; otherwise propose a diff.
- No scripted bulk edits. One-off scripts and logs go in `/tmp/telmoni/`. A fixture is synthetic, written from Cursor's documented payloads, with an email, paths and text planted in every field the plugin must never keep (`tests/fixtures/README.md`); never a recorded conversation.
- Never read, print or copy a `.env` file, a person's `~/.cursor`, or Cursor's credentials, and never put a real key in a test, a fixture or a commit.

## Git Rules
- Commit only when asked: never `git add` or `git commit` unprompted.
- Conventional commits (`feat:`, `fix:`, `refactor:`, `docs:`, `chore:`) of 1–5 lines and the sign-off: a subject, then optionally a blank line and up to 3 lines on *why*. No file lists, test output, AI signatures or `Co-authored-by` trailers.
- Every commit is signed off by the developer it is made for, certifying the [Developer Certificate of Origin](https://developercertificate.org/): `git commit -s` adds `Signed-off-by: Name <email>` from git's `user.name` and `user.email`, which name a person, never an agent. A merge commit too: a branch is merged in a clone, `git merge --no-ff --signoff`, and pushed, never from GitHub's merge button, whose commit carries none.
- No branches, worktrees, pushes or pull requests.

## Definition of Done
- [ ] `make check` passes, or the failure is reported verbatim.
- [ ] No key, no text from a conversation and no path reaches a log, a spool, a record, a fixture or a commit.
- [ ] `ARCHITECTURE.md` and `README.md` say what changed, and the book's `api/coding-agents.mdx` (`../telmoni/web/content/docs`) is fixed or named.
- [ ] Nothing that needs asking happened unasked (dependencies, publishing, live calls, other repos, commits).
