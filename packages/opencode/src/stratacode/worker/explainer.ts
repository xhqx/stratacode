// stratacode_change - new file
import { Effect } from "effect"
import { Log } from "@/util"
import { Git } from "@/git"
import { generateText } from "ai"
import { Provider, ProviderTransform } from "@/provider"
import { Agent } from "@/agent/agent"
import { createHash } from "crypto"
import * as Config from "@/config/config"

const log = Log.create({ service: "worker:explainer" })

export async function explainerWorker(cwd: string, payload: any): Promise<any> {
  const file = payload.file
  if (!file) return

  const cfg = await Config.get()
  if (!cfg.workers?.auto_explain) return // skip if disabled

  const maxChars = cfg.workers?.max_diff_chars ?? 8000

  // Get diff
  const diffResult = await Git.run(["diff", "HEAD", "--", file], { cwd })
  if (diffResult.exitCode !== 0) return
  const diff = diffResult.text()

  if (!diff.trim()) return // no changes

  if (diff.length > maxChars) {
    log.info("diff too large, skipping explainer", { file })
    return
  }

  const hash = createHash("sha256").update(diff).digest("hex")

  // Get model (fallback to small model)
  const defaultModel = await Provider.defaultModel()
  const model =
    (await Provider.getSmallModel(defaultModel.providerID).catch(() => undefined)) ??
    (await Provider.getModel(defaultModel.providerID, defaultModel.modelID))

  const language = await Provider.getLanguage(model)

  const systemPrompt =
    "Explain the provided code diff. Focus on the 'why' and 'how'. Be concise but informative. Format as plain text or simple markdown."

  const result = await generateText({
    model: language,
    temperature: 0.1,
    providerOptions: ProviderTransform.providerOptions(model, model.options ?? {}),
    maxRetries: 2,
    system: systemPrompt,
    messages: [{ role: "user" as const, content: `File: ${file}\n\nDiff:\n${diff}` }],
  })

  log.info("explained", { file })
  return { file, hash, explanation: result.text.trim() }
}
