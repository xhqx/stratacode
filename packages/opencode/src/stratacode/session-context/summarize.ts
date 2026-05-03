// stratacode_change - new file
import { generateText } from "ai"
import { Provider } from "@/provider"
import { ProviderTransform } from "@/provider"
import { Agent } from "@/agent/agent"
import { Log } from "@/util"
import * as Config from "@/config/config"
import * as Session from "@/session/session"
import { MessageV2 } from "@/session/message-v2"
import { Global } from "@/global"
import { createHash } from "crypto"
import path from "path"
import fs from "fs/promises"

const log = Log.create({ service: "session-context" })

const PROMPT = `Condense these developer session descriptions into a concise bullet list.
For each session, output: "- <title> — <1-sentence description of what was done>"
Output ONLY the bullet list, no preamble or closing.`

interface CacheEntry {
  summary: string
  hash: string
  created: number
}

function digest(input: string): string {
  return createHash("sha256").update(input).digest("hex").slice(0, 16)
}

function cacheDir(): string {
  return path.join(Global.Path.state, "session-context-cache")
}

function cachePath(key: string): string {
  return path.join(cacheDir(), `${key}.json`)
}

async function readCache(key: string, ttl: number): Promise<string | undefined> {
  try {
    const raw = await fs.readFile(cachePath(key), "utf-8")
    const entry: CacheEntry = JSON.parse(raw)
    if (entry.hash === key && Date.now() - entry.created < ttl) {
      return entry.summary
    }
  } catch {
    // cache miss
  }
  return undefined
}

async function writeCache(key: string, summary: string): Promise<void> {
  try {
    await fs.mkdir(cacheDir(), { recursive: true })
    const entry: CacheEntry = { summary, hash: key, created: Date.now() }
    await fs.writeFile(cachePath(key), JSON.stringify(entry))
  } catch (err) {
    log.warn("failed to cache session context", { err })
  }
}

export async function fetchSessionContext(directory: string, limit: number): Promise<string> {
  if (limit <= 0) return ""

  log.info("fetching", { directory, limit })

  const sessions: Session.Info[] = []
  for (const s of Session.list({ directory, limit, roots: true })) {
    sessions.push(s)
  }

  if (sessions.length === 0) {
    log.info("no sessions found")
    return ""
  }

  const key = digest(JSON.stringify(sessions.map((s) => [s.id, s.time.updated])))

  // Check cache
  const cfg = await Config.get()
  const ttl = (cfg.session_context?.cache_days ?? 30) * 86_400_000

  const cached = await readCache(key, ttl)
  if (cached) {
    log.info("cache hit", { key })
    return cached
  }

  // Collect raw context from sessions
  const parts: string[] = []
  for (const s of sessions) {
    let intent = ""
    try {
      const page = MessageV2.page({ sessionID: s.id, limit: 3 })
      const first = page.items.find((m) => m.info.role === "user")
      if (first) {
        const text = first.parts
          .filter((p): p is MessageV2.Part & { type: "text"; text: string } => p.type === "text" && "text" in p)
          .map((p) => p.text)
          .join(" ")
        intent = text.slice(0, 300)
      }
    } catch {
      // skip messages if unavailable
    }
    parts.push(`Session: ${s.title}\nFirst message: ${intent || "(no message)"}`)
  }

  const raw = parts.join("\n\n")
  log.info("summarizing", { sessions: sessions.length, chars: raw.length })

  // Resolve model via the summary agent's model config, fallback to small model
  const agent = await Agent.get("summary").catch(() => undefined)
  const defaultModel = await Provider.defaultModel()
  const model = agent?.model
    ? await Provider.getModel(agent.model.providerID, agent.model.modelID)
    : ((await Provider.getSmallModel(defaultModel.providerID)) ??
      (await Provider.getModel(defaultModel.providerID, defaultModel.modelID)))

  const language = await Provider.getLanguage(model)

  const result = await generateText({
    model: language,
    temperature: 0.3,
    providerOptions: ProviderTransform.providerOptions(model, model.options),
    maxRetries: 2,
    system: PROMPT,
    messages: [{ role: "user" as const, content: raw }],
  })

  const summary = `=== DEVELOPER CONTEXT ===\nRecent work in this directory:\n${result.text.trim()}`

  // Store in cache
  await writeCache(key, summary)

  log.info("generated", { length: summary.length })
  return summary
}
