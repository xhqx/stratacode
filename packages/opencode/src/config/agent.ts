export * as ConfigAgent from "./agent"

import { Schema } from "effect"
import z from "zod"
import { Bus } from "@/bus"
import { zod } from "@/util/effect-zod"
import { Log } from "../util"
import { NamedError } from "@opencode-ai/shared/util/error"
import { Glob } from "@opencode-ai/shared/util/glob"
import { configEntryNameFromPath } from "./entry-name"
import * as ConfigMarkdown from "./markdown"
import { ConfigModelID } from "./model-id"
import { ConfigPermission } from "./permission"
// stratacode_change start
import * as ConfigAutoApprove from "./auto-approve"
import { StratacodeConfig } from "@/stratacode/config/config"
import type { Warning } from "./config"
// stratacode_change end

const log = Log.create({ service: "config" })

const PositiveInt = Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThan(0))

const Color = Schema.Union([
  Schema.String.check(Schema.isPattern(/^#[0-9a-fA-F]{6}$/)),
  Schema.Literals(["primary", "secondary", "accent", "success", "warning", "error", "info"]),
])

const AgentSchema = Schema.StructWithRest(
  Schema.Struct({
    model: Schema.optional(Schema.NullOr(ConfigModelID)), // stratacode_change - nullable for delete sentinel
    variant: Schema.optional(Schema.String).annotate({
      description: "Default model variant for this agent (applies only when using the agent's configured model).",
    }),
    temperature: Schema.optional(Schema.Number),
    top_p: Schema.optional(Schema.Number),
    prompt: Schema.optional(Schema.String),
    tools: Schema.optional(Schema.Record(Schema.String, Schema.Boolean)).annotate({
      description: "@deprecated Use 'permission' field instead",
    }),
    disable: Schema.optional(Schema.Boolean),
    description: Schema.optional(Schema.String).annotate({ description: "Description of when to use the agent" }),
    mode: Schema.optional(Schema.Literals(["subagent", "primary", "all"])),
    hidden: Schema.optional(Schema.Boolean).annotate({
      description: "Hide this subagent from the @ autocomplete menu (default: false, only applies to mode: subagent)",
    }),
    options: Schema.optional(Schema.Record(Schema.String, Schema.Any)),
    color: Schema.optional(Color).annotate({
      description: "Hex color code (e.g., #FF5733) or theme color (e.g., primary)",
    }),
    steps: Schema.optional(PositiveInt).annotate({
      description: "Maximum number of agentic iterations before forcing text-only response",
    }),
    maxSteps: Schema.optional(PositiveInt).annotate({ description: "@deprecated Use 'steps' field instead." }),
    permission: Schema.optional(ConfigPermission.Info),
    fallback_models: Schema.optional(Schema.mutable(Schema.Array(ConfigModelID))).annotate({
      description: "Ordered list of fallback models (provider/model) to try when the active model is unavailable.",
    }), // stratacode_change
    model_pool: Schema.optional(
      Schema.Struct({
        enabled: Schema.optional(Schema.Boolean),
        models: Schema.mutable(Schema.Array(ConfigModelID)),
        max_concurrent: Schema.optional(Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThan(0))),
        timeout: Schema.optional(Schema.Number.check(Schema.isGreaterThan(0))),
      }),
    ).annotate({
      description: "Model pool configuration for concurrent load-balanced subagent dispatch.",
    }), // stratacode_change
    auto_approve: Schema.optional(ConfigAutoApprove.Info), // stratacode_change
    // stratacode_change start
    retry: Schema.optional(
      Schema.Struct({
        enabled: Schema.optional(Schema.Boolean),
        limit: Schema.optional(Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0))),
        delay: Schema.optional(Schema.Number.check(Schema.isGreaterThan(0))),
        max_delay: Schema.optional(Schema.Number.check(Schema.isGreaterThan(0))),
      }),
    ),
    // stratacode_change end
  }),
  [Schema.Record(Schema.String, Schema.Any)],
)

const KNOWN_KEYS = new Set([
  "name",
  "model",
  "variant",
  "prompt",
  "description",
  "temperature",
  "top_p",
  "mode",
  "hidden",
  "color",
  "steps",
  "maxSteps",
  "options",
  "permission",
  "disable",
  "tools",
  "fallback_models", // stratacode_change
  "model_pool", // stratacode_change
  "auto_approve", // stratacode_change
  "retry", // stratacode_change
])

// Post-parse normalisation:
//  - Promote any unknown-but-present keys into `options` so they survive the
//    round-trip in a well-known field.
//  - Translate the deprecated `tools: { name: boolean }` map into the new
//    `permission` shape (write-adjacent tools collapse into `permission.edit`).
//  - Coalesce `steps ?? maxSteps` so downstream can ignore the deprecated alias.
const normalize = (agent: z.infer<typeof Info>) => {
  const options: Record<string, unknown> = { ...agent.options }
  for (const [key, value] of Object.entries(agent)) {
    if (!KNOWN_KEYS.has(key)) options[key] = value
  }

  const permission: ConfigPermission.Info = {}
  for (const [tool, enabled] of Object.entries(agent.tools ?? {})) {
    const action = enabled ? "allow" : "deny"
    if (tool === "write" || tool === "edit" || tool === "patch") {
      permission.edit = action
      continue
    }
    permission[tool] = action
  }
  globalThis.Object.assign(permission, agent.permission)

  const steps = agent.steps ?? agent.maxSteps
  return { ...agent, options, permission, ...(steps !== undefined ? { steps } : {}) }
}

export const Info = zod(AgentSchema).transform(normalize).meta({ ref: "AgentConfig" }) as unknown as z.ZodType<
  Omit<z.infer<ReturnType<typeof zod<typeof AgentSchema>>>, "options" | "permission" | "steps"> & {
    options?: Record<string, unknown>
    permission?: ConfigPermission.Info
    steps?: number
  }
>
export type Info = z.infer<typeof Info>

// stratacode_change start
export async function load(dir: string, warnings?: Warning[]) {
  // stratacode_change end
  const result: Record<string, Info> = {}
  for (const item of await Glob.scan("{agent,agents}/**/*.md", {
    cwd: dir,
    absolute: true,
    dot: true,
    symlink: true,
  })) {
    const md = await ConfigMarkdown.parse(item).catch(async (err) => {
      const message = ConfigMarkdown.FrontmatterError.isInstance(err)
        ? err.data.message
        : `Failed to parse agent ${item}`
      // stratacode_change start
      if (warnings) warnings.push({ path: item, message })
      try {
        const { Session } = await import("@/session")
        Bus.publish(Session.Event.Error, { error: new NamedError.Unknown({ message }).toObject() })
      } catch (e) {
        log.warn("could not publish session error", { message, err: e })
      }
      log.error("failed to load agent", { agent: item, err })
      return undefined
      // stratacode_change end
    })
    if (!md) continue

    // stratacode_change start
    const patterns = [
      "/.strata/agent/",
      "/.strata/agents/",
      "/.stratacode/agent/",
      "/.stratacode/agents/",
      "/.opencode/agent/",
      "/.opencode/agents/",
      "/agent/",
      "/agents/",
    ]
    // stratacode_change end
    const name = configEntryNameFromPath(item, patterns)

    const config = {
      name,
      ...md.data,
      prompt: md.content.trim(),
    }
    const parsed = Info.safeParse(config)
    if (parsed.success) {
      result[config.name] = parsed.data
      continue
    }
    // stratacode_change start
    await StratacodeConfig.handleInvalid("agent", item, parsed.error.issues, parsed.error, warnings)
    // stratacode_change end
  }
  return result
}

// stratacode_change start
export async function loadMode(dir: string, warnings?: Warning[]) {
  // stratacode_change end
  const result: Record<string, Info> = {}
  for (const item of await Glob.scan("{mode,modes}/*.md", {
    cwd: dir,
    absolute: true,
    dot: true,
    symlink: true,
  })) {
    const md = await ConfigMarkdown.parse(item).catch(async (err) => {
      const message = ConfigMarkdown.FrontmatterError.isInstance(err)
        ? err.data.message
        : `Failed to parse mode ${item}`
      // stratacode_change start
      if (warnings) warnings.push({ path: item, message })
      try {
        const { Session } = await import("@/session")
        Bus.publish(Session.Event.Error, { error: new NamedError.Unknown({ message }).toObject() })
      } catch (e) {
        log.warn("could not publish session error", { message, err: e })
      }
      log.error("failed to load mode", { mode: item, err })
      return undefined
      // stratacode_change end
    })
    if (!md) continue

    const config = {
      name: configEntryNameFromPath(item, []),
      ...md.data,
      prompt: md.content.trim(),
    }
    const parsed = Info.safeParse(config)
    if (parsed.success) {
      result[config.name] = {
        ...parsed.data,
        mode: "primary" as const,
      }
      continue
    }
    // stratacode_change start
    await StratacodeConfig.handleInvalid("agent", item, parsed.error.issues, parsed.error, warnings)
    // stratacode_change end
  }
  return result
}
