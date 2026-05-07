// stratacode_change - new file
import { Logger } from "../logger"

export type PostMessage = (msg: any) => void

interface ServerConfig {
  baseUrl: string
  password: string
}

type ConfigProvider = () => ServerConfig | null
type DirectoryProvider = () => string

function auth(config: ServerConfig): Record<string, string> {
  return {
    Authorization: `Basic ${Buffer.from(`strata:${config.password}`).toString("base64")}`,
  }
}

/**
 * Handle docs.* webview messages by proxying to the CLI /docs/* HTTP API.
 * Returns true if the message was consumed.
 */
export async function handleDocsMessage(
  msg: Record<string, unknown>,
  post: PostMessage,
  config: ConfigProvider,
  directory: DirectoryProvider,
): Promise<boolean> {
  switch (msg.type) {
    case "docs.requestManifest":
      return fetchManifest(post, config, directory)
    case "docs.requestPage":
      return fetchPage(msg.id as string, post, config, directory)
    case "docs.generate":
      return generate(post, config, directory)
    case "docs.regenerate":
      return regenerate(msg.id as string, post, config, directory)
    default:
      return false
  }
}

async function fetchManifest(
  post: PostMessage,
  config: ConfigProvider,
  directory: DirectoryProvider,
): Promise<boolean> {
  const cfg = config()
  if (!cfg) {
    post({ type: "docsManifest", manifest: null })
    return true
  }
  try {
    const dir = directory()
    const res = await fetch(`${cfg.baseUrl}/docs/manifest`, {
      headers: { ...auth(cfg), ...(dir ? { "x-strata-directory": dir } : {}) },
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const raw = (await res.json()) as {
      version: number
      generated: string
      pages: Array<{ id: string; path: string; title: string; status: string; symbols: number; generated: string }>
    }
    // Map CLI shape → webview shape
    const manifest = {
      version: String(raw.version),
      lastUpdated: raw.generated,
      pages: raw.pages.map((p) => ({
        id: p.id,
        title: p.title,
        path: p.path,
        type: "file",
        status: p.status === "ready" ? "generated" : p.status === "pending" || p.status === "stale" ? "draft" : p.status,
      })),
    }
    post({ type: "docsManifest", manifest })
  } catch (err) {
    Logger.error("DocsFeature", "Failed to fetch manifest:", err)
    post({ type: "docsManifest", manifest: null })
  }
  return true
}

async function fetchPage(
  id: string,
  post: PostMessage,
  config: ConfigProvider,
  directory: DirectoryProvider,
): Promise<boolean> {
  const cfg = config()
  if (!cfg) {
    post({ type: "docsPage", page: null })
    return true
  }
  try {
    const dir = directory()
    const res = await fetch(`${cfg.baseUrl}/docs/page/${encodeURIComponent(id)}`, {
      headers: { ...auth(cfg), ...(dir ? { "x-strata-directory": dir } : {}) },
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = (await res.json()) as { content: string; meta: Record<string, unknown> }
    post({
      type: "docsPage",
      page: {
        id,
        content: data.content,
        lastUpdated: (data.meta.generated as string) ?? new Date().toISOString(),
      },
    })
  } catch (err) {
    Logger.error("DocsFeature", "Failed to fetch page:", err)
    post({ type: "docsPage", page: null })
  }
  return true
}

async function generate(
  post: PostMessage,
  config: ConfigProvider,
  directory: DirectoryProvider,
): Promise<boolean> {
  const cfg = config()
  if (!cfg) return true
  try {
    post({ type: "docsGenerationStarted" })
    const dir = directory()
    const res = await fetch(`${cfg.baseUrl}/docs/generate`, {
      method: "POST",
      headers: { ...auth(cfg), ...(dir ? { "x-strata-directory": dir } : {}) },
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    post({ type: "docsGenerationComplete" })
  } catch (err) {
    Logger.error("DocsFeature", "Failed to generate docs:", err)
    post({ type: "docsGenerationError", error: String(err) })
  }
  return true
}

async function regenerate(
  id: string,
  post: PostMessage,
  config: ConfigProvider,
  directory: DirectoryProvider,
): Promise<boolean> {
  const cfg = config()
  if (!cfg) return true
  try {
    post({ type: "docsGenerationStarted" })
    const dir = directory()
    const res = await fetch(`${cfg.baseUrl}/docs/regenerate/${encodeURIComponent(id)}`, {
      method: "POST",
      headers: { ...auth(cfg), ...(dir ? { "x-strata-directory": dir } : {}) },
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    post({ type: "docsGenerationComplete" })
  } catch (err) {
    Logger.error("DocsFeature", "Failed to regenerate page:", err)
    post({ type: "docsGenerationError", error: String(err) })
  }
  return true
}
