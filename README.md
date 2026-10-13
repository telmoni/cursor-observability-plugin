# Telmoni for Cursor

Records each turn of your [Cursor](https://cursor.com) agent conversations in [Telmoni](https://telmoni.com) as a run: the model and the turn's tokens, the tools it used and the subagents it started, each with its times and whether it failed. Never a prompt, a reply, a thought, a tool's input or output, a command, a file's path, the folder you work in or your email.

## Install

You need Cursor, and Node.js 22 or later with npm. Make a project API key holding the **ingest** scope on your project's API keys page, then:

```sh
npm install -g telmoni-cursor-observability-plugin
telmoni-cursor-observability setup
```

The package is the plugin as built, nothing else. `setup` asks for the key, or takes `TELMONI_API_KEY`, checks that it is shaped like one, and keeps it in `~/.cursor/telmoni.json`, readable by you alone; then it adds the plugin's hooks to `~/.cursor/hooks.json`, beside any other tool's. Cursor reloads that file as it changes, so your next prompt is recorded.

The endpoint defaults to `https://api.telmoni.com`; for a self-hosted Telmoni, set `TELMONI_ENDPOINT` to its machine host when you run `setup`. `TELMONI_API_KEY` and `TELMONI_ENDPOINT` in the environment Cursor runs its hooks with take the place of the file's.

The hooks run the Node that ran `setup`, by its path, so a Cursor opened from the Dock, without your shell's `PATH`, finds it. If you move to another Node, run `telmoni-cursor-observability setup` again.

## Cloud agents

Cursor's cloud agents never see your home folder: they read the repository's hooks. In the repository:

```sh
telmoni-cursor-observability setup --project
```

Commit the `.cursor/hooks.json` it writes. Then give the agents the package, `npm install -g telmoni-cursor-observability-plugin` in the install step of `.cursor/environment.json`, and the key, as the Cloud Agents secret `TELMONI_API_KEY`.

The repository's hooks run on your teammates' machines too. Where the package is installed, they keep and send nothing until a teammate runs `telmoni-cursor-observability setup`; where it is not, Cursor's Hooks output shows them failing to start, and Cursor goes on as before. On a machine where both are set up, the repository's hooks record its conversations and your own stand aside, so nothing is recorded twice.

## What it records

Each turn — from your prompt to the agent's stop — is a run of the agent `cursor`, and the conversation is its session, so the console shows a conversation as a session of traces. Inside the run:

- the model and the turn's tokens, the cache's reads and writes among them, as one model call spanning the turn: Cursor reports a turn's tokens, never a call's;
- each tool call, by Cursor's name for the tool (`Shell`, `Read`, `MCP:create_issue`), with its time, failed where it failed (`ToolError`, `TimeoutError`, `PermissionDenied`) and cancelled where you interrupted it;
- each subagent, a step named by its kind (`subagent explore`).

A turn you stop is cancelled, and one that ends in error failed. In Cursor's headless CLI (`agent -p`), which reports no prompt and no stop, a session's work is its turn.

Cursor hands its hooks your email, your prompts and its replies, each tool's input and output, and the folders you work in. The plugin reads none of it: it keeps a short list of names, numbers and flags from each event, and writes nothing else down.

## When something is wrong

The hooks never slow or block Cursor: each answers at once, as fast as Node starts, and a turn is sent by a detached process once it has ended. Anything that went wrong is a line in `~/.cursor/telmoni/hook.log`, naming what kind of thing went wrong and never anything from your conversation. A turn Telmoni could not take is sent by the next turn's hook, and a turn sent twice is stored once.

## Uninstall

```sh
telmoni-cursor-observability remove
npm uninstall -g telmoni-cursor-observability-plugin
```

`remove` takes the plugin's hooks out of `~/.cursor/hooks.json`, leaving every other tool's, and deletes your key and `~/.cursor/telmoni/`, the plugin's record of what it sent. In a repository, `telmoni-cursor-observability remove --project` takes them out of `.cursor/hooks.json`.

## License

Apache-2.0
