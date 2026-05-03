// stratacode_change - new file
import { Effect } from "effect"
import { Log } from "@/util"
import { Git } from "@/git"
import { generateText } from "ai"
import { Provider, ProviderTransform } from "@/provider"
import { Agent } from "@/agent/agent"
import { ContextMapService } from "./context-map"
import { createHash } from "crypto"
import * as Config from "@/config/config"

const log = Log.create({ service: "worker:review" })

export async function reviewWorker(cwd: string, payload: any): Promise<void> {
  const file = payload.file
  if (!file) return

  const cfg = await Config.get()
  const maxChars = cfg.workers?.max_diff_chars ?? 8000

  // Get diff
  const diffResult = await Git.run(["diff", "HEAD", "--", file], { cwd })
  if (diffResult.exitCode !== 0) return
  const diff = diffResult.text()

  if (!diff.trim()) return // no changes

  if (diff.length > maxChars) {
    log.info("diff too large, skipping review", { file, chars: diff.length })
    return
  }

  const hash = createHash("sha256").update(diff).digest("hex").slice(0, 16)

  // check if already reviewed this exact diff hash
  let map = await ContextMapService.read(cwd)
  const existing = map.reviews.find((r) => r.file === file)
  if (existing && existing.hash === hash) {
    return // already reviewed
  }

  // Get model (fallback to small model)
  const defaultModel = await Provider.defaultModel()
  const model =
    (await Provider.getSmallModel(defaultModel.providerID).catch(() => undefined)) ??
    (await Provider.getModel(defaultModel.providerID, defaultModel.modelID))

  const language = await Provider.getLanguage(model)

  const systemPrompt =
    "You are a code reviewer. Briefly summarize the intent and changes of this diff in 1-2 sentences. Output ONLY the summary."

  const result = await generateText({
    model: language,
    temperature: 0.1,
    providerOptions: ProviderTransform.providerOptions(model, model.options ?? {}),
    maxRetries: 2,
    system: systemPrompt,
    messages: [{ role: "user" as const, content: `File: ${file}\n\nDiff:\n${diff}` }],
  })

  const summary = result.text.trim()

  // Update map
  map = await ContextMapService.read(cwd)
  map.reviews = map.reviews.filter((r) => r.file !== file)
  map.reviews.push({ file, hash, summary, ts: Date.now() })
  await ContextMapService.write(cwd, map)

  log.info("reviewed", { file })
}
