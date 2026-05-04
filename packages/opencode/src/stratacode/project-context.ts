// stratacode_change - new file
import { Effect, Layer } from "effect"
import { Log } from "@/util"
import { Config } from "@/config"
import { ContextMapService } from "./worker/context-map"
import { RepoMap } from "./repomap"
import { Ripgrep } from "@/file/ripgrep"
import { AppFileSystem } from "@opencode-ai/shared/filesystem"
import { WorktreeDiff } from "./review/worktree-diff"
import { summarizerWorker } from "./worker/summarizer"

const log = Log.create({ service: "project-context" })

export type ContextTier = "big" | "medium" | "small"

export interface ContextOptions {
  cwd: string
  tier?: ContextTier
  mentioned?: string[]
}

const layer = Layer.merge(Ripgrep.defaultLayer, AppFileSystem.defaultLayer)

/**
 * Central context provider.
 * Strategy:
 * 1. Read cached tier from ContextMap (fast path)
 * 2. If stale AND workers enabled -> on-demand LLM refresh
 * 3. If workers disabled -> raw assembler (RepoMap + diffs, no LLM)
 */
export async function getContext(opts: ContextOptions): Promise<string> {
  const tier = opts.tier ?? "medium"
  const map = await ContextMapService.read(opts.cwd)
  const cached = map[tier]
  const age = Date.now() - map.updated
  const stale = age > 5 * 60 * 1000

  if (cached && !stale) return cached

  const cfg = await Config.get()

  // Workers enabled: generate via LLM (synchronous summarizer trigger)
  if (cfg.workers?.enabled && cfg.workers?.summarizer !== false) {
    return refreshTier(opts.cwd, tier, opts.mentioned)
  }

  // Workers disabled: raw context assembly (no LLM cost)
  return assembleRaw(opts.cwd, tier, opts.mentioned)
}

export async function injectContext(prompt: string, opts: ContextOptions): Promise<string> {
  const ctx = await getContext(opts)
  if (!ctx) return prompt
  return `## Developer Context\n\n${ctx}\n\n${prompt}`
}

async function assembleRaw(cwd: string, tier: ContextTier, mentioned?: string[]): Promise<string> {
  const parts: string[] = []

  let repomapBudget = 6000
  if (tier === "small") repomapBudget = 1000
  if (tier === "big") repomapBudget = 12000

  // 1. RepoMap
  try {
    const repomapResult = await Effect.runPromise(
      RepoMap.generate({
        cwd,
        budget: repomapBudget,
        mentioned,
      }).pipe(Effect.provide(layer)),
    )
    if (repomapResult.map) {
      parts.push(repomapResult.map)
    }
  } catch (err) {
    log.warn("failed to generate raw repomap", { err })
  }

  if (tier !== "small") {
    // 2. Diffs info
    try {
      const changes = await WorktreeDiff.summary({ dir: cwd, base: "HEAD", log })
      if (changes.length > 0) {
        let diffStr = "Recent file changes:\n"
        for (const c of changes) {
          diffStr += `- ${c.file} (${c.status}) +${c.additions} -${c.deletions}\n`
        }
        parts.push(diffStr)
      }
    } catch (err) {
      log.warn("failed to get diff summary", { err })
    }
  }

  return parts.join("\n\n")
}

async function refreshTier(cwd: string, tier: ContextTier, mentioned?: string[]): Promise<string> {
  try {
    // Run the summarizer worker synchronously to populate ContextMap
    await summarizerWorker(cwd, { files: mentioned || [], polling: false })
    const map = await ContextMapService.read(cwd)
    return map[tier] ?? map.summary ?? ""
  } catch (err) {
    log.warn("on-demand context refresh failed, falling back to raw", { err })
    return assembleRaw(cwd, tier, mentioned)
  }
}

export interface ProjectContextOptions {
  cwd: string
  mentioned?: string[]
  summaryBudget?: number
  repomapBudget?: number
  summary?: boolean
  repomap?: boolean
}

/** @deprecated Use injectContext() instead */
export async function injectProjectContext(prompt: string, opts: ProjectContextOptions): Promise<string> {
  return injectContext(prompt, {
    cwd: opts.cwd,
    tier: "medium",
    mentioned: opts.mentioned,
  })
}
