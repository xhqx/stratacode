// stratacode_change - new file
import { Effect, Layer } from "effect"
import { Log } from "@/util"
import { Config } from "@/config"
import { ContextMapService } from "./worker/context-map"
import { RepoMap } from "./repomap"
import { Ripgrep } from "@/file/ripgrep"
import { AppFileSystem } from "@opencode-ai/shared/filesystem"

const log = Log.create({ service: "project-context" })

export interface ProjectContextOptions {
  cwd: string
  mentioned?: string[]
  summaryBudget?: number
  repomapBudget?: number
  summary?: boolean
  repomap?: boolean
}

const defaultOptions: Required<Omit<ProjectContextOptions, "cwd" | "mentioned">> = {
  summaryBudget: 1200,
  repomapBudget: 6000,
  summary: true,
  repomap: true,
}

const layer = Layer.merge(Ripgrep.defaultLayer, AppFileSystem.defaultLayer)

/**
 * Injects project-level structural context into a prompt.
 * Features:
 * - Reads `ContextMap.summary` (already cached on disk)
 * - Generates `RepoMap` using `mentioned` files so the map is focused
 * - Composes into a single `## Project Context` section prepended to the prompt
 */
export async function injectProjectContext(prompt: string, opts: ProjectContextOptions): Promise<string> {
  const cfg = await Config.get()
  if (!cfg.workers?.enabled) {
    return prompt
  }

  const options = { ...defaultOptions, ...opts }
  const parts: string[] = []

  // 1. Summary
  if (options.summary) {
    try {
      const map = await ContextMapService.read(options.cwd)
      if (map.summary) {
        parts.push(map.summary.slice(0, options.summaryBudget))
      }
    } catch (err) {
      log.warn("failed to read summary", { err })
    }
  }

  // 2. RepoMap
  if (options.repomap) {
    try {
      const repomapResult = await Effect.runPromise(
        RepoMap.generate({
          cwd: options.cwd,
          budget: options.repomapBudget,
          mentioned: options.mentioned,
        }).pipe(Effect.provide(layer)),
      )
      
      if (repomapResult.map) {
        parts.push(repomapResult.map)
      }
    } catch (err) {
      log.warn("failed to generate repomap", { err })
    }
  }

  if (parts.length === 0) {
    return prompt
  }

  const contextStr = `## Project Context\n\n${parts.join("\n\n")}`
  
  return `${contextStr}\n\n${prompt}`
}
