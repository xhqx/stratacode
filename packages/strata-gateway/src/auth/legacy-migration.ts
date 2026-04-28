/**
 * Legacy Strata CLI migration module
 *
 * Migrates authentication from the legacy Strata Code VS Code extension CLI
 * config path (~/.stratacode/cli/config.json) to the new auth.json format.
 */
import fs from "fs/promises"
import os from "os"
import path from "path"

export const LEGACY_CONFIG_PATH = path.join(os.homedir(), ".stratacode", "cli", "config.json")

interface LegacyProvider {
  id: string
  provider: string
  stratacodeToken?: string
  stratacodeModel?: string
  stratacodeOrganizationId?: string
}

interface LegacyConfig {
  providers?: LegacyProvider[]
}

interface LegacyStrataAuth {
  token: string
  organizationId?: string
}

// Auth info types matching opencode's Auth module
type ApiAuth = { type: "api"; key: string }
type OAuthAuth = { type: "oauth"; access: string; refresh: string; expires: number; accountId?: string }
type AuthInfo = ApiAuth | OAuthAuth

/**
 * Extract strata auth from legacy config
 */
function extractStrataAuth(config: LegacyConfig): LegacyStrataAuth | undefined {
  if (!config.providers) return undefined

  const provider = config.providers.find((p) => p.provider === "stratacode")
  if (!provider?.stratacodeToken) return undefined

  return {
    token: provider.stratacodeToken,
    organizationId: provider.stratacodeOrganizationId,
  }
}

/**
 * Migrate Strata authentication from legacy CLI config path.
 *
 * Checks ~/.stratacode/cli/config.json for existing strata credentials
 * and migrates them to the new auth.json format.
 *
 * @param hasStrataAuth - Callback to check if strata auth already exists
 * @param saveStrataAuth - Callback to save the migrated auth
 * @returns true if migration was performed, false otherwise
 */
export async function migrateLegacyStrataAuth(
  hasStrataAuth: () => Promise<boolean>,
  saveStrataAuth: (auth: AuthInfo) => Promise<void>,
): Promise<boolean> {
  // Skip if strata auth already configured
  if (await hasStrataAuth()) return false

  // Check if legacy config exists and parse it
  const content = await fs.readFile(LEGACY_CONFIG_PATH, "utf-8").catch(() => null)
  if (!content) return false

  let config: LegacyConfig | null = null
  try {
    config = JSON.parse(content) as LegacyConfig
  } catch {
    return false
  }

  // Extract strata auth from legacy config
  const legacy = extractStrataAuth(config)
  if (!legacy) return false

  // Migrate to new format
  // Use OAuth format if organization ID present, otherwise API format
  if (legacy.organizationId) {
    await saveStrataAuth({
      type: "oauth",
      access: legacy.token,
      refresh: "",
      expires: 0,
      accountId: legacy.organizationId,
    })
  } else {
    await saveStrataAuth({
      type: "api",
      key: legacy.token,
    })
  }

  return true
}
