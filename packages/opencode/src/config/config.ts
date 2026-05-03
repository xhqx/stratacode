import { Log } from "../util"
import path from "path"
import { pathToFileURL } from "url"
import os from "os"
import z from "zod"
import { mergeDeep, pipe } from "remeda"
import { Global } from "../global"
import fsNode from "fs/promises"
import { NamedError } from "@opencode-ai/shared/util/error"
import { Flag } from "../flag/flag"
import { Auth } from "../auth"
import { Env } from "../env"
import { applyEdits, findNodeAtLocation, modify, parseTree } from "jsonc-parser" // stratacode_change - parseTree/findNodeAtLocation used in patchJsonc
import { Instance, type InstanceContext } from "../project/instance"
import { InstallationLocal, InstallationVersion } from "@/installation/version"
import { existsSync } from "fs"
import { GlobalBus } from "@/bus/global"
import { Event } from "../server/event"
import { Account } from "@/account/account"
import { isRecord } from "@/util/record"
import type { ConsoleState } from "./console-state"
import { AppFileSystem } from "@opencode-ai/shared/filesystem"
import { InstanceState } from "@/effect"
import { Context, Duration, Effect, Exit, Fiber, Layer, Option, Schema } from "effect"
import { EffectFlock } from "@opencode-ai/shared/util/effect-flock"
import { InstanceRef } from "@/effect/instance-ref"
import { zod, ZodOverride } from "@/util/effect-zod"
import { withStatics } from "@/util/schema"
import { ConfigAgent } from "./agent"
// stratacode_change start
import * as ConfigAutoApprove from "./auto-approve"
import { ConfigACPAgent } from "../stratacode/acp-client/config"
// stratacode_change end
import { ConfigCommand } from "./command"
import { ConfigFormatter } from "./formatter"
import { ConfigLayout } from "./layout"
import { ConfigLSP } from "./lsp"
import { ConfigManaged } from "./managed"
import { ConfigMCP } from "./mcp"
import { ConfigModelID } from "./model-id"
import { ConfigParse } from "./parse"
import { ConfigPaths } from "./paths"
import { ConfigPermission } from "./permission"
import { ConfigPlugin } from "./plugin"
import { ConfigProvider } from "./provider"
import { ConfigServer } from "./server"
import { ConfigSkills } from "./skills"
import { ConfigVariable } from "./variable"
import { Npm } from "@/npm"
// stratacode_change start
import { StratacodeConfig } from "../stratacode/config/config"
import { StratacodeDefaultPlugins } from "@/stratacode/config/default-plugins" // stratacode_change
import { IndexingConfig as StrataIndexingConfig } from "@stratacode/strata-indexing/config" // stratacode_change
import { makeRuntime } from "@/effect/run-service"
import { unique } from "remeda"
// stratacode_change end

const log = Log.create({ service: "config" })

// Custom merge function that concatenates array fields instead of replacing them
function mergeConfigConcatArrays(target: Info, source: Info): Info {
  const merged = mergeDeep(target, source)
  if (target.instructions && source.instructions) {
    merged.instructions = Array.from(new Set([...target.instructions, ...source.instructions]))
  }
  return merged
}

function normalizeLoadedConfig(data: unknown, source: string) {
  if (!isRecord(data)) return data
  const copy = { ...data }
  const hadLegacy = "theme" in copy || "keybinds" in copy || "tui" in copy
  if (!hadLegacy) return copy
  delete copy.theme
  delete copy.keybinds
  delete copy.tui
  log.warn("tui keys in opencode config are deprecated; move them to tui.json", { path: source })
  return copy
}

// stratacode_change start
export const Warning = z.object({
  path: z.string(),
  message: z.string(),
  detail: z.string().optional(),
})
export type Warning = z.infer<typeof Warning>

const { toWarning, caught: caughtWarning, handleInvalid } = StratacodeConfig
// stratacode_change end

async function resolveLoadedPlugins<T extends { plugin?: ConfigPlugin.Spec[] }>(config: T, filepath: string) {
  if (!config.plugin) return config
  for (let i = 0; i < config.plugin.length; i++) {
    // Normalize path-like plugin specs while we still know which config file declared them.
    // This prevents `./plugin.ts` from being reinterpreted relative to some later merge location.
    config.plugin[i] = await ConfigPlugin.resolvePluginSpec(config.plugin[i], filepath)
  }
  return config
}

export const Server = ConfigServer.Server.zod
export const Layout = ConfigLayout.Layout.zod
export type Layout = ConfigLayout.Layout

// stratacode_change start - indexing configuration
export const Indexing = StrataIndexingConfig
export type Indexing = z.infer<typeof Indexing>
// stratacode_change end

// Schemas that still live at the zod layer (have .transform / .preprocess /
// .meta not expressible in current Effect Schema) get referenced via a
// ZodOverride-annotated Schema.Any.  Walker sees the annotation and emits the
// exact zod directly, preserving component $refs.
const AgentRef = Schema.Any.annotate({ [ZodOverride]: ConfigAgent.Info })
const LogLevelRef = Schema.Any.annotate({ [ZodOverride]: Log.Level })
const IndexingRef = Schema.Any.annotate({ [ZodOverride]: StrataIndexingConfig }) // stratacode_change

const PositiveInt = Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThan(0))
const NonNegativeInt = Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0))

// The Effect Schema is the canonical source of truth. The `.zod` compatibility
// surface is derived so existing Hono validators keep working without a parallel
// Zod definition.
//
// The walker emits `z.object({...})` which is non-strict by default. Config
// historically uses `.strict()` (additionalProperties: false in openapi.json),
// so layer that on after derivation.  Re-apply the Config ref afterward
// since `.strict()` strips the walker's meta annotation.
export const Info = Schema.Struct({
  $schema: Schema.optional(Schema.String).annotate({
    description: "JSON schema reference for configuration validation",
  }),
  logLevel: Schema.optional(LogLevelRef).annotate({ description: "Log level" }),
  server: Schema.optional(ConfigServer.Server).annotate({
    description: "Server configuration for opencode serve and web commands",
  }),
  command: Schema.optional(Schema.Record(Schema.String, ConfigCommand.Info)).annotate({
    description: "Command configuration, see https://opencode.ai/docs/commands",
  }),
  skills: Schema.optional(ConfigSkills.Info).annotate({ description: "Additional skill folder paths" }),
  watcher: Schema.optional(
    Schema.Struct({
      ignore: Schema.optional(Schema.mutable(Schema.Array(Schema.String))),
    }),
  ),
  snapshot: Schema.optional(Schema.Boolean).annotate({
    description:
      "Enable or disable snapshot tracking. When false, filesystem snapshots are not recorded and undoing or reverting will not undo/redo file changes. Defaults to true.",
  }),
  // User-facing plugin config is stored as Specs; provenance gets attached later while configs are merged.
  plugin: Schema.optional(Schema.mutable(Schema.Array(ConfigPlugin.Spec))),
  share: Schema.optional(Schema.Literals(["manual", "auto", "disabled"])).annotate({
    description:
      "Control sharing behavior:'manual' allows manual sharing via commands, 'auto' enables automatic sharing, 'disabled' disables all sharing",
  }),
  autoshare: Schema.optional(Schema.Boolean).annotate({
    description: "@deprecated Use 'share' field instead. Share newly created sessions automatically",
  }),
  autoupdate: Schema.optional(Schema.Union([Schema.Boolean, Schema.Literal("notify")])).annotate({
    description:
      "Automatically update to the latest version. Set to true to auto-update, false to disable, or 'notify' to show update notifications",
  }),
  disabled_providers: Schema.optional(Schema.mutable(Schema.Array(Schema.String))).annotate({
    description: "Disable providers that are loaded automatically",
  }),
  enabled_providers: Schema.optional(Schema.mutable(Schema.Array(Schema.String))).annotate({
    description: "When set, ONLY these providers will be enabled. All other providers will be ignored",
  }),
  // stratacode_change start
  // NOTE: Any new stratacode_change key added to Config.Info must also be mirrored in
  // apps/web/src/app/config.json/extras.ts in the cloud repo, otherwise
  // $schema: https://app.strata.ai/config.json will not recognize it.
  remote_control: Schema.optional(Schema.Boolean).annotate({
    description: "Enable remote control of sessions via Strata Cloud. Equivalent to running /remote on startup.",
  }),
  indexing: Schema.optional(IndexingRef).annotate({ description: "Codebase indexing configuration" }), // stratacode_change
  retry: Schema.optional(
    Schema.Struct({
      enabled: Schema.optional(Schema.Boolean).annotate({
        description: "Enable automatic retry on transient agent errors (default: true)",
      }),
      limit: Schema.optional(Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0))).annotate({
        description: "Maximum number of retry attempts (0 = no retries, default: unlimited)",
      }),
      delay: Schema.optional(Schema.Number.check(Schema.isGreaterThan(0))).annotate({
        description: "Base delay in seconds for exponential backoff (default: 2)",
      }),
      max_delay: Schema.optional(Schema.Number.check(Schema.isGreaterThan(0))).annotate({
        description: "Maximum delay in seconds for exponential backoff cap (default: 30)",
      }),
    }),
  ), // stratacode_change
  repomap: Schema.optional(
    Schema.Struct({
      budget: Schema.optional(Schema.Number.check(Schema.isGreaterThanOrEqualTo(0))).annotate({
        description: "Character budget limit for the generated repository map (0 = disabled, default: 4096)",
      }),
    }),
  ), // stratacode_change
  project_memory: Schema.optional(
    Schema.Struct({
      enabled: Schema.optional(Schema.Boolean).annotate({
        description: "Whether automatic memory extraction on branch change is enabled (default: false)",
      }),
      max_commits: Schema.optional(Schema.Number.check(Schema.isGreaterThan(0))).annotate({
        description: "Maximum number of recent commits to analyze per pull/branch change (default: 10)",
      }),
    }),
  ), // stratacode_change
  workers: Schema.optional(
    Schema.Struct({
      enabled: Schema.optional(Schema.Boolean).annotate({
        description: "Enable background context workers (default: false)",
      }),
      max_concurrency: Schema.optional(Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThan(0))).annotate({
        description: "Maximum concurrent worker executions (default: 1)",
      }),
      debounce_ms: Schema.optional(Schema.Number.check(Schema.isGreaterThan(0))).annotate({
        description: "Milliseconds to wait after file change before triggering workers (default: 5000)",
      }),
      review: Schema.optional(Schema.Boolean).annotate({
        description: "Enable the review worker (default: true when workers enabled)",
      }),
      summarizer: Schema.optional(Schema.Boolean).annotate({
        description: "Enable the summarizer worker (default: true when workers enabled)",
      }),
      auto_explain: Schema.optional(Schema.Boolean).annotate({
        description: "Enable background diff explanations for the Changes tab (default: false)",
      }),
      max_diff_chars: Schema.optional(Schema.Number.check(Schema.isGreaterThan(0))).annotate({
        description: "Maximum diff characters to send to workers (default: 8000). Larger diffs are skipped.",
      }),
    }),
  ).annotate({ description: "Background context workers configuration" }), // stratacode_change
  // stratacode_change end
  // stratacode_change start - nullable for delete sentinel
  model: Schema.optional(Schema.NullOr(ConfigModelID)).annotate({
    description: "Model to use in the format of provider/model, eg anthropic/claude-2",
  }),
  small_model: Schema.optional(Schema.NullOr(ConfigModelID)).annotate({
    description: "Small model to use for tasks like title generation in the format of provider/model",
  }),
  // stratacode_change end
  // stratacode_change start - renamed from "build" to "code"
  default_agent: Schema.optional(Schema.String).annotate({
    description:
      "Default agent to use when none is specified. Must be a primary agent. Falls back to 'code' if not set or if the specified agent is invalid.",
  }),
  // stratacode_change end
  username: Schema.optional(Schema.String).annotate({
    description: "Custom username to display in conversations instead of system username",
  }),
  mode: Schema.optional(
    Schema.StructWithRest(
      Schema.Struct({
        build: Schema.optional(AgentRef),
        plan: Schema.optional(AgentRef),
      }),
      [Schema.Record(Schema.String, AgentRef)],
    ),
  ).annotate({ description: "@deprecated Use `agent` field instead." }),
  agent: Schema.optional(
    Schema.StructWithRest(
      Schema.Struct({
        // primary
        plan: Schema.optional(AgentRef),
        build: Schema.optional(AgentRef),
        debug: Schema.optional(AgentRef), // stratacode_change
        orchestrator: Schema.optional(AgentRef), // stratacode_change
        ask: Schema.optional(AgentRef), // stratacode_change
        // subagent
        general: Schema.optional(AgentRef),
        explore: Schema.optional(AgentRef),
        // specialized
        title: Schema.optional(AgentRef),
        summary: Schema.optional(AgentRef),
        compaction: Schema.optional(AgentRef),
      }),
      [Schema.Record(Schema.String, AgentRef)],
    ),
  ).annotate({ description: "Agent configuration, see https://opencode.ai/docs/agents" }),
  provider: Schema.optional(Schema.Record(Schema.String, ConfigProvider.Info)).annotate({
    description: "Custom provider configurations and model overrides",
  }),
  mcp: Schema.optional(
    Schema.Record(
      Schema.String,
      Schema.Union([
        ConfigMCP.Info,
        // Matches the legacy `{ enabled: false }` form used to disable a server.
        Schema.Any.annotate({ [ZodOverride]: z.object({ enabled: z.boolean() }).strict() }),
      ]),
    ),
  ).annotate({ description: "MCP (Model Context Protocol) server configurations" }),
  formatter: Schema.optional(ConfigFormatter.Info),
  lsp: Schema.optional(ConfigLSP.Info),
  instructions: Schema.optional(Schema.mutable(Schema.Array(Schema.String))).annotate({
    description: "Additional instruction files or patterns to include",
  }),
  layout: Schema.optional(ConfigLayout.Layout).annotate({ description: "@deprecated Always uses stretch layout." }),
  permission: Schema.optional(ConfigPermission.Info),
  tools: Schema.optional(Schema.Record(Schema.String, Schema.Boolean)),
  enterprise: Schema.optional(
    Schema.Struct({
      url: Schema.optional(Schema.String).annotate({ description: "Enterprise URL" }),
    }),
  ),
  commit_message: StratacodeConfig.CommitMessageSchema, // stratacode_change
  session_context: StratacodeConfig.SessionContextSchema, // stratacode_change
  compaction: Schema.optional(
    Schema.Struct({
      auto: Schema.optional(Schema.Boolean).annotate({
        description: "Enable automatic compaction when context is full (default: true)",
      }),
      prune: Schema.optional(Schema.Boolean).annotate({
        description: "Enable pruning of old tool outputs (default: true)",
      }),
      tail_turns: Schema.optional(NonNegativeInt).annotate({
        description:
          "Number of recent user turns, including their following assistant/tool responses, to keep verbatim during compaction (default: 2)",
      }),
      preserve_recent_tokens: Schema.optional(NonNegativeInt).annotate({
        description: "Maximum number of tokens from recent turns to preserve verbatim after compaction",
      }),
      reserved: Schema.optional(NonNegativeInt).annotate({
        description: "Token buffer for compaction. Leaves enough window to avoid overflow during compaction.",
      }),
      // stratacode_change start
      threshold_percent: Schema.optional(
        Schema.Number.check(Schema.isGreaterThan(0)).check(Schema.isLessThanOrEqualTo(100)),
      ).annotate({
        description:
          "Percentage of the model's maximum context at which auto-compaction is triggered (1-100, default: 100). For example, 80 triggers compaction when the context reaches 80% of its limit.",
      }),
      // stratacode_change end
    }),
  ),
  experimental: Schema.optional(
    Schema.Struct({
      disable_paste_summary: Schema.optional(Schema.Boolean),
      batch_tool: Schema.optional(Schema.Boolean).annotate({ description: "Enable the batch tool" }),
      codebase_search: Schema.optional(Schema.Boolean).annotate({ description: "Enable AI-powered codebase search" }), // stratacode_change
      // stratacode_change start
      semantic_indexing: Schema.optional(Schema.Boolean).annotate({
        description: "Enable semantic codebase indexing and the semantic_search tool",
      }),
      // stratacode_change end
      // stratacode_change start - enable telemetry by default
      openTelemetry: Schema.Boolean.pipe(Schema.optional, Schema.withDecodingDefault(Effect.succeed(true))).annotate({
        description: "Enable telemetry. Set to false to opt-out.",
      }),
      // stratacode_change end
      primary_tools: Schema.optional(Schema.mutable(Schema.Array(Schema.String))).annotate({
        description: "Tools that should only be available to primary agents.",
      }),
      continue_loop_on_deny: Schema.optional(Schema.Boolean).annotate({
        description: "Continue the agent loop when a tool call is denied",
      }),
      mcp_timeout: Schema.optional(PositiveInt).annotate({
        description: "Timeout in milliseconds for model context protocol (MCP) requests",
      }),
      // stratacode_change start
      auto_improve_prompts: Schema.optional(Schema.Boolean).annotate({
        description: "Auto-enhance prompts before sending when enabled",
      }),
      // stratacode_change end
    }),
  ),
  // stratacode_change start
  auto_approve: Schema.optional(ConfigAutoApprove.Info),
  acp_agents: Schema.optional(Schema.Record(Schema.String, ConfigACPAgent)).annotate({
    description: "External ACP (Agent Client Protocol) agents",
  }),
  // stratacode_change end
})
  .annotate({ identifier: "Config" })
  .pipe(
    withStatics((s) => ({
      zod: (zod(s) as unknown as z.ZodObject<any>).strict().meta({ ref: "Config" }) as unknown as z.ZodType<
        DeepMutable<Schema.Schema.Type<typeof s>>
      >,
    })),
  )

// Schema.Struct produces readonly types by default, but the service code
// below mutates Info objects directly (e.g. `config.mode = ...`). Strip the
// readonly recursively so callers get the same mutable shape zod inferred.
//
// `Types.DeepMutable` from effect-smol would be a drop-in, but its fallback
// branch `{ -readonly [K in keyof T]: ... }` collapses `unknown` to `{}`
// (since `keyof unknown = never`), which widens `Record<string, unknown>`
// fields like `ConfigPlugin.Options`. The local version gates on
// `extends object` so `unknown` passes through.
//
// Tuple branch preserves `ConfigPlugin.Spec`'s `readonly [string, Options]`
// shape (otherwise the general array branch widens it to an array).
type DeepMutable<T> = T extends readonly [unknown, ...unknown[]]
  ? { -readonly [K in keyof T]: DeepMutable<T[K]> }
  : T extends readonly (infer U)[]
    ? DeepMutable<U>[]
    : T extends object
      ? { -readonly [K in keyof T]: DeepMutable<T[K]> }
      : T

export type Info = DeepMutable<Schema.Schema.Type<typeof Info>> & {
  // plugin_origins is derived state, not a persisted config field. It keeps each winning plugin spec together
  // with the file and scope it came from so later runtime code can make location-sensitive decisions.
  plugin_origins?: ConfigPlugin.Origin[]
}

type State = {
  config: Info
  directories: string[]
  deps: Fiber.Fiber<void, never>[]
  warnings: Warning[] // stratacode_change
  consoleState: ConsoleState
}

export interface Interface {
  readonly get: () => Effect.Effect<Info>
  readonly getGlobal: () => Effect.Effect<Info>
  readonly getConsoleState: () => Effect.Effect<ConsoleState>
  readonly update: (config: Info) => Effect.Effect<void>
  readonly updateGlobal: (config: Info, options?: { dispose?: boolean }) => Effect.Effect<Info> // stratacode_change
  readonly invalidate: (wait?: boolean) => Effect.Effect<void>
  readonly directories: () => Effect.Effect<string[]>
  readonly waitForDependencies: () => Effect.Effect<void>
  readonly warnings: () => Effect.Effect<Warning[]> // stratacode_change
}

export class Service extends Context.Service<Service, Interface>()("@opencode/Config") {}

function globalConfigFile() {
  // stratacode_change start
  const candidates = ["strata.jsonc", "strata.json", "opencode.jsonc", "opencode.json", "config.json"].map((file) =>
    // stratacode_change end
    path.join(Global.Path.config, file),
  )
  for (const file of candidates) {
    if (existsSync(file)) return file
  }
  return candidates[0]
}

function patchJsonc(input: string, patch: unknown, path: string[] = []): string {
  if (!isRecord(patch)) {
    // stratacode_change - null means "delete this key" — pass undefined to jsonc-parser's modify()
    const edits = modify(input, path, patch === null ? undefined : patch, {
      formattingOptions: {
        insertSpaces: true,
        tabSize: 2,
      },
    })
    return applyEdits(input, edits)
  }

  // stratacode_change start — when the existing JSONC node at this path is a
  // scalar (e.g. permission.bash is "ask" as a string), jsonc-parser cannot
  // add child keys to it. Detect this case and replace the whole node with
  // the patch object in a single modify() call instead of recursing.
  // For permission keys, promote the scalar to { "*": scalarValue } so the
  // wildcard default is preserved. For other keys, replace directly.
  if (path.length > 0) {
    const tree = parseTree(input)
    const node = tree && findNodeAtLocation(tree, path)
    if (node && node.type !== "object") {
      const isPermissionKey = path[0] === "permission" && path.length === 2
      const replacement = isPermissionKey ? { "*": node.value, ...patch } : patch
      const edits = modify(input, path, replacement, {
        formattingOptions: { insertSpaces: true, tabSize: 2 },
      })
      return applyEdits(input, edits)
    }
  }
  // stratacode_change end

  return Object.entries(patch).reduce((result, [key, value]) => {
    if (value === undefined) return result
    return patchJsonc(result, value, [...path, key])
  }, input)
}

function writable(info: Info) {
  const { plugin_origins: _plugin_origins, ...next } = info
  return next
}

export const ConfigDirectoryTypoError = NamedError.create(
  "ConfigDirectoryTypoError",
  z.object({
    path: z.string(),
    dir: z.string(),
    suggestion: z.string(),
  }),
)

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const fs = yield* AppFileSystem.Service
    const authSvc = yield* Auth.Service
    const accountSvc = yield* Account.Service
    const env = yield* Env.Service
    const npmSvc = yield* Npm.Service

    const readConfigFile = Effect.fnUntraced(function* (filepath: string) {
      return yield* fs.readFileString(filepath).pipe(
        Effect.catchIf(
          (e) => e.reason._tag === "NotFound",
          () => Effect.succeed(undefined),
        ),
        Effect.orDie,
      )
    })

    const loadConfig = Effect.fnUntraced(function* (
      text: string,
      options: { path: string } | { dir: string; source: string },
    ) {
      const source = "path" in options ? options.path : options.source
      const expanded = yield* Effect.promise(() =>
        ConfigVariable.substitute(
          "path" in options ? { text, type: "path", path: options.path } : { text, type: "virtual", ...options },
        ),
      )
      const parsed = ConfigParse.jsonc(expanded, source)
      const data = ConfigParse.schema(Info.zod, normalizeLoadedConfig(parsed, source), source)
      if (!("path" in options)) return data

      yield* Effect.promise(() => resolveLoadedPlugins(data, options.path))
      if (!data.$schema) {
        data.$schema = "https://app.strata.ai/config.json" // stratacode_change
        const updated = text.replace(/^\s*\{/, '{\n  "$schema": "https://app.strata.ai/config.json",') // stratacode_change
        yield* fs.writeFileString(options.path, updated).pipe(Effect.catch(() => Effect.void))
      }
      return data
    })

    const loadFile = Effect.fnUntraced(function* (filepath: string) {
      log.info("loading", { path: filepath })
      const text = yield* readConfigFile(filepath)
      if (!text) return {} as Info
      return yield* loadConfig(text, { path: filepath })
    })

    const loadGlobal = Effect.fnUntraced(function* () {
      yield* Effect.promise(() => StratacodeConfig.migrateBashPermission()) // stratacode_change
      let result: Info = pipe(
        {},
        mergeDeep(yield* loadFile(path.join(Global.Path.config, "config.json"))),
        // stratacode_change start
        mergeDeep(yield* loadFile(path.join(Global.Path.config, "strata.json"))),
        mergeDeep(yield* loadFile(path.join(Global.Path.config, "strata.jsonc"))),
        // stratacode_change end
        mergeDeep(yield* loadFile(path.join(Global.Path.config, "opencode.json"))),
        mergeDeep(yield* loadFile(path.join(Global.Path.config, "opencode.jsonc"))),
      )

      const legacy = path.join(Global.Path.config, "config")
      if (existsSync(legacy)) {
        yield* Effect.promise(() =>
          import(pathToFileURL(legacy).href, { with: { type: "toml" } })
            .then(async (mod) => {
              const { provider, model, ...rest } = mod.default
              if (provider && model) result.model = `${provider}/${model}`
              result["$schema"] = "https://app.strata.ai/config.json" // stratacode_change
              result = mergeDeep(result, rest)
              await fsNode.writeFile(path.join(Global.Path.config, "config.json"), JSON.stringify(result, null, 2))
              await fsNode.unlink(legacy)
            })
            .catch(() => {}),
        )
      }

      return result
    })

    const [cachedGlobal, invalidateGlobal] = yield* Effect.cachedInvalidateWithTTL(
      loadGlobal().pipe(
        Effect.tapError((error) =>
          Effect.sync(() => log.error("failed to load global config, using defaults", { error: String(error) })),
        ),
        Effect.orElseSucceed((): Info => ({})),
      ),
      Duration.infinity,
    )

    const getGlobal = Effect.fn("Config.getGlobal")(function* () {
      return yield* cachedGlobal
    })

    const ensureGitignore = Effect.fn("Config.ensureGitignore")(function* (dir: string) {
      const gitignore = path.join(dir, ".gitignore")
      const hasIgnore = yield* fs.existsSafe(gitignore)
      if (!hasIgnore) {
        yield* fs
          .writeFileString(
            gitignore,
            // stratacode_change start - added pnpm-lock.yaml and yarn.lock (not in upstream)
            [
              "node_modules",
              "package.json",
              "package-lock.json",
              "pnpm-lock.yaml",
              "bun.lock",
              "yarn.lock",
              ".gitignore",
            ].join("\n"),
            // stratacode_change end
          )
          .pipe(
            Effect.catchIf(
              (e) => e.reason._tag === "PermissionDenied",
              () => Effect.void,
            ),
          )
      }
    })

    const loadInstanceState = Effect.fn("Config.loadInstanceState")(
      function* (ctx: InstanceContext) {
        // stratacode_change start - warning accumulator and legacy Strata config
        const warnings: Warning[] = []
        const auth = yield* authSvc.all().pipe(Effect.orDie)

        let result: Info = {}
        const legacy = yield* Effect.promise(() =>
          StratacodeConfig.loadLegacyConfigs({
            projectDir: ctx.directory,
            merge: mergeConfigConcatArrays,
          }),
        )
        result = mergeConfigConcatArrays(result, legacy.config)
        warnings.push(...legacy.warnings)

        const orgModes = yield* Effect.promise(() => StratacodeConfig.loadOrganizationModes(auth))
        if (Object.keys(orgModes.agents).length > 0) {
          result = mergeConfigConcatArrays(result, { agent: orgModes.agents })
        }
        warnings.push(...orgModes.warnings)
        // stratacode_change end

        const consoleManagedProviders = new Set<string>()
        let activeOrgName: string | undefined

        const pluginScopeForSource = Effect.fnUntraced(function* (source: string) {
          if (source.startsWith("http://") || source.startsWith("https://")) return "global"
          if (source === "STRATA_CONFIG_CONTENT") return "local"
          if (yield* InstanceRef.use((ctx) => Effect.succeed(Instance.containsPath(source, ctx)))) return "local"
          return "global"
        })

        const mergePluginOrigins = Effect.fnUntraced(function* (
          source: string,
          // mergePluginOrigins receives raw Specs from one config source, before provenance for this merge step
          // is attached.
          list: ConfigPlugin.Spec[] | undefined,
          // Scope can be inferred from the source path, but some callers already know whether the config should
          // behave as global or local and can pass that explicitly.
          kind?: ConfigPlugin.Scope,
        ) {
          if (!list?.length) return
          const hit = kind ?? (yield* pluginScopeForSource(source))
          // Merge newly seen plugin origins with previously collected ones, then dedupe by plugin identity while
          // keeping the winning source/scope metadata for downstream installs, writes, and diagnostics.
          const plugins = ConfigPlugin.deduplicatePluginOrigins([
            ...(result.plugin_origins ?? []),
            ...list.map((spec) => ({ spec, source, scope: hit })),
          ])
          result.plugin = plugins.map((item) => item.spec)
          result.plugin_origins = plugins
        })

        const merge = (source: string, next: Info, kind?: ConfigPlugin.Scope) => {
          result = mergeConfigConcatArrays(result, next)
          return mergePluginOrigins(source, next.plugin, kind)
        }

        for (const [key, value] of Object.entries(auth)) {
          if (value.type === "wellknown") {
            const url = key.replace(/\/+$/, "")
            const source = `${url}/.well-known/opencode`
            process.env[value.key] = value.token
            log.debug("fetching remote config", { url: source })
            // stratacode_change start - warn instead of fail on wellknown errors
            const next = yield* Effect.tryPromise({
              try: async () => {
                const response = await fetch(source)
                if (!response.ok) {
                  throw new Error(`failed to fetch remote config from ${url}: ${response.status}`)
                }
                const wellknown = (await response.json()) as { config?: Record<string, unknown> }
                const remoteConfig = wellknown.config ?? {}
                if (!remoteConfig.$schema) remoteConfig.$schema = "https://app.strata.ai/config.json"
                return remoteConfig
              },
              catch: (err) => err,
            }).pipe(
              Effect.flatMap((remoteConfig) =>
                loadConfig(JSON.stringify(remoteConfig), {
                  dir: path.dirname(source),
                  source,
                }),
              ),
              Effect.tap(() => Effect.sync(() => log.debug("loaded remote config from well-known", { url }))),
              Effect.catch((err: unknown) => {
                caughtWarning(warnings, source, err)
                log.warn("skipped remote config due to error", { url, err })
                return Effect.succeed({} as Info)
              }),
              Effect.catchDefect((err: unknown) => {
                caughtWarning(warnings, source, err)
                log.warn("skipped remote config due to error", { url, err })
                return Effect.succeed({} as Info)
              }),
            )
            yield* merge(source, next, "global")
            // stratacode_change end
          }
        }

        // stratacode_change start - capture global config failures as warnings
        const global = yield* getGlobal().pipe(
          Effect.catchDefect((err: unknown) => {
            caughtWarning(warnings, "global config", err)
            return Effect.succeed({} as Info)
          }),
        )
        // stratacode_change end

        yield* merge(Global.Path.config, global, "global")

        if (Flag.STRATA_CONFIG) {
          // stratacode_change start - capture STRATA_CONFIG failures as warnings
          yield* merge(
            Flag.STRATA_CONFIG,
            yield* loadFile(Flag.STRATA_CONFIG).pipe(
              Effect.catchDefect((err: unknown) => {
                caughtWarning(warnings, Flag.STRATA_CONFIG!, err)
                return Effect.succeed({} as Info)
              }),
            ),
          )
          // stratacode_change end
          log.debug("loaded custom config", { path: Flag.STRATA_CONFIG })
        }

        if (!Flag.STRATA_DISABLE_PROJECT_CONFIG) {
          // stratacode_change start - also discover strata.json project files
          for (const name of ["strata", "opencode"] as const) {
            for (const file of yield* ConfigPaths.files(name, ctx.directory, ctx.worktree).pipe(Effect.orDie)) {
              yield* merge(
                file,
                yield* loadFile(file).pipe(
                  Effect.catchDefect((err: unknown) => {
                    caughtWarning(warnings, file, err)
                    return Effect.succeed({} as Info)
                  }),
                ),
                "local",
              )
            }
          }
          // stratacode_change end
        }

        result.agent = result.agent || {}
        result.mode = result.mode || {}
        result.plugin = result.plugin || []

        const directories = yield* ConfigPaths.directories(ctx.directory, ctx.worktree)

        if (Flag.STRATA_CONFIG_DIR) {
          log.debug("loading config from STRATA_CONFIG_DIR", { path: Flag.STRATA_CONFIG_DIR })
        }

        const deps: Fiber.Fiber<void, never>[] = []

        // stratacode_change start
        for (const dir of unique(directories)) {
          if (StratacodeConfig.isConfigDir(dir, Flag.STRATA_CONFIG_DIR)) {
            for (const file of StratacodeConfig.ALL_CONFIG_FILES) {
              const source = path.join(dir, file)
              log.debug(`loading config from ${source}`)
              yield* merge(
                source,
                yield* loadFile(source).pipe(
                  Effect.catchDefect((err: unknown) => {
                    caughtWarning(warnings, source, err)
                    return Effect.succeed({} as Info)
                  }),
                ),
              )
              result.agent ??= {}
              result.mode ??= {}
              result.plugin ??= []
            }
          }
          // stratacode_change end

          yield* ensureGitignore(dir).pipe(Effect.orDie)

          const dep = yield* npmSvc
            .install(dir, {
              add: [
                {
                  name: "@stratacode/plugin",
                  version: InstallationLocal ? undefined : InstallationVersion,
                },
              ],
            })
            .pipe(
              Effect.exit,
              Effect.tap((exit) =>
                Exit.isFailure(exit)
                  ? Effect.sync(() => {
                      log.warn("background dependency install failed", { dir, error: String(exit.cause) })
                    })
                  : Effect.void,
              ),
              Effect.asVoid,
              Effect.forkDetach,
            )
          deps.push(dep)

          // stratacode_change start - propagate parse errors to the Warning accumulator
          result.command = mergeDeep(
            result.command ?? {},
            yield* Effect.promise(() => ConfigCommand.load(dir, warnings)),
          )
          result.agent = mergeDeep(result.agent ?? {}, yield* Effect.promise(() => ConfigAgent.load(dir, warnings)))
          result.agent = mergeDeep(result.agent ?? {}, yield* Effect.promise(() => ConfigAgent.loadMode(dir, warnings)))
          // stratacode_change end
          // Auto-discovered plugins under `.opencode/plugin(s)` are already local files, so ConfigPlugin.load
          // returns normalized Specs and we only need to attach origin metadata here.
          const list = yield* Effect.promise(() => ConfigPlugin.load(dir))
          yield* mergePluginOrigins(dir, list)
        }

        if (process.env.STRATA_CONFIG_CONTENT) {
          // stratacode_change start - capture STRATA_CONFIG_CONTENT parse failures as warnings
          const source = "STRATA_CONFIG_CONTENT"
          yield* merge(
            source,
            yield* loadConfig(process.env.STRATA_CONFIG_CONTENT, {
              dir: ctx.directory,
              source,
            }).pipe(
              Effect.tap(() => Effect.sync(() => log.debug("loaded custom config from STRATA_CONFIG_CONTENT"))),
              Effect.catchDefect((err: unknown) => {
                caughtWarning(warnings, source, err)
                return Effect.succeed({} as Info)
              }),
            ),
            "local",
          )
          // stratacode_change end
        }

        const activeAccount = Option.getOrUndefined(
          yield* accountSvc.active().pipe(Effect.catch(() => Effect.succeed(Option.none()))),
        )
        if (activeAccount?.active_org_id) {
          const accountID = activeAccount.id
          const orgID = activeAccount.active_org_id
          const url = activeAccount.url
          yield* Effect.gen(function* () {
            const [configOpt, tokenOpt] = yield* Effect.all(
              [accountSvc.config(accountID, orgID), accountSvc.token(accountID)],
              { concurrency: 2 },
            )
            if (Option.isSome(tokenOpt)) {
              process.env["STRATA_CONSOLE_TOKEN"] = tokenOpt.value
              yield* env.set("STRATA_CONSOLE_TOKEN", tokenOpt.value)
            }

            if (Option.isSome(configOpt)) {
              const source = `${url}/api/config`
              const next = yield* loadConfig(JSON.stringify(configOpt.value), {
                dir: path.dirname(source),
                source,
              })
              for (const providerID of Object.keys(next.provider ?? {})) {
                consoleManagedProviders.add(providerID)
              }
              yield* merge(source, next, "global")
            }
          }).pipe(
            Effect.withSpan("Config.loadActiveOrgConfig"),
            Effect.catch((err) => {
              log.debug("failed to fetch remote account config", {
                error: err instanceof Error ? err.message : String(err),
              })
              return Effect.void
            }),
          )
        }

        const managedDir = ConfigManaged.managedConfigDir()
        // stratacode_change start - include strata.json/strata.jsonc in managed dir loading
        if (existsSync(managedDir)) {
          for (const file of StratacodeConfig.ALL_CONFIG_FILES) {
            const source = path.join(managedDir, file)
            yield* merge(source, yield* loadFile(source), "global")
          }
        }
        // stratacode_change end

        // macOS managed preferences (.mobileconfig deployed via MDM) override everything
        const managed = yield* Effect.promise(() => ConfigManaged.readManagedPreferences())
        if (managed) {
          result = mergeConfigConcatArrays(
            result,
            yield* loadConfig(managed.text, {
              dir: path.dirname(managed.source),
              source: managed.source,
            }),
          )
        }

        for (const [name, mode] of Object.entries(result.mode ?? {})) {
          result.agent = mergeDeep(result.agent ?? {}, {
            [name]: {
              ...mode,
              mode: "primary" as const,
            },
          })
        }

        if (Flag.STRATA_PERMISSION) {
          result.permission = mergeDeep(result.permission ?? {}, JSON.parse(Flag.STRATA_PERMISSION))
        }

        if (result.tools) {
          const perms: Record<string, ConfigPermission.Action> = {}
          for (const [tool, enabled] of Object.entries(result.tools)) {
            const action: ConfigPermission.Action = enabled ? "allow" : "deny"
            if (tool === "write" || tool === "edit" || tool === "patch") {
              perms.edit = action
              continue
            }
            perms[tool] = action
          }
          result.permission = mergeDeep(perms, result.permission ?? {})
        }

        if (!result.username) result.username = os.userInfo().username

        if (result.autoshare === true && !result.share) {
          result.share = "auto"
        }

        if (Flag.STRATA_DISABLE_AUTOCOMPACT) {
          result.compaction = { ...result.compaction, auto: false }
        }
        if (Flag.STRATA_DISABLE_PRUNE) {
          result.compaction = { ...result.compaction, prune: false }
        }
        // stratacode_change start — inject Strata default plugins into both plugin list and origins
        StratacodeDefaultPlugins.apply(result, { disabled: Flag.STRATA_DISABLE_DEFAULT_PLUGINS, log })
        // stratacode_change end

        return {
          config: result,
          directories,
          deps,
          warnings, // stratacode_change
          consoleState: {
            consoleManagedProviders: Array.from(consoleManagedProviders),
            activeOrgName,
            switchableOrgCount: 0,
          },
        }
      },
      Effect.provideService(AppFileSystem.Service, fs),
    )

    const state = yield* InstanceState.make<State>(
      Effect.fn("Config.state")(function* (ctx) {
        return yield* loadInstanceState(ctx).pipe(Effect.orDie)
      }),
    )

    const get = Effect.fn("Config.get")(function* () {
      return yield* InstanceState.use(state, (s) => s.config)
    })

    const directories = Effect.fn("Config.directories")(function* () {
      return yield* InstanceState.use(state, (s) => s.directories)
    })

    const getConsoleState = Effect.fn("Config.getConsoleState")(function* () {
      return yield* InstanceState.use(state, (s) => s.consoleState)
    })

    const waitForDependencies = Effect.fn("Config.waitForDependencies")(function* () {
      yield* InstanceState.useEffect(state, (s) =>
        Effect.forEach(s.deps, Fiber.join, { concurrency: "unbounded" }).pipe(Effect.asVoid),
      )
    })

    // stratacode_change start
    const warnings = Effect.fn("Config.warnings")(function* () {
      return yield* InstanceState.use(state, (s) => s.warnings)
    })
    // stratacode_change end

    const update = Effect.fn("Config.update")(function* (config: Info) {
      const dir = yield* InstanceState.directory
      const file = path.join(dir, "config.json")
      const existing = yield* loadFile(file)
      yield* fs
        .writeFileString(
          file,
          JSON.stringify(StratacodeConfig.mergeConfig(writable(existing), writable(config)), null, 2),
        )
        .pipe(Effect.orDie) // stratacode_change
      yield* Effect.promise(() => Instance.dispose())
    })

    const invalidate = Effect.fn("Config.invalidate")(function* (wait?: boolean) {
      yield* invalidateGlobal
      const task = Instance.disposeAll()
        .catch(() => undefined)
        .finally(() =>
          GlobalBus.emit("event", {
            directory: "global",
            payload: {
              type: Event.Disposed.type,
              properties: {},
            },
          }),
        )
      if (wait) yield* Effect.promise(() => task)
      else void task
    })

    // stratacode_change start - add dispose option to skip Instance.disposeAll for permission-only changes
    const updateGlobal = Effect.fn("Config.updateGlobal")(function* (config: Info, options?: { dispose?: boolean }) {
      const dispose = options?.dispose ?? true
      // stratacode_change end
      const file = globalConfigFile()
      const before = (yield* readConfigFile(file)) ?? "{}"

      let next: Info
      if (!file.endsWith(".jsonc")) {
        const existing = ConfigParse.schema(Info.zod, ConfigParse.jsonc(before, file), file)
        const merged = StratacodeConfig.mergeConfig(writable(existing), writable(config)) // stratacode_change
        yield* fs.writeFileString(file, JSON.stringify(merged, null, 2)).pipe(Effect.orDie)
        next = merged
      } else {
        const updated = patchJsonc(before, writable(config))
        next = ConfigParse.schema(Info.zod, ConfigParse.jsonc(updated, file), file)
        yield* fs.writeFileString(file, updated).pipe(Effect.orDie)
      }

      // stratacode_change start - skip dispose when caller opts out
      if (!dispose) {
        yield* invalidateGlobal
        yield* InstanceState.invalidate(state)
        yield* Effect.sync(() =>
          GlobalBus.emit("event", {
            directory: "global",
            payload: {
              type: Event.ConfigUpdated.type,
              properties: {},
            },
          }),
        )
        return next
      }
      // stratacode_change end

      yield* invalidate()
      return next
    })

    return Service.of({
      get,
      getGlobal,
      getConsoleState,
      update,
      updateGlobal,
      invalidate,
      directories,
      waitForDependencies,
      warnings, // stratacode_change
    })
  }),
)

export const defaultLayer = layer.pipe(
  Layer.provide(EffectFlock.defaultLayer),
  Layer.provide(AppFileSystem.defaultLayer),
  Layer.provide(Env.defaultLayer),
  Layer.provide(Auth.defaultLayer),
  Layer.provide(Account.defaultLayer),
  Layer.provide(Npm.defaultLayer),
)

// stratacode_change start - keep async wrappers for Strata callsites during Effect migration
const { runPromise } = makeRuntime(Service, defaultLayer)

export async function get() {
  return runPromise((svc) => svc.get())
}

export async function getGlobal() {
  return runPromise((svc) => svc.getGlobal())
}

export async function getConsoleState() {
  return runPromise((svc) => svc.getConsoleState())
}

export async function update(config: Info) {
  return runPromise((svc) => svc.update(config))
}

export async function updateGlobal(config: Info, options?: { dispose?: boolean }) {
  return runPromise((svc) => svc.updateGlobal(config, options))
}

export async function invalidate(wait = false) {
  return runPromise((svc) => svc.invalidate(wait))
}

export async function directories() {
  return runPromise((svc) => svc.directories())
}

export async function waitForDependencies() {
  return runPromise((svc) => svc.waitForDependencies())
}

export async function warnings() {
  return runPromise((svc) => svc.warnings())
}
// stratacode_change end
