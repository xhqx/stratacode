import { generateText } from "ai"
import { mergeDeep } from "remeda"
import { Provider } from "@/provider"
import { ProviderTransform } from "@/provider"
import { Log } from "@/util"
import { Agent } from "@/agent/agent"
import { fetchSessionContext } from "./session-context" // stratacode_change

const log = Log.create({ service: "enhance-prompt" })

const FALLBACK = `Generate an enhanced version of this prompt.

Respond with ONLY a JSON object with this exact structure (no markdown fences, no extra text):
{
  "enhanced_prompt": "The fully enhanced prompt..."
}`

export function clean(text: string) {
  let jsonStr = text.trim()
  const match = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
  if (match && match[1]) {
    jsonStr = match[1].trim()
  } else {
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      jsonStr = jsonMatch[0].trim()
    }
  }

  try {
    const parsed = JSON.parse(jsonStr)
    if (parsed.enhanced_prompt) {
      return parsed.enhanced_prompt.trim()
    }
  } catch (err) {
    // fallback if model failed to output JSON
  }

  const stripped = text.replace(/^```\w*\n?|```$/g, "").trim()
  return stripped.replace(/^(['"])([\s\S]*)\1$/, "$2").trim()
}

/**
 * Agent-configured prompt enhancement. Resolves the hidden `enhance` agent's
 * prompt/model/temperature, then calls generateText directly — no session
 * identity, no tool loop, no plugin hooks.
 */
// stratacode_change start - accept directory for session context enrichment
export async function enhancePrompt(text: string, directory?: string): Promise<string> {
  log.info("enhancing", { length: text.length, directory })

  // Prepend session context when a directory is provided
  let enriched = text
  if (directory) {
    try {
      const { Config } = await import("@/config")
      const cfg = await Config.get()
      const limit = cfg.session_context?.limit ?? 5
      if (limit > 0) {
        const context = await fetchSessionContext(directory, limit)
        if (context) enriched = `${context}\n\n${text}`
      }

      if (cfg.workers?.enabled) {
        const { ContextMapService } = await import("./worker/context-map")
        enriched = await ContextMapService.inject(enriched, directory)
      }
    } catch (err) {
      log.warn("session context fetch failed, continuing without", { err })
    }
  }
  // stratacode_change end

  const agent = await Agent.get("enhance").catch(() => undefined)
  const system = agent?.prompt ?? FALLBACK

  const defaultModel = await Provider.defaultModel()
  const model = agent?.model
    ? await Provider.getModel(agent.model.providerID, agent.model.modelID)
    : ((await Provider.getSmallModel(defaultModel.providerID)) ??
      (await Provider.getModel(defaultModel.providerID, defaultModel.modelID)))

  const language = await Provider.getLanguage(model)

  const temp = agent?.temperature ?? 0.7
  const result = await generateText({
    model: language,
    temperature: model.capabilities.temperature ? temp : undefined,
    providerOptions: ProviderTransform.providerOptions(
      model,
      mergeDeep(ProviderTransform.smallOptions(model), model.options),
    ),
    maxRetries: 3,
    system,
    messages: [{ role: "user" as const, content: enriched }], // stratacode_change - use enriched text
  })

  log.info("enhanced", { length: result.text.length })
  return clean(result.text)
}
