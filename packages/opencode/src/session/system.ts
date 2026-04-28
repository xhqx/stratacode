import { Context, Effect, Layer } from "effect"

import { Global } from "../global" // stratacode_change
import { Instance } from "../project/instance"

import PROMPT_ANTHROPIC from "./prompt/anthropic.txt"
import PROMPT_DEFAULT from "./prompt/default.txt"
import PROMPT_BEAST from "./prompt/beast.txt"
import PROMPT_GEMINI from "./prompt/gemini.txt"
import PROMPT_GPT from "./prompt/gpt.txt"
import PROMPT_KIMI from "./prompt/kimi.txt"
import PROMPT_LING from "./prompt/ling.txt" // stratacode_change

import PROMPT_CODEX from "./prompt/codex.txt"
import PROMPT_TRINITY from "./prompt/trinity.txt"
import type { Provider } from "@/provider"
import type { Agent } from "@/agent/agent"
import { Permission } from "@/permission"
import { Skill } from "@/skill"

// stratacode_change start
import SOUL from "../stratacode/soul.txt"
import { staticEnvLines, type EditorContext } from "../stratacode/editor-context"
import { isLing } from "../stratacode/model-match"
// stratacode_change end

// stratacode_change start
export function instructions() {
  return PROMPT_CODEX.trim()
}

export function soul() {
  return SOUL.trim()
}
// stratacode_change end

export function provider(model: Provider.Model) {
  // stratacode_change start
  switch (model.prompt) {
    case "anthropic":
      return [PROMPT_ANTHROPIC]
    case "anthropic_without_todo":
      return [PROMPT_DEFAULT]
    case "beast":
      return [PROMPT_BEAST]
    case "codex":
      return [PROMPT_CODEX]
    case "gemini":
      return [PROMPT_GEMINI]
    case "ling":
      return [PROMPT_LING]
    case "trinity":
      return [PROMPT_TRINITY]
  }
  // stratacode_change end

  if (model.api.id.includes("gpt-4") || model.api.id.includes("o1") || model.api.id.includes("o3"))
    return [PROMPT_BEAST]
  if (model.api.id.includes("gpt")) {
    if (model.api.id.includes("codex")) {
      return [PROMPT_CODEX]
    }
    return [PROMPT_GPT]
  }
  if (model.api.id.includes("gemini-")) return [PROMPT_GEMINI]
  if (model.api.id.includes("claude")) return [PROMPT_ANTHROPIC]
  if (model.api.id.toLowerCase().includes("trinity")) return [PROMPT_TRINITY]
  if (model.api.id.toLowerCase().includes("kimi")) return [PROMPT_KIMI]
  if (isLing(model.api.id)) return [PROMPT_LING] // stratacode_change
  return [PROMPT_DEFAULT]
}

export interface Interface {
  readonly environment: (model: Provider.Model, editorContext?: EditorContext) => string[] // stratacode_change
  readonly skills: (agent: Agent.Info) => Effect.Effect<string | undefined>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/SystemPrompt") {}

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const skill = yield* Skill.Service

    return Service.of({
      environment(model, editorContext) { // stratacode_change
        const project = Instance.project
        return [
          [
            `You are powered by the model named ${model.api.id}. The exact model ID is ${model.providerID}/${model.api.id}`,
            `Here is some useful information about the environment you are running in:`,
            `<env>`,
            `  Working directory: ${Instance.directory}`,
            `  Workspace root folder: ${Instance.worktree}`,
            `  Is directory a git repo: ${project.vcs === "git" ? "yes" : "no"}`,
            `  Platform: ${process.platform}`,
            `  Today's date: ${new Date().toDateString()}`,
            `  Project config: .strata/command/*.md, .strata/agent/*.md, strata.json, AGENTS.md. Put new commands and agents in .strata/. Do not use .stratacode/ or .opencode/.`, // stratacode_change
            `  Global config: ${Global.Path.config}/ (same structure)`, // stratacode_change
            ...staticEnvLines(editorContext), // stratacode_change
            `</env>`,
          ].join("\n"),
        ]
      },

      skills: Effect.fn("SystemPrompt.skills")(function* (agent: Agent.Info) {
        if (Permission.disabled(["skill"], agent.permission).has("skill")) return

        const list = yield* skill.available(agent)

        return [
          "Skills provide specialized instructions and workflows for specific tasks.",
          "Use the skill tool to load a skill when a task matches its description.",
          // the agents seem to ingest the information about skills a bit better if we present a more verbose
          // version of them here and a less verbose version in tool description, rather than vice versa.
          Skill.fmt(list, { verbose: true }),
        ].join("\n")
      }),
    })
  }),
)

export const defaultLayer = layer.pipe(Layer.provide(Skill.defaultLayer))

export * as SystemPrompt from "./system"
