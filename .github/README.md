# Telmoni for Cursor

Records each turn of your [Cursor](https://cursor.com) agent conversations in [Telmoni](https://telmoni.com) as a run: the model and the turn's tokens, the tools it used and the subagents it started, each with its times and whether it failed. Never a prompt, a reply, a thought, a tool's input or output, a command, a file's path, the folder you work in or your email.

## Install

You need Cursor, and Node.js 22.23.4, 24.22.1, 26.12.1 or later (October 2026's security releases) with npm. Make a project API key holding the **ingest** scope on your project's API keys page, then:

```sh
npm install -g @telmoni/cursor-observability-plugin
telmoni-cursor-observability setup
```

The package is the plugin as built, nothing else. `setup` asks for the key, or takes `TELMONI_API_KEY`, checks that it is shaped like one, and keeps it in `~/.cursor/telmoni.json`, readable by you alone; then it adds the plugin's hooks to `~/.cursor/hooks.json`, beside any other tool's. Cursor reloads that file as it changes, so your next prompt is recorded.

The endpoint defaults to `https://api.telmoni.com`; for a self-hosted Telmoni, set `TELMONI_ENDPOINT` to its machine host when you run `setup`, which refuses one the SDK would not send to, with the SDK's reason. `TELMONI_API_KEY` and `TELMONI_ENDPOINT` in the environment Cursor runs its hooks with take the place of the file's. The hooks read the file only while it is yours and shut to everyone else, as `setup` leaves it; otherwise they send nothing, and `hook.log` says why. With both variables set, they do not read it.

The hooks run the Node that ran `setup`, by its path, so a Cursor opened from the Dock, without your shell's `PATH`, finds it. If you move to another Node, run `telmoni-cursor-observability setup` again.

### From a checkout

Build the plugin and run its `setup` from the build:

```sh
git clone https://github.com/telmoni/cursor-observability-plugin.git
(cd cursor-observability-plugin && npm install && npm run build)
node cursor-observability-plugin/dist/telmoni-cursor-observability.mjs setup
```

`setup` works as above, and the hooks it writes run that build by its path, so keep the checkout where it is.

### As a Cursor plugin

Cursor installs this repository itself as a plugin: from Cursor's marketplace once it is listed there, as **Telmoni Observability**; by its address, `https://github.com/telmoni/cursor-observability-plugin`, in the search field of Cursor's Plugins settings; or cloned into `~/.cursor/plugins/local/telmoni-observability` and loaded with **Developer: Reload Window**. Its hooks run the bundle committed in `dist/` with the `node` on the `PATH` Cursor runs its hooks with, so you need Node.js, one of the versions above, and not npm.

Installed so, there is no `setup`: give it the key as `TELMONI_API_KEY` in the environment Cursor runs its hooks with, or write `~/.cursor/telmoni.json` yourself, `{"apiKey": "tm_…"}`, with an `"endpoint"` for a self-hosted Telmoni, and make it readable by you alone (`chmod 600`); the hooks read it as `setup`'s. Where hooks `setup` wrote run the plugin too, the plugin's stand aside, so a conversation is recorded once.

## Cloud agents

Cursor's cloud agents never see your home folder: they read the repository's hooks, which run the package's command. In the repository:

```sh
telmoni-cursor-observability setup --project
```

Commit the `.cursor/hooks.json` it writes. Then give the agents the package, `npm install -g @telmoni/cursor-observability-plugin` in the install step of `.cursor/environment.json`, and the key, as the Cloud Agents secret `TELMONI_API_KEY`.

The repository's hooks run on your teammates' machines too. Where the package is installed, they keep and send nothing until a teammate runs `telmoni-cursor-observability setup`, or has `TELMONI_API_KEY` in the environment Cursor runs its hooks with; where it is not, Cursor's Hooks output shows them failing to start, and Cursor goes on as before. On a machine where both are set up, the repository's hooks record its conversations and your own stand aside, so nothing is recorded twice — unless the repository's cannot start, their command being in no folder of Cursor's `PATH`, when your own record.

## What it records

Each turn — from your prompt to the agent's stop — is a run of the agent `cursor`, and the conversation is its session, so the console shows a conversation as a session of traces. Inside the run:

- the model and the turn's tokens, the cache's reads and writes among them, as one model call spanning the turn: Cursor reports a turn's tokens, never a call's;
- each tool call, by Cursor's name for the tool (`Shell`, `Read`, `MCP:create_issue`), with its time, failed where it failed (`ToolError`, `TimeoutError`, `PermissionDenied`) and cancelled where you interrupted it;
- each subagent, a step named by its kind (`subagent explore`), though not the calls it made: Cursor runs those under a conversation of their own, with nothing naming the one that started it.

A turn you stop is cancelled, and one that ends in error failed. In Cursor's headless CLI (`agent -p`), which reports no prompt and no stop, a session's work is its turn.

Cursor hands its hooks your email, your prompts and its replies, each tool's input and output, and the folders you work in. The plugin reads none of it: it keeps a short list of names, numbers and flags from each event, and writes nothing else down.

## When something is wrong

The hooks never block Cursor, and slow it no more than Node takes to start: each answers at once, and a turn is sent by a detached process once it has ended. Anything that went wrong is a line in `~/.cursor/telmoni/hook.log`, naming what kind of thing went wrong and never anything from your conversation. A turn Telmoni could not take — out of reach, busy, its database failing it, or refusing the key — is sent again when the conversation's next turn ends, and one sent again within the hour is stored once. A turn Telmoni took in part, or refused for good, is logged and not sent again.

## Uninstall

```sh
telmoni-cursor-observability remove
npm uninstall -g @telmoni/cursor-observability-plugin
```

Installed as a Cursor plugin, remove it in Cursor, and delete `~/.cursor/telmoni.json` and `~/.cursor/telmoni/` yourself. `remove` takes the plugin's hooks out of `~/.cursor/hooks.json`, leaving every other tool's — the file as setup found it, to the byte, where nothing else in it changed since — and deletes your key and `~/.cursor/telmoni/`, the plugin's record of what it sent, but for what `setup --project` kept of a repository's hooks file, which that repository's `remove --project` puts back. In a repository, `telmoni-cursor-observability remove --project` takes them out of `.cursor/hooks.json`. From a checkout, `node dist/telmoni-cursor-observability.mjs remove`, run in it, does the same as `remove`.

## License

Apache-2.0
