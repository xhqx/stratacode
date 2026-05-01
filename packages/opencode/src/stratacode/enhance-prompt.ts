import { generateText } from "ai"
import { mergeDeep } from "remeda"
import { Provider } from "@/provider"
import { ProviderTransform } from "@/provider"
import { Log } from "@/util"
import { Agent } from "@/agent/agent"

const log = Log.create({ service: "enhance-prompt" })

const FALLBACK =
  "Generate an enhanced version of this prompt (reply with only the enhanced prompt - no conversation, explanations, lead-in, bullet points, placeholders, or surrounding quotes):"

export function clean(text: string) {
  const stripped = text.replace(/^```\w*\n?|```$/g, "").trim()
  return stripped.replace(/^(['"])([\s\S]*)\1$/, "$2").trim()
}

/**
 * Agent-configured prompt enhancement. Resolves the hidden `enhance` agent's
 * prompt/model/temperature, then calls generateText directly — no session
 * identity, no tool loop, no plugin hooks.
 */
export async function enhancePrompt(text: string): Promise<string> {
  log.info("enhancing", { length: text.length })

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
    messages: [{ role: "user" as const, content: text }],
  })

  log.info("enhanced", { length: result.text.length })
  return clean(result.text)
}
