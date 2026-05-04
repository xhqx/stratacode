// stratacode_change - new file
import { Effect, Layer } from "effect"
import { Log } from "@/util"
import { generateText } from "ai"
import { Provider, ProviderTransform } from "@/provider"
import { ContextMapService } from "./context-map"
import * as Config from "@/config/config"
import { RepoMap } from "@/stratacode/repomap"
import { AppFileSystem } from "@opencode-ai/shared/filesystem"
import { Ripgrep } from "@/file/ripgrep"
import { WorktreeDiff } from "../review/worktree-diff"
import { dispatch } from "./worker"
import { Bus } from "@/bus"
import { Started, Completed, Failed } from "./events"
import { createHash } from "crypto"
import { Git } from "@/git"
import { fetchSessionContext } from "../session-context"

const layer = Layer.merge(Ripgrep.defaultLayer, AppFileSystem.defaultLayer)

const log = Log.create({ service: "worker:summarizer" })

let pollingInterval: NodeJS.Timeout | null = null
let subscribedToConfig = false

import { Event } from "@/server/event"
import { Instance } from "@/project/instance"

export async function startSummarizerPolling(cwd: string) {
  if (!subscribedToConfig) {
    subscribedToConfig = true
    // Ensure polling is restarted when config changes
    Bus.subscribe(Event.ConfigUpdated, async () => {
      if (Instance.directory) {
        log.info("config updated, restarting summarizer polling")
        await startSummarizerPolling(Instance.directory)
      }
    })
  }

  if (pollingInterval) clearInterval(pollingInterval)

  const cfg = await Config.get()
  if (!cfg.workers?.enabled || cfg.workers?.summarizer === false) return

  const intervalSec = cfg.workers?.polling_interval_sec ?? 5
  log.info("starting summarizer polling", { intervalSec })

  pollingInterval = setInterval(() => {
    dispatch(cwd, "summarizer_worker", { polling: true }).catch((err) => {
      log.error("failed to dispatch polling summarizer_worker", { err })
    })
  }, intervalSec * 1000)
}

export async function summarizerWorker(cwd: string, payload: any): Promise<void> {
  const map = await ContextMapService.read(cwd)

  // 1. Fetch uncommitted changes and branch changes
  const uncommitted = await WorktreeDiff.summary({ dir: cwd, base: "HEAD", log })
  const branchChanges = await WorktreeDiff.summary({ dir: cwd, base: "main", log }).catch(() => [])

  // Combine and deduplicate
  const allChanges = new Map<string, (typeof uncommitted)[0]>()
  for (const change of branchChanges) allChanges.set(change.file, change)
  for (const change of uncommitted) allChanges.set(change.file, change) // HEAD overrides branch

  const filesToSummarize: string[] = []

  for (const [file, change] of allChanges) {
    if (map.summarized_files[file] !== change.stamp) {
      filesToSummarize.push(file)
    }
  }

  // Also include previously queued unsummarized reviews just in case
  const unsummarizedReviews = ContextMapService.unsummarized(map)
  for (const r of unsummarizedReviews) {
    if (!filesToSummarize.includes(r.file)) {
      filesToSummarize.push(r.file)
    }
  }

  if (filesToSummarize.length === 0) {
    // nothing new to summarize
    return
  }

  // Compute source hash for invalidation
  let gitHead = ""
  try {
    const res = await Git.run(["rev-parse", "HEAD"], { cwd })
    if (res.exitCode === 0) gitHead = res.text().trim()
  } catch {}

  const hashInputs = [
    gitHead,
    ...Array.from(allChanges.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([f, c]) => `${f}:${c.stamp}`),
    ...unsummarizedReviews.map((r) => r.hash),
  ].join("|")

  const sourceHash = createHash("sha256").update(hashInputs).digest("hex")

  if (map.source_hash === sourceHash && filesToSummarize.length === 0) {
    // Context is already fresh
    return
  }

  // Publish Started event so VS Code bottom bar can track it
  const taskId = Math.random().toString(36).slice(2)
  Bus.publish(Started, { id: taskId, worker: "summarizer_worker", file: "repository" }).catch(() => {})
  const startTime = Date.now()

  try {
    // Get repomap with mentioned files
    const repomapResult = await Effect.runPromise(
      RepoMap.generate({ cwd, budget: 16000, mentioned: filesToSummarize }).pipe(Effect.provide(layer)),
    )

    // Build diffs/reviews text
    let diffContext = ""
    for (const file of filesToSummarize) {
      const change = allChanges.get(file)
      const review = unsummarizedReviews.find((r) => r.file === file)
      if (review) {
        diffContext += `File: ${file}\nSummary: ${review.summary}\n\n`
      } else if (change) {
        // We only have the stamp/meta here, the model will just see it's changed in repomap
        // unless we load the full diff. But repomap gives structural context.
        diffContext += `File: ${file} (${change.status})\nAdditions: ${change.additions}, Deletions: ${change.deletions}\n\n`
      }
    }

    const cfg = await Config.get()
    const sessionLimit = cfg.session_context?.limit ?? 5
    let sessionContext = ""
    if (sessionLimit > 0) {
      sessionContext = await fetchSessionContext(cwd, sessionLimit)
    }

    // Get model (fallback to small model)
    const defaultModel = await Provider.defaultModel()
    const model =
      (await Provider.getSmallModel(defaultModel.providerID).catch(() => undefined)) ??
      (await Provider.getModel(defaultModel.providerID, defaultModel.modelID))

    const language = await Provider.getLanguage(model)

    const systemPrompt =
      cfg.workers?.summarizer_prompt ||
      `You are a senior engineer tracking project context.
Given the repository structure, recent changes, and session history, produce three summaries at different detail levels.

Return ONLY a JSON object with exactly these keys:
{
  "big": "Detailed multi-paragraph analysis of all changes, their relationships, architectural impact, and session context...",
  "medium": "Condensed 2-3 paragraph summary of key changes, affected areas, and recent session titles...",
  "small": "1-3 sentence overview of current project state and key changes..."
}`

    const result = await generateText({
      model: language,
      temperature: 0.1,
      providerOptions: ProviderTransform.providerOptions(model, model.options ?? {}),
      maxRetries: 2,
      system: systemPrompt,
      messages: [
        {
          role: "user" as const,
          content: `Recent Changes:\n${diffContext}\n\nSession Context:\n${sessionContext}\n\nRepository Map Context:\n${repomapResult.map}`,
        },
      ],
    })

    let big = ""
    let medium = ""
    let small = ""

    try {
      let jsonStr = result.text.trim()
      const match = jsonStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
      if (match && match[1]) {
        jsonStr = match[1].trim()
      } else {
        const jsonMatch = jsonStr.match(/\{[\s\S]*\}/)
        if (jsonMatch) jsonStr = jsonMatch[0].trim()
      }
      const parsed = JSON.parse(jsonStr)
      big = parsed.big || ""
      medium = parsed.medium || ""
      small = parsed.small || ""
    } catch (err) {
      log.warn("failed to parse structured summary, falling back to raw text", { text: result.text })
      medium = result.text.trim()
      big = medium
      small = medium.slice(0, 500)
    }

    const summary = medium

    const patch: Partial<import("./context-map").ContextMap> = {
      summary,
      big,
      medium,
      small,
      source_hash: sourceHash,
      summarized_files: { ...map.summarized_files },
    }

    for (const file of filesToSummarize) {
      const change = allChanges.get(file)
      if (change) {
        patch.summarized_files![file] = change.stamp
      } else {
        const review = unsummarizedReviews.find((r) => r.file === file)
        if (review) patch.summarized_files![file] = review.hash
      }
    }

    await ContextMapService.merge(cwd, patch)
    log.info("summarized", { files: filesToSummarize.length })

    Bus.publish(Completed, {
      id: taskId,
      worker: "summarizer_worker",
      duration: Date.now() - startTime,
      result: summary,
    }).catch(() => {})
  } catch (err) {
    log.error("summarizer worker failed", { err })
    const msg = err instanceof Error ? err.message : String(err)
    Bus.publish(Failed, { id: taskId, worker: "summarizer_worker", error: msg }).catch(() => {})
  }
}
