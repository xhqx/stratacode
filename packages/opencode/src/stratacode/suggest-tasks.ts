// stratacode_change - new file
import { generateText } from "ai"
import { mergeDeep } from "remeda"
import { Provider, ProviderTransform } from "@/provider"
import { Log } from "@/util"
import { Agent } from "@/agent/agent"
import { ContextMapService } from "./worker/context-map"

const log = Log.create({ service: "suggest-tasks" })

const MAX_CTX_CHARS = 8000

const FALLBACK_PROMPT = `You are a senior developer assistant.
Given recent project changes, propose 2-3 concise actionable next tasks.
Respond ONLY with a JSON array of strings.`

export interface SuggestTasksResult {
  suggestions: string[]
}

/** Build a trimmed context payload from the ContextMap. */
async function buildContext(dir: string): Promise<string> {
  const map = await ContextMapService.read(dir)
  const parts: string[] = []
  if (map.summary) parts.push(`Project summary:\n${map.summary}`)
  const reviews = map.reviews
    .slice(-5)
    .map((r) => `- ${r.file}: ${r.summary}`)
    .join("\n")
  if (reviews) parts.push(`Recent file changes:\n${reviews}`)
  const commits = (map.recent_commits ?? []).slice(0, 5).join(", ")
  if (commits) parts.push(`Recent commits: ${commits}`)
  const sessions = (map.session_titles ?? []).slice(0, 3).join(", ")
  if (sessions) parts.push(`Recent sessions: ${sessions}`)
  return parts.join("\n\n").slice(0, MAX_CTX_CHARS)
}

/** Parse raw model output into a safe string array (max 3 items). */
export function parseSuggestions(raw: string): string[] {
  const match = raw.match(/\[[\s\S]*\]/)
  if (!match) return []
  try {
    const arr = JSON.parse(match[0])
    if (!Array.isArray(arr)) return []
    return arr
      .filter((s) => typeof s === "string" && s.trim())
      .slice(0, 3)
      .map((s: string) => s.trim())
  } catch {
    return []
  }
}

export async function suggestTasks(directory: string): Promise<SuggestTasksResult> {
  log.info("generating task suggestions", { directory })

  const ctx = await buildContext(directory)
  if (!ctx) {
    log.info("no context available, skipping suggestions")
    return { suggestions: [] }
  }

  const agent = await Agent.get("suggest_tasks").catch(() => undefined)
  const system = agent?.prompt ?? FALLBACK_PROMPT

  const defaultModel = await Provider.defaultModel()
  const model =
    (await Provider.getSmallModel(defaultModel.providerID).catch(() => undefined)) ??
    (await Provider.getModel(defaultModel.providerID, defaultModel.modelID))

  const language = await Provider.getLanguage(model)
  const temp = agent?.temperature ?? 0.6

  const result = await generateText({
    model: language,
    temperature: model.capabilities.temperature ? temp : undefined,
    providerOptions: ProviderTransform.providerOptions(
      model,
      mergeDeep(ProviderTransform.smallOptions(model), model.options),
    ),
    maxRetries: 2,
    system,
    messages: [{ role: "user" as const, content: ctx }],
  })

  const suggestions = parseSuggestions(result.text)
  log.info("suggestions generated", { count: suggestions.length })
  return { suggestions }
}
