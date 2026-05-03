// stratacode_change - new file
import { generateText } from "ai"
import { mergeDeep } from "remeda"
import { Provider, ProviderTransform } from "@/provider"
import { Log } from "@/util"
import { Agent } from "@/agent/agent"
import { ContextMapService } from "./worker/context-map"

const log = Log.create({ service: "chat-autocomplete" })

const FALLBACK_PROMPT = `You are a chat prompt completion assistant.
Continue the user's partial input naturally and concisely.
Respond ONLY with the completion text. If nothing useful to add, respond with an empty string.`

/** Strip leading overlap, markdown, quotes, and truncate at the first newline. */
export function cleanCompletion(raw: string, prefix: string): string {
  let text = raw.replace(/^```[\s\S]*?```$/m, "").trim()
  // Remove any leading overlap with the prefix (case-insensitive)
  const lower = text.toLowerCase()
  const prefixLower = prefix.toLowerCase().slice(-30)
  const idx = lower.indexOf(prefixLower)
  if (idx === 0 && prefixLower.length > 3) {
    text = text.slice(prefixLower.length)
  }
  // Take only the first line
  const line = text.split("\n")[0]
  // Strip surrounding quotes
  return line.replace(/^([`'""])(.+)\1$/, "$2").trim()
}

export async function chatAutocomplete(text: string, directory?: string): Promise<string> {
  log.info("generating chat autocomplete", { length: text.length })

  const agent = await Agent.get("chat_autocomplete").catch(() => undefined)
  const system = agent?.prompt ?? FALLBACK_PROMPT

  let content = text
  if (directory) {
    try {
      const { Config } = await import("@/config")
      const cfg = await Config.get()
      if (cfg.workers?.enabled) {
        const map = await ContextMapService.read(directory)
        if (map.summary) {
          content = `## Project Context\n${map.summary.slice(0, 2000)}\n\nUser input so far:\n${text}`
        }
      }
    } catch {
      // context enrichment is best-effort
    }
  }

  const defaultModel = await Provider.defaultModel()
  const model =
    (await Provider.getSmallModel(defaultModel.providerID).catch(() => undefined)) ??
    (await Provider.getModel(defaultModel.providerID, defaultModel.modelID))

  const language = await Provider.getLanguage(model)
  const temp = agent?.temperature ?? 0.3

  const result = await generateText({
    model: language,
    temperature: model.capabilities.temperature ? temp : undefined,
    providerOptions: ProviderTransform.providerOptions(
      model,
      mergeDeep(ProviderTransform.smallOptions(model), model.options),
    ),
    maxRetries: 2,
    system,
    messages: [{ role: "user" as const, content }],
  })

  const completion = cleanCompletion(result.text, text)
  log.info("completion generated", { length: completion.length })
  return completion
}
