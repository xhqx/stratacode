---
title: "Plugins"
description: "Extend the Strata CLI with custom hooks, tools, auth providers, and more"
platform: new
---

# Plugins

Plugins extend Strata by hooking into events, adding custom tools, registering auth or model providers, and customizing runtime behavior. They are TypeScript or JavaScript modules loaded at startup, and work in both the Strata CLI and the VS Code extension.

## What plugins can do

- **Add custom tools** the model can call (like `read`, `write`, `bash`).
- **Intercept tool calls** to mutate arguments, rewrite output, or block dangerous operations.
- **Subscribe to events** — sessions, messages, permissions, LSP diagnostics, file changes, etc.
- **Register auth providers** — OAuth or API-key flows for model providers.
- **Register model providers** — dynamic model catalogs.
- **Mutate chat parameters or headers** sent to the LLM.
- **Customize compaction** — inject or replace the prompt used when a session is compacted.
- **Inject shell environment variables** for commands executed by the agent or user.

---

## Use a plugin

There are three ways to load plugins.

### From a config file

Add an array of plugin specifiers to your config file:

```json
{
  "$schema": "https://app.strata.ai/config.json",
  "plugin": [
    "@your-org/your-plugin",
    "your-plugin@1.2.3",
    ["your-plugin", { "apiKey": "{env:MY_API_KEY}" }],
    "./plugins/local.ts",
    "file:///abs/path/plugin.ts"
  ]
}
```

Each entry can be:

| Form                                   | Loaded from                                                      |
| -------------------------------------- | ---------------------------------------------------------------- |
| `"package-name"`                       | Latest version from npm                                          |
| `"package-name@1.2.3"`                 | Pinned version from npm                                          |
| `["package-name", { options }]`        | npm package with options passed to the plugin function           |
| `"./path/plugin.ts"` / `"file:///..."` | Local file (relative to the config file or absolute `file:` URL) |

Config files live in the same locations as the rest of your CLI configuration — see the [CLI configuration reference](/docs/code-with-ai/platforms/cli#configuration).

### From a plugin directory

Drop TypeScript or JavaScript files into a `plugin/` or `plugins/` folder inside any config directory:

- Global: `~/.config/strata/plugin/`
- Project: `.strata/plugin/`, `.stratacode/plugin/`, or `.opencode/plugin/`

Every `.ts` or `.js` file in those directories is auto-registered at startup — no need to list them in the config file.

```text
my-project/
├── strata.json
└── .strata/
    └── plugin/
        ├── env-guard.ts
        └── notifications.ts
```

### From the `strata plugin` command

Install an npm plugin and patch your config in one step:

```bash
# Install into the current project's config
strata plugin my-plugin

# Install into your global config
strata plugin my-plugin --global

# Replace an existing entry
strata plugin my-plugin --force
```

The command resolves the package, reads its `package.json` for plugin entrypoints, and writes the entry into the appropriate config file (currently `.opencode/opencode.jsonc` / `.opencode/tui.jsonc` for local installs, or `~/.config/strata/opencode.jsonc` / `~/.config/strata/tui.jsonc` for `--global`) while preserving JSONC comments.

### How plugins are installed

- **npm plugins** are installed automatically at startup using Bun. Packages and their dependencies are cached in Strata's XDG cache directory (`~/.cache/strata/` on Linux, `~/Library/Caches/strata/` on macOS, `%LOCALAPPDATA%\strata\` on Windows).
- **Local plugins** are loaded directly from the plugin directory. If your plugin imports external packages, add a `package.json` to your config directory (see [Dependencies](#dependencies)) — Strata runs `bun install` on startup so imports resolve.

### Load order

Plugins from all sources run on every session. They load in this order:

1. Internal built-ins (Strata Gateway auth, Codex auth, Copilot auth, Cloudflare, etc.)
2. Global config plugin array (`~/.config/strata/strata.json`)
3. Global plugin directory (`~/.config/strata/plugin/`)
4. Project config plugin array (`strata.json` / `opencode.json`)
5. Project plugin directory (`.strata/plugin/` and friends)

Duplicates (same package, same version) are deduplicated. Hooks from multiple plugins run sequentially in load order.

### Disabling external plugins

Set the `STRATA_PURE=1` environment variable to skip all external plugins — only built-in plugins will load. Useful for reproducible CI runs or debugging.

---

## Create a plugin

A plugin is a module that exports a function returning a set of [hooks](#hooks-reference).

### Basic structure

Create a file in your plugin directory:

```ts
// .strata/plugin/hello.ts
import type { Plugin } from "@stratacode/plugin"

const hello: Plugin = async ({ project, client, $, directory, worktree }) => {
  console.log("hello plugin loaded")

  return {
    // hook implementations go here
  }
}

export default { id: "hello", server: hello }
```

The plugin function receives a context object:

| Field                    | Description                                                           |
| ------------------------ | --------------------------------------------------------------------- |
| `project`                | Current project metadata.                                             |
| `directory`              | Current working directory for this session.                           |
| `worktree`               | Git worktree root for this session.                                   |
| `client`                 | A Strata SDK client (`@stratacode/sdk`) for calling the local server. |
| `$`                      | [Bun's shell API](https://bun.com/docs/runtime/shell).                |
| `serverUrl`              | URL of the local Strata server.                                       |
| `experimental_workspace` | Register workspace adaptors (used by Agent Manager).                  |

The function returns a `Hooks` object. Any second argument is the options object passed via config (e.g. the `{ apiKey: "..." }` from `["my-plugin", { apiKey: "..." }]`).

### Module shape

Plugins must default-export a module descriptor. `id` is required for local-file plugins and inferred from `package.json#name` for npm plugins.

```ts
import type { Plugin } from "@stratacode/plugin"

const server: Plugin = async (ctx) => ({
  /* hooks */
})

export default {
  id: "my-plugin",
  server,
}
```

An npm plugin can also expose a TUI entry point (`tui`) for [TUI plugins](#tui-plugins), but `server` and `tui` are separate modules.

### TypeScript support

Install the plugin package locally and import its types:

```bash
bun add -d @stratacode/plugin
```

```ts
import type { Plugin } from "@stratacode/plugin"
import { tool } from "@stratacode/plugin/tool"
```

Strata automatically creates a `package.json` in config directories that contain a `plugin/` folder and installs `@stratacode/plugin` so types resolve out of the box.

### Engine compatibility

Declare a CLI version range to prevent a plugin from loading against an incompatible build:

```json
{
  "name": "my-plugin",
  "engines": { "opencode": "^7.0.0" }
}
```

If the running CLI does not satisfy the range, the plugin is skipped and a warning is surfaced.

### Dependencies

Local plugins and custom tools can use external npm packages. Add a `package.json` to your config directory:

```json
// .strata/package.json
{
  "dependencies": {
    "shescape": "^2.1.0"
  }
}
```

Strata runs `bun install` at startup so your plugins can import the packages:

```ts
// .strata/plugin/escape-bash.ts
import { escape } from "shescape"
import type { Plugin } from "@stratacode/plugin"

const EscapeBash: Plugin = async () => ({
  "tool.execute.before": async (input, output) => {
    if (input.tool === "bash") {
      output.args.command = escape(output.args.command)
    }
  },
})

export default { id: "escape-bash", server: EscapeBash }
```

---

## Hooks reference

Every hook is optional. Return only the ones you care about.

### Lifecycle

| Hook     | Description                                                                       |
| -------- | --------------------------------------------------------------------------------- |
| `config` | Receives the fully-resolved config at startup. Read-only — useful for inspection. |
| `event`  | Called for **every** event on the internal bus (see [Events](#events)).           |

### Tools

| Hook                  | Description                                                                                     |
| --------------------- | ----------------------------------------------------------------------------------------------- |
| `tool`                | Map of tool name → [tool definition](#custom-tools). Added tools are callable by the model.     |
| `tool.execute.before` | Fires before a tool runs; you can mutate `output.args`.                                         |
| `tool.execute.after`  | Fires after a tool returns; you can rewrite `output.title`, `output.output`, `output.metadata`. |
| `tool.definition`     | Mutate a tool's `description` and `parameters` before they are sent to the model.               |

### Chat

| Hook                     | Description                                                                  |
| ------------------------ | ---------------------------------------------------------------------------- |
| `chat.message`           | Fires when a new user message arrives. Inspect or modify `parts`.            |
| `chat.params`            | Mutate `temperature`, `topP`, `topK`, `maxOutputTokens`, provider `options`. |
| `chat.headers`           | Add or replace HTTP headers on the LLM API call.                             |
| `permission.ask`         | Auto-allow or auto-deny permission prompts.                                  |
| `command.execute.before` | Intercept slash command execution; mutate the resulting `parts`.             |
| `shell.env`              | Inject environment variables into every shell command Strata runs.           |

### Providers & auth

| Hook       | Description                                                                          |
| ---------- | ------------------------------------------------------------------------------------ |
| `auth`     | Register an auth method (OAuth or API key) for a provider, with interactive prompts. |
| `provider` | Dynamically supply a model catalog for a provider (useful for BYO-model gateways).   |

### Experimental

These hooks live behind the `experimental.` prefix and may change between releases.

| Hook                                   | Description                                                                                          |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `experimental.chat.messages.transform` | Rewrite the full message history before it is sent to the model.                                     |
| `experimental.chat.system.transform`   | Modify the system prompt array.                                                                      |
| `experimental.session.compacting`      | Inject extra context (`output.context`) or replace the compaction prompt entirely (`output.prompt`). |
| `experimental.compaction.autocontinue` | Disable the synthetic "continue" turn that follows compaction.                                       |
| `experimental.text.complete`           | Post-process final text parts (e.g. append signatures, redact secrets).                              |

### Events

The `event` hook fires for every event on Strata's internal bus. Common event types include:

- **Session**: `session.created`, `session.updated`, `session.idle`, `session.error`, `session.deleted`, `session.compacted`, `session.diff`, `session.status`
- **Message**: `message.updated`, `message.removed`, `message.part.updated`, `message.part.removed`
- **Tool**: `tool.execute.before`, `tool.execute.after`
- **Permission**: `permission.asked`, `permission.replied`
- **File**: `file.edited`, `file.watcher.updated`
- **Shell**: `shell.env`
- **Command**: `command.executed`
- **LSP**: `lsp.updated`, `lsp.client.diagnostics`
- **Todo**: `todo.updated`
- **Server**: `server.connected`
- **Installation**: `installation.updated`

```ts
const server: Plugin = async () => ({
  event: async ({ event }) => {
    if (event.type === "session.idle") {
      // session finished responding
    }
  },
})
```

---

## Custom tools

Plugins can register tools the model can call alongside the built-in ones. Use the `tool()` helper for type-safety:

```ts
// .strata/plugin/database.ts
import type { Plugin } from "@stratacode/plugin"
import { tool } from "@stratacode/plugin/tool"

const DatabasePlugin: Plugin = async () => ({
  tool: {
    query: tool({
      description: "Run a read-only SQL query against the project database",
      args: {
        sql: tool.schema.string().describe("SQL query to execute"),
      },
      async execute(args, context) {
        const { directory, worktree } = context
        // your query logic here
        return `ran: ${args.sql}`
      },
    }),
  },
})

export default { id: "database", server: DatabasePlugin }
```

`args` uses a [Zod](https://zod.dev) schema via `tool.schema`. The tool's `execute` function receives:

- `args` — validated against your schema
- `context` — `{ sessionID, messageID, agent, directory, worktree, abort, metadata, ask }`

### Name precedence

If a custom tool uses the same name as a built-in tool, **the custom tool wins**. Prefer unique names unless you intentionally want to override a built-in (for example, to wrap `bash` with extra validation).

### Alternative: standalone tool files

For tools that don't need the full plugin context, drop them in a `tool/` or `tools/` folder inside any config directory — for example `.strata/tool/database.ts` or `~/.config/strata/tool/database.ts`. The filename becomes the tool name, and each file exports a `tool()` definition directly. The layout is identical to the [OpenCode custom tools guide](https://opencode.ai/docs/custom-tools); substitute `.strata/` (or `.stratacode/` / `.opencode/`) for `.opencode/`.

---

## Examples

### Send a notification when a session finishes

```ts
// .strata/plugin/notify.ts
import type { Plugin } from "@stratacode/plugin"

const Notify: Plugin = async ({ $ }) => ({
  event: async ({ event }) => {
    if (event.type === "session.idle") {
      await $`osascript -e 'display notification "Session complete!" with title "Strata"'`
    }
  },
})

export default { id: "notify", server: Notify }
```

{% callout type="tip" %}
The VS Code extension already emits system notifications when a session finishes or errors — this plugin is for the raw CLI / TUI.
{% /callout %}

### Block reads of `.env` files

```ts
// .strata/plugin/env-guard.ts
import type { Plugin } from "@stratacode/plugin"

const EnvGuard: Plugin = async () => ({
  "tool.execute.before": async (input, output) => {
    if (input.tool === "read" && String(output.args.filePath).includes(".env")) {
      throw new Error("reading .env files is blocked")
    }
  },
})

export default { id: "env-guard", server: EnvGuard }
```

### Inject environment variables into every shell command

```ts
// .strata/plugin/inject-env.ts
import type { Plugin } from "@stratacode/plugin"

const InjectEnv: Plugin = async () => ({
  "shell.env": async (input, output) => {
    output.env.MY_API_KEY = "secret"
    output.env.PROJECT_ROOT = input.cwd
  },
})

export default { id: "inject-env", server: InjectEnv }
```

### Structured logging

Prefer `client.app.log()` over `console.log` so entries land in Strata's log pipeline:

```ts
import type { Plugin } from "@stratacode/plugin"

const Logger: Plugin = async ({ client }) => {
  await client.app.log({
    body: {
      service: "my-plugin",
      level: "info",
      message: "plugin initialized",
      extra: { version: "1.0.0" },
    },
  })
  return {}
}

export default { id: "logger", server: Logger }
```

Levels: `debug`, `info`, `warn`, `error`.

### Inject context during session compaction

```ts
// .strata/plugin/compaction.ts
import type { Plugin } from "@stratacode/plugin"

const Compaction: Plugin = async () => ({
  "experimental.session.compacting": async (input, output) => {
    output.context.push(
      "## Persist across compaction\n- current task status\n- files being actively edited\n- key decisions",
    )
  },
})

export default { id: "compaction", server: Compaction }
```

Set `output.prompt` to replace the default compaction prompt entirely — when present, `output.context` is ignored.

---

## TUI plugins

Plugins can also target the Strata TUI itself — registering slash commands, routes, sidebar slots, dialogs, and keybinds. TUI plugins are SolidJS modules exported from `"./tui"` in your plugin package.

TUI plugins live in a separate module namespace (`@stratacode/plugin/tui`) and have their own API surface (`TuiPluginApi`). Because the TUI API is larger and still evolving, this guide doesn't cover it exhaustively — use the types in `@stratacode/plugin/tui` as the reference, and look at the built-in TUI plugins under `packages/opencode/src/cli/cmd/tui/feature-plugins/` for working examples.

---

## Troubleshooting

- **Plugin failed to load** — check the CLI logs with `strata --print-logs --log-level DEBUG`. Load failures are also surfaced as session errors in the TUI and VS Code extension.
- **Plugin loaded but hooks never fire** — make sure the default export includes `server`:

  ```ts
  export default { id: "my-plugin", server }
  ```

  Named function exports are also accepted for backwards compatibility but should be considered legacy.

- **Local plugin can't find an npm import** — add a `package.json` in the config directory so `bun install` picks up the dependency (see [Dependencies](#dependencies)).
- **Plugin loads in dev but not in CI** — verify `STRATA_PURE` is not set, and that npm-installed plugins are cached (Strata's XDG cache directory — `~/.cache/strata/` on Linux, `~/Library/Caches/strata/` on macOS, `%LOCALAPPDATA%\strata\` on Windows). Run with `--log-level DEBUG` to see install output.
- **Reset the plugin cache** — delete the `node_modules/` under Strata's cache directory (or the `node_modules` cache under your config directory) and restart Strata.

---

## Reference

- Types: [`@stratacode/plugin`](https://github.com/Strata-Org/stratacode/tree/main/packages/plugin) — `Plugin`, `Hooks`, `PluginInput`, `ToolDefinition`, `AuthHook`, `ProviderHook`.
- Example plugin: [`packages/plugin/src/example.ts`](https://github.com/Strata-Org/stratacode/blob/main/packages/plugin/src/example.ts)
- CLI command: [`strata plugin`](/docs/code-with-ai/platforms/cli-reference#strata-plugin)
- Upstream docs (behavior is identical to OpenCode): [opencode.ai/docs/plugins](https://opencode.ai/docs/plugins) and [opencode.ai/docs/custom-tools](https://opencode.ai/docs/custom-tools)
