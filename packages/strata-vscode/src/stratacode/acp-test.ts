/**
 * ACP (Agent Client Protocol) connection testing and provider metadata.
 *
 * Handles:
 *  - Sending predefined ACP provider metadata to the webview
 *  - Testing ACP provider connections via stdio/child_process
 *  - Resolving local binaries on $PATH before falling back to npx
 */
import { execSync, spawn } from "child_process"
import { Logger } from "./logger"
import * as path from "path"

interface ProviderModel {
  id: string
  name: string
  description?: string
}

interface PredefinedProvider {
  name: string
  description: string
  icon: string
  command: string[]
  localBin?: string
  localArgs?: string[]
  env: string[]
  models: ProviderModel[]
  default: string
}

function registry(): Record<string, PredefinedProvider> {
  const extensionDir = __dirname
  const pkgDir = path.resolve(extensionDir, "..", "..") // /packages
  const opencodeDir = path.join(pkgDir, "opencode")
  const registryPath = path.join(opencodeDir, "src", "stratacode", "acp-client", "registry")
  const { PREDEFINED } = require(registryPath)
  return PREDEFINED as unknown as Record<string, PredefinedProvider>
}

const TAG = "ACP"

/** Timeout for ACP connection tests — generous enough for npx cold-cache. */
const TIMEOUT_MS = 30_000

type Post = (msg: Record<string, unknown>) => void

/**
 * Resolve the spawn command for a provider.
 *
 * If the predefined provider declares a `localBin` and that binary is found on
 * $PATH (via `which`), we use `[localBin, ...localArgs]` — no npx overhead.
 * Otherwise we fall back to the full `command` array (typically npx-based).
 */
function resolveCommand(
  predefined: PredefinedProvider | undefined,
  userCommand: string[] | string | undefined,
): string[] {
  // User-configured command always wins — no resolution needed
  if (userCommand) {
    return Array.isArray(userCommand) ? userCommand : userCommand.split(" ")
  }

  if (!predefined) return []

  // Try to find the local binary on $PATH
  if (predefined.localBin) {
    try {
      const resolved = execSync(`which ${predefined.localBin}`, { encoding: "utf8", timeout: 3000 }).trim()
      if (resolved) {
        const args = predefined.localArgs ?? []
        Logger.info(TAG, `Resolved local binary: ${resolved} ${args.join(" ")}`)
        return [resolved, ...args]
      }
    } catch {
      Logger.info(TAG, `Local binary "${predefined.localBin}" not found, falling back to npx`)
    }
  }

  return predefined.command
}

/**
 * Build and send predefined ACP provider metadata to the webview.
 * Merges static registry data with user config (enabled state, model selection).
 */
export function sendAcpProviderMeta(post: Post, cached: unknown): void {
  try {
    const config = (cached as { config?: { acp_providers?: Record<string, any> } } | null)?.config
    const userConf = config?.acp_providers || {}

    Logger.info(TAG, "Building acpProviderMeta", {
      predefined: Object.keys(registry()).length,
      configured: Object.keys(userConf).length,
    })

    const providers: Record<string, unknown> = {}
    for (const [key, preset] of Object.entries(registry())) {
      const cfg = userConf[key] || {}
      providers[key] = {
        name: preset.name,
        description: preset.description,
        icon: preset.icon,
        defaultModel: preset.default,
        enabled: cfg.enabled === true,
        configuredModel: cfg.model ?? preset.default,
        status: "disconnected",
        staticModels: preset.models,
        liveModels: preset.models,
        env: preset.env,
        installed: true,
      }
    }

    Logger.info(TAG, "Sending acpProviderMeta", { keys: Object.keys(providers) })
    post({ type: "acpProviderMeta", providers })
  } catch (e) {
    Logger.error(TAG, "Failed to send ACP provider meta:", e)
  }
}

/**
 * Test an ACP provider connection by spawning the provider binary,
 * performing an ACP handshake, and reporting discovered models.
 */
export async function testAcpConnection(
  key: string,
  post: Post,
  cached: unknown,
  dir: string,
): Promise<void> {
  if (!key) {
    Logger.warn(TAG, "testAcpConnection called with empty key")
    return
  }

  let resolved = false
  const done = (result: { success: boolean; models?: { id: string; name: string }[]; error?: string }) => {
    if (resolved) return
    resolved = true
    const level = result.success ? "info" : "warn"
    Logger[level](TAG, `testAcpConnection result: key=${key}`, {
      success: result.success,
      models: result.models?.length ?? 0,
      error: result.error,
    })
    post({ type: "acpTestResult", key, ...result })
  }

  try {
    const predefined = registry()[key]
    const config = (cached as { config?: { acp_providers?: Record<string, any> } } | null)?.config
    const userConf = config?.acp_providers?.[key] || {}

    const parts = resolveCommand(predefined, userConf.command)

    Logger.info(TAG, `testAcpConnection start: key=${key}`, {
      predefined: !!predefined,
      userConf: Object.keys(userConf).length > 0,
      resolved: parts.join(" "),
    })

    if (parts.length === 0) {
      Logger.warn(TAG, `No command for provider ${key}`)
      return done({ success: false, error: "No command configured for this provider" })
    }

    const bin = parts[0]
    const args = parts.slice(1)

    Logger.info(TAG, `Spawning: ${bin} ${args.join(" ")}`, { cwd: dir })

    const child = spawn(bin, args, {
      env: {
        ...process.env,
        ...(userConf.env || {}),
        // Disable heavy bootstrapping — we only need the ACP handshake
        STRATA_DISABLE_DEFAULT_PLUGINS: "1",
        STRATA_DISABLE_PROJECT_CONFIG: "1",
        OPENCODE_DISABLE_PLUGINS: "1",
        GEMINI_DISABLE_SKILLS: "1",
      },
      cwd: dir,
      stdio: ["pipe", "pipe", "pipe"],
    })

    const timeout = setTimeout(() => {
      Logger.warn(TAG, `Timeout (${TIMEOUT_MS / 1000}s) for ${key}, killing process`)
      child.kill()
      done({ success: false, error: "Connection timed out" })
    }, TIMEOUT_MS)

    let stderr = ""
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString()
    })

    child.on("error", (err: Error) => {
      clearTimeout(timeout)
      Logger.error(TAG, `Spawn error for ${key}: ${err.message}`)
      done({ success: false, error: err.message })
    })

    child.on("exit", (code: number | null, signal: string | null) => {
      Logger.info(TAG, `Process exited for ${key}: code=${code}, signal=${signal}`)
      if (stderr) Logger.warn(TAG, `stderr for ${key}: ${stderr.slice(0, 500)}`)
    })

    // Resolve from opencode's node_modules — bun workspaces don't hoist this to a shared path
    let ClientSideConnection: any
    let ndJsonStream: any
    try {
      const sdk = require("../../../opencode/node_modules/@agentclientprotocol/sdk")
      ClientSideConnection = sdk.ClientSideConnection
      ndJsonStream = sdk.ndJsonStream
      Logger.info(TAG, `ACP SDK loaded for ${key}`)
    } catch (e: any) {
      clearTimeout(timeout)
      child.kill()
      Logger.error(TAG, `@agentclientprotocol/sdk not available: ${e.message}`)
      return done({ success: false, error: `ACP SDK not found: ${e.message}` })
    }

    const { Writable, Readable } = require("stream")
    const stream = ndJsonStream(
      Writable.toWeb(child.stdin),
      Readable.toWeb(child.stdout),
    )

    const conn = new ClientSideConnection((_agent: any) => ({}) as any, stream)

    Logger.info(TAG, `ACP initialize for ${key}…`)
    conn.initialize({
      protocolVersion: 1,
      clientInfo: { name: "strata-test", version: "1.0.0" },
      clientCapabilities: {},
    }).then(() => {
      Logger.info(TAG, `ACP initialized for ${key}, requesting session…`)
      return conn.newSession({ cwd: dir, mcpServers: [] })
    }).then((session: any) => {
      clearTimeout(timeout)
      const available = session.models?.availableModels ?? []
      const models = available.map((m: any) => ({
        id: m.modelId ?? m.id,
        name: m.name ?? m.modelId ?? m.id,
      }))
      Logger.info(TAG, `Session created for ${key}: ${models.length} models available`)
      done({ success: true, models })
      child.kill()
    }).catch((e: any) => {
      clearTimeout(timeout)
      Logger.error(TAG, `ACP handshake failed for ${key}: ${e.message}`)
      if (stderr) Logger.warn(TAG, `stderr for ${key}: ${stderr.slice(0, 500)}`)
      done({ success: false, error: e.message })
      child.kill()
    })
  } catch (e: any) {
    Logger.error(TAG, `Unexpected error for ${key}: ${e.message}`, e.stack)
    done({ success: false, error: e.message })
  }
}
