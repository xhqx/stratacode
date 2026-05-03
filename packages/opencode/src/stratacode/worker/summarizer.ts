// stratacode_change - new file
import { Effect, Layer } from "effect"
import { Log } from "@/util"
import { generateText } from "ai"
import { Provider, ProviderTransform } from "@/provider"
import { Agent } from "@/agent/agent"
import { ContextMapService } from "./context-map"
import * as Config from "@/config/config"
import { RepoMap } from "@/stratacode/repomap"
import { AppFileSystem } from "@opencode-ai/shared/filesystem"
import { Ripgrep } from "@/file/ripgrep"

const layer = Layer.merge(Ripgrep.defaultLayer, AppFileSystem.defaultLayer)

const log = Log.create({ service: "worker:summarizer" })

export async function summarizerWorker(cwd: string, payload: any): Promise<void> {
  const map = await ContextMapService.read(cwd)
  const unsummarized = ContextMapService.unsummarized(map)

  if (unsummarized.length === 0) {
    log.info("no new reviews to summarize")
    return
  }

  const filesToSummarize = unsummarized.map((r) => r.file)

  // Get repomap with mentioned files
  const repomapResult = await Effect.runPromise(
    RepoMap.generate({ cwd, budget: 16000, mentioned: filesToSummarize }).pipe(Effect.provide(layer)),
  )

  // Get recent reviews text
  const reviewText = unsummarized.map((r) => `File: ${r.file}\nSummary: ${r.summary}`).join("\n\n")

  // Get model (fallback to small model)
  const defaultModel = await Provider.defaultModel()
  const model =
    (await Provider.getSmallModel(defaultModel.providerID).catch(() => undefined)) ??
    (await Provider.getModel(defaultModel.providerID, defaultModel.modelID))

  const language = await Provider.getLanguage(model)

  const systemPrompt =
    "You are a senior engineer tracking project context. Summarize the recent file changes in the context of the repository map. Provide a unified view of what's changing and why. Keep it under 3 paragraphs."

  const result = await generateText({
    model: language,
    temperature: 0.1,
    providerOptions: ProviderTransform.providerOptions(model, model.options ?? {}),
    maxRetries: 2,
    system: systemPrompt,
    messages: [
      {
        role: "user" as const,
        content: `Recent Changes:\n${reviewText}\n\nRepository Map Context:\n${repomapResult.map}`,
      },
    ],
  })

  const summary = result.text.trim()

  // Update map
  map.summary = summary
  for (const r of unsummarized) {
    map.summarized_files[r.file] = r.hash
  }

  await ContextMapService.write(cwd, map)
  log.info("summarized", { files: filesToSummarize.length })
}
