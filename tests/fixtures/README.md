# Fixtures

**Synthetic.** No Cursor session was recorded for these: each file was written by hand from the payload shapes Cursor documents (cursor.com/docs/hooks, retrieved 2026-10-12) and the two payload sets a Cursor user posted to Cursor's forum (thread 169059: Cursor 3.16.17 in the editor, and the headless CLI), whose undocumented fields — `session_id` on every event, `model_id` absent from tool events, a turn's tokens on `afterAgentResponse` and `stop`, the conversation's own id in place of a generation id in the headless CLI — they copy. Every id, time and count is invented; the models and the versions are Cursor's own names.

Each file is a list of events in the order Cursor fires them, each with `after_ms`, when its hook starts counted from the first, and `payload`, what Cursor writes on the hook's stdin.

Every field the plugin must never keep carries something to look for: the email is `person@example.com`, every path is under `/home/person/`, and every text — the prompt, the reply, a tool's input and output, a command, an error's message, a subagent's task and summary, a branch — holds the word `SENTINEL`. The suites fail if any of the three reaches a spool, a record or a request.

| File | What it is |
|---|---|
| `ide.json` | A conversation in the editor: a session's start, three turns — one completed, with every kind of tool call, a failed one, an MCP call and a subagent; one the person stopped, its last tool interrupted; one that ended in error, its tokens on its reply alone — and the window's close. |
| `headless.json` | One run of the headless CLI (`agent -p`): no prompt, reply or `stop` hook, the conversation's id where a generation id would be, and the session's end closing the turn. |
