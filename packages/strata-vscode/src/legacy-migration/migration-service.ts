/**
 * legacy-migration - Core migration service.
 *
 * Reads legacy Strata Code v5.x data from VS Code SecretStorage and the extension's
 * global storage directory, then writes it to the new CLI backend via the SDK.
 */

import * as vscode from "vscode"
import type { StrataClient } from "@stratacode/sdk/v2/client"
import type {
  McpLocalConfig,
  McpRemoteConfig,
  AgentConfig,
  PermissionConfig,
  PermissionObjectConfig,
} from "@stratacode/sdk/v2/client"
import { PROVIDER_MAP, UNSUPPORTED_PROVIDERS, DEFAULT_MODE_SLUGS } from "./provider-mapping"
import type { ProviderMapping } from "./provider-mapping"
import { NATIVE_MODE_DEFAULTS } from "./native-mode-defaults"
import { getMigrationErrorMessage } from "./errors/migration-error"
import type {
  LegacyProviderProfiles,
  LegacyProviderSettings,
  LegacyMcpSettings,
  LegacyCustomMode,
  LegacyMcpServer,
  LegacySettings,
  LegacyAutocompleteSettings,
  LegacyPromptComponent,
  LegacyMigrationData,
  MigrationSelections,
  MigrationAutoApprovalSelections,
  MigrationProviderInfo,
  MigrationMcpServerInfo,
  MigrationCustomModeInfo,
  MigrationSessionInfo,
  MigrationSessionProgress,
} from "./legacy-types"
import { buildSessionMeta, buildSessionProgress } from "./migration-session-progress"
import type { MigrationResultItem } from "./migration-types"
import { createSessionID } from "./sessions/lib/ids"
import { migrate as migrateSession } from "./sessions/migrate"

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SECRET_KEY = "roo_cline_config_api_config"
const CODEX_OAUTH_SECRET_KEY = "openai-codex-oauth-credentials"
const MIGRATION_STATUS_KEY = "strata.legacyMigrationStatus"

type MigrationStatus = "completed" | "completed_with_errors" | "skipped"

// ---------------------------------------------------------------------------
// Status helpers
// ---------------------------------------------------------------------------

export function getMigrationStatus(context: vscode.ExtensionContext): MigrationStatus | undefined {
  return context.globalState.get<MigrationStatus>(MIGRATION_STATUS_KEY)
}

export async function setMigrationStatus(context: vscode.ExtensionContext, status: MigrationStatus): Promise<void> {
  await context.globalState.update(MIGRATION_STATUS_KEY, status)
}

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------

export function hasLegacySettings(settings: LegacySettings): boolean {
  return (
    settings.autoApprovalEnabled !== undefined ||
    (settings.allowedCommands?.length ?? 0) > 0 ||
    (settings.deniedCommands?.length ?? 0) > 0 ||
    settings.alwaysAllowReadOnly !== undefined ||
    settings.alwaysAllowReadOnlyOutsideWorkspace !== undefined ||
    settings.alwaysAllowWrite !== undefined ||
    settings.alwaysAllowExecute !== undefined ||
    settings.alwaysAllowMcp !== undefined ||
    settings.alwaysAllowModeSwitch !== undefined ||
    settings.alwaysAllowSubtasks !== undefined ||
    Boolean(settings.language) ||
    Boolean(settings.autocomplete)
  )
}

/**
 * Reads legacy data from SecretStorage and global storage files.
 * Returns a structured summary for display in the migration wizard.
 */
export async function detectLegacyData(context: vscode.ExtensionContext): Promise<LegacyMigrationData> {
  const profiles = await readLegacyProviderProfiles(context)
  const mcpSettings = await readLegacyMcpSettings(context)
  const customModes = await readLegacyCustomModes(context)
  const prompts = readLegacyCustomModePrompts(context)
  const settings = readLegacySettings(context)
  const sessions = await readSessionsInGlobalStorage(context)

  const oauthProviders = new Set<string>()
  const codexRaw = await context.secrets.get(CODEX_OAUTH_SECRET_KEY)
  if (codexRaw) oauthProviders.add("openai-codex")

  const providers = buildProviderList(profiles, oauthProviders)
  const mcpServers = buildMcpServerList(mcpSettings)
  const modes = buildCustomModeList(customModes, prompts)
  const defaultModel = resolveDefaultModel(profiles, oauthProviders)

  const hasSettings = hasLegacySettings(settings)

  const hasData =
    providers.length > 0 || mcpServers.length > 0 || modes.length > 0 || hasSettings || sessions.length > 0

  return {
    providers,
    mcpServers,
    customModes: modes,
    sessions: sessions.length > 0 ? sessions : undefined,
    defaultModel,
    settings: hasSettings ? settings : undefined,
    hasData,
  }
}

async function readSessionsInGlobalStorage(context: vscode.ExtensionContext) {
  const items = context.globalState.get<{ id: string; task?: string; workspace?: string; ts?: number }[]>(
    "taskHistory",
    [],
  )
  const base = vscode.Uri.joinPath(context.globalStorageUri, "tasks")
  const sessions: MigrationSessionInfo[] = []
  for (const item of items) {
    const file = vscode.Uri.joinPath(base, item.id, "api_conversation_history.json")
    const exists = await vscode.workspace.fs.stat(file).then(
      () => true,
      () => false,
    )
    if (!exists) continue
    sessions.push({
      id: item.id,
      title: item.task?.trim() || item.id,
      directory: item.workspace?.trim() || "",
      time: item.ts ?? 0,
    })
  }
  return sessions
}

// ---------------------------------------------------------------------------
// Migration
// ---------------------------------------------------------------------------

export type ProgressCallback = (
  item: string,
  status: "migrating" | "success" | "warning" | "error",
  message?: string,
) => void

export type SessionProgressCallback = (progress: MigrationSessionProgress) => void

const SESSION_DELAY = 300
const SESSION_SUMMARY_DELAY = 1000

async function migrateProvidersSelection(
  context: vscode.ExtensionContext,
  client: StrataClient,
  selections: string[],
  profiles: LegacyProviderProfiles | null | undefined,
  onProgress: ProgressCallback,
): Promise<MigrationResultItem[]> {
  const results: MigrationResultItem[] = []
  for (const profileName of selections) {
    const settings = profiles?.apiConfigs[profileName]
    if (!settings) {
      results.push({ item: profileName, category: "provider", status: "error", message: "Profile not found" })
      continue
    }
    onProgress(profileName, "migrating")
    const result = await migrateProvider(context, profileName, settings, client)
    results.push(result)
    onProgress(profileName, result.status, result.message)
  }
  return results
}

async function migrateMcpServersSelection(
  client: StrataClient,
  selections: string[],
  mcpSettings: LegacyMcpSettings | null | undefined,
  onProgress: ProgressCallback,
): Promise<MigrationResultItem[]> {
  const results: MigrationResultItem[] = []
  if (selections.length > 0 && mcpSettings) {
    const mcpConfig: Record<string, McpLocalConfig | McpRemoteConfig> = {}
    for (const name of selections) {
      const server = mcpSettings.mcpServers[name]
      if (!server) {
        results.push({ item: name, category: "mcpServer", status: "error", message: "Server not found" })
        continue
      }
      onProgress(name, "migrating")
      const converted = convertMcpServer(server)
      if (converted) {
        mcpConfig[name] = converted
        results.push({ item: name, category: "mcpServer", status: "success" })
        onProgress(name, "success")
      } else {
        results.push({
          item: name,
          category: "mcpServer",
          status: "warning",
          message: "Could not convert server config",
        })
        onProgress(name, "warning", "Could not convert server config")
      }
    }
    if (Object.keys(mcpConfig).length > 0) {
      await client.global.config.update({ config: { mcp: mcpConfig } })
    }
  }
  return results
}

async function migrateCustomModesSelection(
  client: StrataClient,
  selections: string[],
  customModes: LegacyCustomMode[] | null | undefined,
  prompts: Record<string, LegacyPromptComponent> | null | undefined,
  onProgress: ProgressCallback,
): Promise<MigrationResultItem[]> {
  const results: MigrationResultItem[] = []
  if (selections.length > 0) {
    const agentConfig: Record<string, AgentConfig> = {}
    const detected = buildCustomModeList(customModes, prompts)
    for (const slug of selections) {
      const info = detected.find((m) => m.slug === slug)
      if (!info) {
        results.push({ item: slug, category: "customMode", status: "error", message: "Mode not found" })
        continue
      }

      if (info.nativeSlug) {
        const merged = buildMergedNativeMode(
          customModes?.find((m) => m.slug === info.nativeSlug),
          prompts?.[info.nativeSlug],
          info.nativeSlug,
        )
        if (merged) {
          onProgress(info.name, "migrating")
          const agent = convertCustomMode(merged)
          agent.name = info.name
          agentConfig[slug] = agent
          results.push({ item: info.name, category: "customMode", status: "success" })
          onProgress(info.name, "success")
        } else {
          results.push({
            item: info.name,
            category: "customMode",
            status: "error",
            message: "Failed to build merged mode",
          })
        }
      } else {
        const mode = customModes?.find((m) => m.slug === slug)
        if (!mode) {
          results.push({ item: slug, category: "customMode", status: "error", message: "Mode not found" })
          continue
        }
        onProgress(mode.name, "migrating")
        agentConfig[slug] = convertCustomMode(mode)
        results.push({ item: mode.name, category: "customMode", status: "success" })
        onProgress(mode.name, "success")
      }
    }
    if (Object.keys(agentConfig).length > 0) {
      await client.global.config.update({ config: { agent: agentConfig } })
    }
  }
  return results
}

async function migrateSessionsSelection(
  context: vscode.ExtensionContext,
  client: StrataClient,
  selections: { id: string }[],
  sessions: MigrationSessionInfo[],
  onProgress: ProgressCallback,
  onSessionProgress?: SessionProgressCallback,
): Promise<MigrationResultItem[]> {
  const results: MigrationResultItem[] = []
  if (selections.length > 0) {
    for (const [index, item] of selections.entries()) {
      onProgress(item.id, "migrating")
      const session = sessions.find((entry) => entry.id === item.id)
      const meta = buildSessionMeta(session, index, selections.length)
      const progress = buildSessionProgress(meta, onSessionProgress)
      const result = await migrateSession(item, context, client, meta, progress)
      const reason = result.ok ? "Session migrated" : result.message
      results.push({
        item: item.id,
        category: "session",
        status: result.ok ? "success" : "error",
        message: reason,
      })
      onProgress(item.id, result.ok ? "success" : "error", reason)
      if (index < selections.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, SESSION_DELAY))
      }
    }
    const last = selections.at(-1)
    const session = last ? sessions.find((item) => item.id === last.id) : undefined
    if (session && onSessionProgress) {
      onSessionProgress({
        session,
        index: selections.length,
        total: selections.length,
        phase: "summary",
      })
      await new Promise((resolve) => setTimeout(resolve, SESSION_SUMMARY_DELAY))
    }
  }
  return results
}

/**
 * Executes migration for the selected items.
 * Calls onProgress for each item with real-time status updates.
 * Pass `cachedSettings` (from a prior detectLegacyData call) to avoid re-reading
 * globalState. Provider profiles, MCP servers, and custom modes are always re-read
 * from SecretStorage/disk to ensure the data is current at migration time.
 */
export async function migrate(
  context: vscode.ExtensionContext,
  client: StrataClient,
  selections: MigrationSelections,
  onProgress: ProgressCallback,
  onSessionProgress?: SessionProgressCallback,
  cachedSettings?: LegacySettings,
  cachedSessions?: MigrationSessionInfo[],
): Promise<MigrationResultItem[]> {
  const profiles = await readLegacyProviderProfiles(context)
  const mcpSettings = await readLegacyMcpSettings(context)
  const customModes = await readLegacyCustomModes(context)
  const prompts = readLegacyCustomModePrompts(context)
  const legacySettings = cachedSettings ?? readLegacySettings(context)
  const sessions = cachedSessions ?? (await readSessionsInGlobalStorage(context))

  const results: MigrationResultItem[] = []

  // Migrate providers
  results.push(
    ...(await migrateProvidersSelection(context, client, selections.providers, profiles, onProgress))
  )

  // Migrate MCP servers
  results.push(
    ...(await migrateMcpServersSelection(client, selections.mcpServers, mcpSettings, onProgress))
  )

  // Migrate custom modes as agents
  results.push(
    ...(await migrateCustomModesSelection(client, selections.customModes, customModes, prompts, onProgress))
  )

  // Migrate sessions
  results.push(
    ...(await migrateSessionsSelection(context, client, selections.sessions ?? [], sessions, onProgress, onSessionProgress))
  )

  // Migrate default model
  if (selections.defaultModel && profiles) {
    const activeName = profiles.currentApiConfigName
    const active = profiles.apiConfigs[activeName]
    if (active) {
      onProgress("Default model", "migrating")
      const result = await migrateDefaultModel(active, client)
      results.push(result)
      onProgress("Default model", result.status, result.message)
    }
  }

  // Migrate auto-approval settings (granular, each selected item is independent)
  const apSel = selections.settings.autoApproval
  if (
    apSel.commandRules ||
    apSel.readPermission ||
    apSel.writePermission ||
    apSel.executePermission ||
    apSel.mcpPermission ||
    apSel.taskPermission
  ) {
    const apItems = await migrateAutoApproval(legacySettings, apSel, client, onProgress)
    results.push(...apItems)
  }

  // Migrate language setting
  if (selections.settings.language && legacySettings.language) {
    onProgress("Language preference", "migrating")
    const result = await migrateLanguage(legacySettings.language)
    results.push(result)
    onProgress("Language preference", result.status, result.message)
  }

  // Migrate autocomplete settings
  if (selections.settings.autocomplete && legacySettings.autocomplete) {
    onProgress("Autocomplete settings", "migrating")
    const result = await migrateAutocomplete(legacySettings.autocomplete)
    results.push(result)
    onProgress("Autocomplete settings", result.status, result.message)
  }

  return results
}

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

/**
 * Removes legacy data from SecretStorage, globalState, and VS Code settings.
 */
export async function clearLegacyData(context: vscode.ExtensionContext): Promise<void> {
  await context.secrets.delete(SECRET_KEY)
  await context.secrets.delete(CODEX_OAUTH_SECRET_KEY)

  const legacyStateKeys = [
    "strata-code.allowedCommands",
    "strata-code.deniedCommands",
    "strata-code.autoApprovalEnabled",
    "strata-code.fuzzyMatchThreshold",
    "strata-code.diffEnabled",
    "strata-code.language",
    "strata-code.customModes",
    "strata-code.firstInstallCompleted",
    "strata-code.telemetrySetting",
    "ghostServiceSettings",
    // Fine-grained auto-approval keys (no prefix in legacy globalState)
    "alwaysAllowReadOnly",
    "alwaysAllowReadOnlyOutsideWorkspace",
    "alwaysAllowWrite",
    "alwaysAllowWriteOutsideWorkspace",
    "alwaysAllowWriteProtected",
    "alwaysAllowDelete",
    "alwaysAllowExecute",
    "alwaysAllowBrowser",
    "alwaysAllowMcp",
    "alwaysAllowModeSwitch",
    "alwaysAllowSubtasks",
    "alwaysAllowFollowupQuestions",
    "followupAutoApproveTimeoutMs",
  ]
  for (const key of legacyStateKeys) {
    await context.globalState.update(key, undefined)
  }

  // Clear legacy VS Code settings registered under the "strata-code" configuration scope.
  // These are set via the old extension's contributes.configuration and persist in the
  // user's settings.json even after the extension is uninstalled.
  const legacyVscodeSettings = [
    "allowedCommands",
    "deniedCommands",
    "commandExecutionTimeout",
    "commandTimeoutAllowlist",
    "preventCompletionWithOpenTodos",
    "vsCodeLmModelSelector",
    "customStoragePath",
    "enableCodeActions",
    "autoImportSettingsPath",
    "maximumIndexedFilesForFileSearch",
    "useAgentRules",
    "apiRequestTimeout",
    "newTaskRequireTodos",
    "enableSettingsSync",
    "toolProtocol",
    "debug",
  ]
  const cfg = vscode.workspace.getConfiguration("strata-code")
  for (const key of legacyVscodeSettings) {
    await cfg.update(key, undefined, vscode.ConfigurationTarget.Global)
  }
}

// ---------------------------------------------------------------------------
// Internal — provider migration
// ---------------------------------------------------------------------------

async function migrateProvider(
  context: vscode.ExtensionContext,
  profileName: string,
  settings: LegacyProviderSettings,
  client: StrataClient,
): Promise<MigrationResultItem> {
  const provider = settings.apiProvider
  if (!provider) {
    return { item: profileName, category: "provider", status: "error", message: "No provider type found" }
  }

  if (UNSUPPORTED_PROVIDERS.has(provider)) {
    return {
      item: profileName,
      category: "provider",
      status: "warning",
      message: `Provider "${provider}" is not supported in the new version`,
    }
  }

  const mapping = PROVIDER_MAP[provider]
  if (!mapping) {
    return {
      item: profileName,
      category: "provider",
      status: "warning",
      message: `Unknown provider "${provider}"`,
    }
  }

  // OAuth providers store credentials in a separate VS Code secret
  if (mapping.oauthSecretKey) {
    const creds = await readOAuthCredentials(context, mapping.oauthSecretKey)
    if (!creds) {
      return { item: profileName, category: "provider", status: "warning", message: "No OAuth credentials found" }
    }
    await client.auth.set({ providerID: mapping.id, auth: { type: "oauth" as const, ...creds } })
    return { item: profileName, category: "provider", status: "success" }
  }

  // Providers that use env/ADC-based auth (e.g. Vertex AI) — skip auth.set, only migrate config options
  if (mapping.skipAuth) {
    await migrateConfigFields(mapping, settings, client)
    // Warn users who had inline service account credentials — the CLI uses ADC only
    const hadCredentials = Boolean(settings.vertexJsonCredentials ?? settings.vertexKeyFile)
    return {
      item: profileName,
      category: "provider",
      status: hadCredentials ? "warning" : "success",
      message: hadCredentials
        ? "Project and location migrated. The new CLI uses Application Default Credentials — set GOOGLE_APPLICATION_CREDENTIALS or run 'gcloud auth application-default login'"
        : undefined,
    }
  }

  const apiKey = settings[mapping.key] as string | undefined
  if (!apiKey) {
    return { item: profileName, category: "provider", status: "warning", message: "No API key found in profile" }
  }

  // The profile endpoint requires type:"oauth". The legacy extension stored the same Strata
  // API token — write it in the OAuth format the new extension expects (matching device-auth:
  // access + refresh + 1-year expiry).
  if (mapping.id === "strata") {
    const org = mapping.organizationIdField ? (settings[mapping.organizationIdField] as string | undefined) : undefined
    await client.auth.set({
      providerID: "strata",
      auth: {
        type: "oauth" as const,
        access: apiKey,
        refresh: apiKey,
        expires: Date.now() + 365 * 24 * 60 * 60 * 1000,
        accountId: org,
      },
    })
    return { item: profileName, category: "provider", status: "success" }
  }

  // For providers that support an organization ID (e.g. Strata Gateway), migrate using OAuth
  // auth so the CLI can read accountId for org-scoped API requests.
  const organizationId = mapping.organizationIdField
    ? (settings[mapping.organizationIdField] as string | undefined)
    : undefined

  const auth = organizationId
    ? { type: "oauth" as const, access: apiKey, refresh: "", expires: 0, accountId: organizationId }
    : { type: "api" as const, key: apiKey }

  await client.auth.set({ providerID: mapping.id, auth })

  // If a custom base URL is configured, also persist it to the backend config
  if (mapping.urlField) {
    const url = settings[mapping.urlField] as string | undefined
    if (url) {
      await client.global.config.update({
        config: { provider: { [mapping.id]: { options: { apiKey, baseURL: url } } } },
      })
    }
  }

  await migrateConfigFields(mapping, settings, client)

  return { item: profileName, category: "provider", status: "success" }
}

async function migrateConfigFields(
  mapping: ProviderMapping,
  settings: LegacyProviderSettings,
  client: StrataClient,
): Promise<void> {
  if (!mapping.configFields?.length) return
  const opts: Record<string, string> = {}
  for (const { from, option } of mapping.configFields) {
    const val = settings[from] as string | undefined
    if (val) opts[option] = val
  }
  if (Object.keys(opts).length > 0) {
    await client.global.config.update({
      config: { provider: { [mapping.id]: { options: opts } } },
    })
  }
}

async function migrateDefaultModel(
  settings: LegacyProviderSettings,
  client: StrataClient,
): Promise<MigrationResultItem> {
  const provider = settings.apiProvider
  if (!provider) {
    return { item: "Default model", category: "defaultModel", status: "error", message: "No provider type found" }
  }

  const mapping = PROVIDER_MAP[provider]
  if (!mapping) {
    return {
      item: "Default model",
      category: "defaultModel",
      status: "warning",
      message: `Provider "${provider}" is not supported in the new version`,
    }
  }

  const modelField = mapping.modelField ?? "apiModelId"
  const modelId = settings[modelField] as string | undefined
  if (!modelId) {
    return { item: "Default model", category: "defaultModel", status: "warning", message: "No model ID found" }
  }

  await client.global.config.update({ config: { model: `${mapping.id}/${modelId}` } })
  return { item: "Default model", category: "defaultModel", status: "success" }
}

// ---------------------------------------------------------------------------
// Internal — settings migration (auto-approval, language)
// ---------------------------------------------------------------------------

class AutoApprovalMigrator {
  private permission: Record<string, any> = {}
  private fallback: "allow" | "ask"
  private globalAllowApplied = false
  public results: MigrationResultItem[] = []

  constructor(
    private settings: LegacySettings,
    private sel: MigrationAutoApprovalSelections,
    private onProgress: ProgressCallback
  ) {
    this.fallback = settings.autoApprovalEnabled === true ? "allow" : "ask"
  }

  async migrate(client: StrataClient): Promise<MigrationResultItem[]> {
    if (this.sel.commandRules) await this.migrateCommandRules(client)
    if (this.sel.readPermission) this.migrateReadPermission()
    if (this.sel.writePermission) this.migrateWritePermission()
    if (this.sel.executePermission && !this.sel.commandRules) this.migrateExecutePermission()
    else if (this.sel.executePermission) {
      this.results.push({ item: "Execute permission", category: "settings", status: "success" })
    }
    if (this.sel.mcpPermission) this.migrateMcpPermission()
    if (this.sel.taskPermission) this.migrateTaskPermission()

    if (!this.globalAllowApplied && Object.keys(this.permission).length > 0) {
      await client.global.config.update({ config: { permission: this.permission } })
    }
    return this.results
  }

  private async migrateCommandRules(client: StrataClient) {
    const label = "Command rules"
    this.onProgress(label, "migrating")
    const hasCommandLists = Boolean(this.settings.allowedCommands?.length || this.settings.deniedCommands?.length)
    
    if (this.settings.autoApprovalEnabled === true && !hasCommandLists) {
      await client.global.config.update({ config: { permission: "allow" } })
      this.globalAllowApplied = true
    } else if (hasCommandLists) {
      const bashRules: PermissionObjectConfig = {}
      for (const cmd of this.settings.allowedCommands ?? []) bashRules[cmd.trimEnd() + " *"] = "allow"
      for (const cmd of this.settings.deniedCommands ?? []) bashRules[cmd.trimEnd() + " *"] = "deny"
      bashRules["*"] = this.settings.alwaysAllowExecute === true ? "allow" : this.settings.alwaysAllowExecute === false ? "ask" : this.fallback
      this.permission.bash = bashRules
    }
    
    this.results.push({ item: label, category: "settings", status: "success" })
    this.onProgress(label, "success")
  }

  private migrateReadPermission() {
    const label = "Read permission"
    this.onProgress(label, "migrating")
    if (this.settings.alwaysAllowReadOnly === true) {
      this.permission.read = "allow"
      this.permission.glob = "allow"
      this.permission.grep = "allow"
      this.permission.list = "allow"
    } else if (this.settings.alwaysAllowReadOnly === false) {
      this.permission.read = "ask"
    }
    if (this.settings.alwaysAllowReadOnlyOutsideWorkspace === true) {
      this.permission.external_directory = "allow"
    } else if (this.settings.alwaysAllowReadOnlyOutsideWorkspace === false) {
      this.permission.external_directory = "ask"
    }
    this.results.push({ item: label, category: "settings", status: "success" })
    this.onProgress(label, "success")
  }

  private migrateWritePermission() {
    const label = "Write permission"
    this.onProgress(label, "migrating")
    if (this.settings.alwaysAllowWrite === true) {
      this.permission.edit = "allow"
    } else if (this.settings.alwaysAllowWrite === false) {
      this.permission.edit = "ask"
    }
    this.results.push({ item: label, category: "settings", status: "success" })
    this.onProgress(label, "success")
  }

  private migrateExecutePermission() {
    const label = "Execute permission"
    this.onProgress(label, "migrating")
    if (this.settings.alwaysAllowExecute === true) {
      this.permission.bash = "allow"
    } else if (this.settings.alwaysAllowExecute === false) {
      this.permission.bash = "ask"
    }
    this.results.push({ item: label, category: "settings", status: "success" })
    this.onProgress(label, "success")
  }

  private migrateMcpPermission() {
    const label = "MCP permission"
    this.onProgress(label, "migrating")
    if (this.settings.alwaysAllowMcp === true) {
      this.permission.skill = "allow"
    } else if (this.settings.alwaysAllowMcp === false) {
      this.permission.skill = "ask"
    }
    this.results.push({ item: label, category: "settings", status: "success" })
    this.onProgress(label, "success")
  }

  private migrateTaskPermission() {
    const label = "Task permission"
    this.onProgress(label, "migrating")
    if (this.settings.alwaysAllowModeSwitch === true || this.settings.alwaysAllowSubtasks === true) {
      this.permission.task = "allow"
    } else if (this.settings.alwaysAllowModeSwitch === false && this.settings.alwaysAllowSubtasks === false) {
      this.permission.task = "ask"
    }
    this.results.push({ item: label, category: "settings", status: "success" })
    this.onProgress(label, "success")
  }
}

async function migrateAutoApproval(
  settings: LegacySettings,
  sel: MigrationAutoApprovalSelections,
  client: StrataClient,
  onProgress: ProgressCallback,
): Promise<MigrationResultItem[]> {
  const migrator = new AutoApprovalMigrator(settings, sel, onProgress)
  return await migrator.migrate(client)
}

async function migrateAutocomplete(settings: LegacyAutocompleteSettings): Promise<MigrationResultItem> {
  try {
    const config = vscode.workspace.getConfiguration("strata-code.new.autocomplete")
    if (settings.enableAutoTrigger !== undefined) {
      await config.update("enableAutoTrigger", settings.enableAutoTrigger, vscode.ConfigurationTarget.Global)
    }
    if (settings.enableSmartInlineTaskKeybinding !== undefined) {
      await config.update(
        "enableSmartInlineTaskKeybinding",
        settings.enableSmartInlineTaskKeybinding,
        vscode.ConfigurationTarget.Global,
      )
    }
    if (settings.enableChatAutocomplete !== undefined) {
      await config.update("enableChatAutocomplete", settings.enableChatAutocomplete, vscode.ConfigurationTarget.Global)
    }
    return { item: "Autocomplete settings", category: "settings", status: "success" }
  } catch (err) {
    return {
      item: "Autocomplete settings",
      category: "settings",
      status: "error",
      message: getMigrationErrorMessage(err),
    }
  }
}

// Maps legacy locale codes to their new-extension equivalents.
// Legacy used IETF BCP-47 tags (zh-CN, pt-BR) while the new extension uses short codes.
// Entries absent from this map have no equivalent in the new extension.
const LEGACY_LOCALE_MAP: Record<string, string> = {
  // Direct matches
  en: "en",
  de: "de",
  es: "es",
  fr: "fr",
  ja: "ja",
  ko: "ko",
  pl: "pl",
  ru: "ru",
  ar: "ar",
  th: "th",
  da: "da",
  no: "no",
  bs: "bs",
  // Format changes
  "zh-CN": "zh",
  "zh-TW": "zht",
  "pt-BR": "br",
}

async function migrateLanguage(language: string): Promise<MigrationResultItem> {
  const mapped = LEGACY_LOCALE_MAP[language]
  if (!mapped) {
    return {
      item: "Language preference",
      category: "settings",
      status: "warning",
      message: `Language "${language}" is not supported in the new version`,
    }
  }
  try {
    const config = vscode.workspace.getConfiguration("strata-code.new")
    await config.update("language", mapped, vscode.ConfigurationTarget.Global)
    return { item: "Language preference", category: "settings", status: "success" }
  } catch (err) {
    return {
      item: "Language preference",
      category: "settings",
      status: "error",
      message: getMigrationErrorMessage(err),
    }
  }
}

// ---------------------------------------------------------------------------
// Internal — MCP conversion (legacy → McpServerConfig)
// ---------------------------------------------------------------------------

function convertMcpServer(server: LegacyMcpServer): McpLocalConfig | McpRemoteConfig | null {
  const enabled = server.disabled ? { enabled: false as const } : {}
  // Legacy stores timeout in seconds, the new config expects milliseconds
  const timeout = server.timeout !== undefined ? server.timeout * 1000 : undefined
  if (server.type === "sse" || server.type === "streamable-http") {
    if (!server.url) return null
    return {
      type: "remote",
      url: server.url,
      headers: server.headers,
      ...(timeout !== undefined && { timeout }),
      ...enabled,
    }
  }
  // Default: stdio
  if (!server.command) return null
  const command = server.args ? [server.command, ...server.args] : [server.command]
  return {
    type: "local",
    command,
    environment: server.env,
    ...(timeout !== undefined && { timeout }),
    ...enabled,
  }
}

// ---------------------------------------------------------------------------
// Internal — custom mode conversion (legacy → AgentConfig)
// ---------------------------------------------------------------------------

// Group name → CLI permission key (mirrors ModesMigrator.convertPermissions in the CLI)
const GROUP_TO_PERMISSION: Record<string, string> = {
  read: "read",
  edit: "edit",
  browser: "bash",
  command: "bash",
  mcp: "skill",
}
const ALL_MODE_PERMISSIONS = ["read", "edit", "bash", "skill"]

function convertCustomModePermissions(groups: LegacyCustomMode["groups"]): PermissionConfig {
  const permission: Record<string, unknown> = {}
  const allowed = new Set<string>()

  for (const group of groups) {
    const groupName = typeof group === "string" ? group : group[0]
    const groupConfig = typeof group === "string" ? undefined : group[1]
    const permKey = GROUP_TO_PERMISSION[groupName] ?? groupName
    allowed.add(permKey)

    const newValue = groupConfig?.fileRegex ? { [groupConfig.fileRegex]: "allow", "*": "deny" } : "allow"

    // Multiple legacy groups can map to the same permission key (browser + command → bash).
    // Merge rules so neither overwrites the other:
    //   - if either side is "allow", the key is fully allowed
    //   - if both sides are objects, merge their pattern maps
    const existing = permission[permKey]
    if (existing === undefined) {
      permission[permKey] = newValue
    } else if (existing === "allow" || newValue === "allow") {
      permission[permKey] = "allow"
    } else if (typeof existing === "object" && typeof newValue === "object") {
      permission[permKey] = { ...existing, ...newValue }
    } else {
      permission[permKey] = newValue
    }
  }

  // Explicitly deny permissions not in the groups (CLI defaults to "ask" for missing ones)
  for (const perm of ALL_MODE_PERMISSIONS) {
    if (!allowed.has(perm)) {
      permission[perm] = "deny"
    }
  }

  return permission as PermissionConfig
}

function convertCustomMode(mode: LegacyCustomMode): AgentConfig {
  const parts = [mode.roleDefinition]
  if (mode.customInstructions?.trim()) {
    parts.push(
      [
        "USER'S CUSTOM INSTRUCTIONS",
        "",
        "The following additional instructions are provided by the user, and should be followed to the best of your ability.",
        "",
        `Mode-specific Instructions:\n${mode.customInstructions.trim()}`,
      ].join("\n"),
    )
  }
  return {
    mode: "primary",
    description: mode.description ?? mode.whenToUse ?? mode.roleDefinition?.slice(0, 120),
    prompt: parts.filter(Boolean).join("\n\n"),
    permission: convertCustomModePermissions(mode.groups),
  }
}

// ---------------------------------------------------------------------------
// Internal — OAuth credential helpers
// ---------------------------------------------------------------------------

/**
 * Reads OAuth credentials stored in a separate VS Code secret (e.g. openai-codex-oauth-credentials).
 * Returns the fields needed by the CLI's Auth.Oauth type, or null if absent/malformed.
 */
async function readOAuthCredentials(
  context: vscode.ExtensionContext,
  secretKey: string,
): Promise<{ access: string; refresh: string; expires: number; accountId?: string } | null> {
  const raw = await context.secrets.get(secretKey)
  if (!raw) return null
  const parsed = (() => {
    try {
      return JSON.parse(raw) as Record<string, unknown>
    } catch (err) {
      console.debug("[Strata] migration: OAuth JSON parse failed:", err)
      return null
    }
  })()
  if (!parsed) return null
  const access = parsed.access_token as string | undefined
  const refresh = parsed.refresh_token as string | undefined
  const expires = parsed.expires as number | undefined
  if (!access || !refresh || expires === undefined) return null
  return { access, refresh, expires, accountId: parsed.accountId as string | undefined }
}

// ---------------------------------------------------------------------------
// Internal — reading legacy data from storage
// ---------------------------------------------------------------------------

async function readLegacyProviderProfiles(context: vscode.ExtensionContext): Promise<LegacyProviderProfiles | null> {
  const raw = await context.secrets.get(SECRET_KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    if (!parsed.apiConfigs || typeof parsed.apiConfigs !== "object") return null
    return parsed as unknown as LegacyProviderProfiles
  } catch (err) {
    console.debug("[Strata] migration: provider profiles JSON parse failed:", err)
    return null
  }
}

async function readLegacyMcpSettings(context: vscode.ExtensionContext): Promise<LegacyMcpSettings | null> {
  const filePath = vscode.Uri.joinPath(context.globalStorageUri, "settings", "mcp_settings.json")
  const bytes = await vscode.workspace.fs.readFile(filePath).then(
    (b) => b,
    () => null,
  )
  if (!bytes) return null
  try {
    const parsed = JSON.parse(Buffer.from(bytes).toString("utf8")) as Record<string, unknown>
    if (!parsed.mcpServers || typeof parsed.mcpServers !== "object") return null
    return parsed as unknown as LegacyMcpSettings
  } catch (err) {
    console.debug("[Strata] migration: MCP settings JSON parse failed:", err)
    return null
  }
}

async function readLegacyCustomModes(context: vscode.ExtensionContext): Promise<LegacyCustomMode[] | null> {
  const filePath = vscode.Uri.joinPath(context.globalStorageUri, "settings", "custom_modes.yaml")
  const bytes = await vscode.workspace.fs.readFile(filePath).then(
    (b) => b,
    () => null,
  )
  if (!bytes) return null
  const text = Buffer.from(bytes).toString("utf8")
  return parseCustomModesYaml(text)
}

function readLegacyCustomModePrompts(context: vscode.ExtensionContext): Record<string, LegacyPromptComponent> | null {
  return context.globalState.get<Record<string, LegacyPromptComponent>>("customModePrompts") ?? null
}

function readLegacySettings(context: vscode.ExtensionContext): LegacySettings {
  const raw = context.globalState.get<Record<string, unknown>>("ghostServiceSettings")
  const autocomplete: LegacyAutocompleteSettings | undefined =
    raw && typeof raw === "object"
      ? {
          enableAutoTrigger: raw.enableAutoTrigger as boolean | undefined,
          enableSmartInlineTaskKeybinding: raw.enableSmartInlineTaskKeybinding as boolean | undefined,
          enableChatAutocomplete: raw.enableChatAutocomplete as boolean | undefined,
        }
      : undefined

  return {
    autoApprovalEnabled: context.globalState.get<boolean>("strata-code.autoApprovalEnabled"),
    allowedCommands: context.globalState.get<string[]>("strata-code.allowedCommands"),
    deniedCommands: context.globalState.get<string[]>("strata-code.deniedCommands"),
    // Fine-grained auto-approval — stored without prefix in legacy globalState
    alwaysAllowReadOnly: context.globalState.get<boolean>("alwaysAllowReadOnly"),
    alwaysAllowReadOnlyOutsideWorkspace: context.globalState.get<boolean>("alwaysAllowReadOnlyOutsideWorkspace"),
    alwaysAllowWrite: context.globalState.get<boolean>("alwaysAllowWrite"),
    alwaysAllowExecute: context.globalState.get<boolean>("alwaysAllowExecute"),
    alwaysAllowMcp: context.globalState.get<boolean>("alwaysAllowMcp"),
    alwaysAllowModeSwitch: context.globalState.get<boolean>("alwaysAllowModeSwitch"),
    alwaysAllowSubtasks: context.globalState.get<boolean>("alwaysAllowSubtasks"),
    language: context.globalState.get<string>("strata-code.language"),
    autocomplete: hasAutocompleteData(autocomplete) ? autocomplete : undefined,
  }
}

function hasAutocompleteData(s: LegacyAutocompleteSettings | undefined): s is LegacyAutocompleteSettings {
  if (!s) return false
  return (
    s.enableAutoTrigger !== undefined ||
    s.enableSmartInlineTaskKeybinding !== undefined ||
    s.enableChatAutocomplete !== undefined
  )
}

/**
 * Minimal YAML parser for the custom_modes.yaml format.
 * Tries JSON first (some legacy versions stored JSON), then parses the simple
 * YAML structure manually to avoid a runtime dependency on a YAML library.
 */
// Strip surrounding single or double quotes from a YAML scalar value
function stripYamlQuotes(value: string): string {
  return value.replace(/^(['"])(.*)\1$/, "$2")
}

class CustomModeParser {
  modes: LegacyCustomMode[] = []
  inModes = false
  current: Partial<LegacyCustomMode> | null = null
  blockField: "roleDefinition" | "customInstructions" | null = null
  inGroups = false
  blockLines: string[] = []

  flush() {
    if (this.current?.slug && this.current?.name) {
      if (this.blockField && this.blockLines.length > 0) {
        this.current[this.blockField] = this.blockLines.join("\n").trim()
      }
      this.modes.push({ groups: [], ...this.current } as LegacyCustomMode)
    }
    this.current = null
    this.blockField = null
    this.inGroups = false
    this.blockLines = []
  }

  parseLine(rawLine: string) {
    if (!this.inModes) {
      if (rawLine.trim() === "customModes:") this.inModes = true
      return
    }

    if (/^  - slug: /.test(rawLine)) {
      this.flush()
      this.current = { slug: stripYamlQuotes(rawLine.replace(/^  - slug: /, "").trim()), groups: [] }
      return
    }

    if (!this.current) return
    this.parseCurrentLine(rawLine)
  }

  private parseCurrentLine(rawLine: string) {
    if (this.parseScalarFields(rawLine)) return
    this.parseBlockAndGroups(rawLine)
  }

  private parseScalarFields(rawLine: string): boolean {
    if (!this.current) return false

    if (/^    name: /.test(rawLine)) {
      this.current.name = stripYamlQuotes(rawLine.replace(/^    name: /, "").trim())
      return true
    }

    // Block scalar fields (roleDefinition, customInstructions) with | or >
    const blockMatch = rawLine.match(/^    (roleDefinition|customInstructions): [|>]/)
    if (blockMatch) {
      if (this.blockField && this.blockLines.length > 0) {
        this.current[this.blockField] = this.blockLines.join("\n").trim()
      }
      this.blockField = blockMatch[1] as "roleDefinition" | "customInstructions"
      this.inGroups = false
      this.blockLines = []
      return true
    }

    // Single-line scalar fields
    if (/^    roleDefinition: /.test(rawLine) && !this.blockField) {
      this.current.roleDefinition = stripYamlQuotes(rawLine.replace(/^    roleDefinition: /, "").trim())
      return true
    }

    if (/^    customInstructions: /.test(rawLine) && !this.blockField) {
      this.current.customInstructions = stripYamlQuotes(rawLine.replace(/^    customInstructions: /, "").trim())
      return true
    }

    if (/^    whenToUse: /.test(rawLine) && !this.blockField) {
      this.current.whenToUse = stripYamlQuotes(rawLine.replace(/^    whenToUse: /, "").trim())
      return true
    }

    if (/^    description: /.test(rawLine) && !this.blockField) {
      this.current.description = stripYamlQuotes(rawLine.replace(/^    description: /, "").trim())
      return true
    }
    return false
  }

  private parseBlockAndGroups(rawLine: string): void {
    if (!this.current) return

    if (this.blockField) {
      if (/^      /.test(rawLine)) {
        this.blockLines.push(rawLine.replace(/^      /, ""))
        return
      }
      this.current[this.blockField] = this.blockLines.join("\n").trim()
      this.blockField = null
      this.blockLines = []
    }

    if (/^    groups:/.test(rawLine)) {
      this.inGroups = true
      this.current.groups = []
      return
    }

    if (this.inGroups && /^      - /.test(rawLine)) {
      const group = stripYamlQuotes(rawLine.replace(/^      - /, "").trim())
      this.current.groups = [...(this.current.groups ?? []), group]
      return
    }

    if (this.inGroups && !/^      /.test(rawLine)) {
      this.inGroups = false
    }
  }
}

function parseCustomModesYaml(text: string): LegacyCustomMode[] | null {
  // Try JSON first
  const jsonResult = (() => {
    try {
      const parsed = JSON.parse(text) as { customModes?: LegacyCustomMode[] }
      return parsed.customModes ?? null
    } catch (err) {
      console.debug("[Strata] migration: custom modes JSON parse failed:", err)
      return null
    }
  })()
  if (jsonResult) return jsonResult

  const parser = new CustomModeParser()
  const lines = text.split("\n")
  for (const rawLine of lines) {
    parser.parseLine(rawLine)
  }
  parser.flush()
  return parser.modes.length > 0 ? parser.modes : null
}

// ---------------------------------------------------------------------------
// Internal — building display lists for the wizard
// ---------------------------------------------------------------------------

function buildProviderList(
  profiles: LegacyProviderProfiles | null,
  oauthProviders: Set<string>,
): MigrationProviderInfo[] {
  if (!profiles?.apiConfigs) return []

  return Object.entries(profiles.apiConfigs).map(([profileName, settings]) => {
    const provider = settings.apiProvider ?? "unknown"
    const mapping = PROVIDER_MAP[provider]
    const unsupported = UNSUPPORTED_PROVIDERS.has(provider)

    const modelField = mapping?.modelField ?? "apiModelId"
    const model = settings[modelField] as string | undefined

    const hasApiKey = mapping?.oauthSecretKey
      ? oauthProviders.has(provider)
      : mapping?.skipAuth
        ? (mapping.configFields?.some((f) => Boolean(settings[f.from])) ?? false)
        : mapping
          ? Boolean(settings[mapping.key])
          : false

    return {
      profileName,
      provider,
      model,
      hasApiKey,
      supported: Boolean(mapping) && !unsupported,
      newProviderName: mapping?.name,
    }
  })
}

function buildMcpServerList(settings: LegacyMcpSettings | null): MigrationMcpServerInfo[] {
  if (!settings?.mcpServers) return []
  return Object.entries(settings.mcpServers).map(([name, server]) => ({
    name,
    type: server.type ?? "stdio",
    disabled: server.disabled,
  }))
}

/** @internal — exported for testing only */
export function buildCustomModeList(
  modes: LegacyCustomMode[] | null | undefined,
  prompts: Record<string, LegacyPromptComponent> | null | undefined,
): MigrationCustomModeInfo[] {
  const result: MigrationCustomModeInfo[] = []

  // Non-native custom modes (existing behavior)
  if (modes) {
    for (const m of modes) {
      if (!DEFAULT_MODE_SLUGS.has(m.slug)) {
        result.push({ name: m.name, slug: m.slug })
      }
    }
  }

  // Modified native modes — detect user modifications and offer migration under a new slug
  for (const slug of DEFAULT_MODE_SLUGS) {
    const defaults = NATIVE_MODE_DEFAULTS[slug]
    if (!defaults) continue // "build" has no legacy defaults

    const yaml = modes?.find((m) => m.slug === slug)
    const prompt = prompts?.[slug]

    if (!isNativeModeModified(yaml, prompt, defaults)) continue

    const name = yaml?.name ?? defaults.name
    result.push({ name: `${name} (Custom)`, slug: `${slug}-custom`, nativeSlug: slug })
  }

  return result
}

/**
 * Checks whether a native mode has been meaningfully modified from its defaults.
 * A full YAML override always counts as modified. For customModePrompts, we compare
 * each field against the known default and only count it if it actually differs.
 * @internal — exported for testing only
 */
export function isNativeModeModified(
  yaml: LegacyCustomMode | undefined,
  prompt: LegacyPromptComponent | undefined,
  defaults: { roleDefinition: string; customInstructions?: string; whenToUse?: string; description?: string },
): boolean {
  if (yaml) return true
  if (!prompt) return false

  if (prompt.roleDefinition && prompt.roleDefinition !== defaults.roleDefinition) return true
  if (prompt.customInstructions && prompt.customInstructions !== (defaults.customInstructions ?? "")) return true
  if (prompt.whenToUse && prompt.whenToUse !== (defaults.whenToUse ?? "")) return true
  if (prompt.description && prompt.description !== (defaults.description ?? "")) return true

  return false
}

/**
 * Builds a merged LegacyCustomMode for a modified native mode by combining the YAML
 * custom mode (if any) with customModePrompts overrides. When only prompts exist, the
 * native defaults provide the base structure (name, groups).
 * @internal — exported for testing only
 */
export function buildMergedNativeMode(
  yaml: LegacyCustomMode | undefined,
  prompt: LegacyPromptComponent | undefined,
  slug: string,
): LegacyCustomMode | null {
  const defaults = NATIVE_MODE_DEFAULTS[slug]
  if (!defaults) return null

  const base: LegacyCustomMode = yaml
    ? { ...yaml }
    : {
        slug,
        name: defaults.name,
        roleDefinition: defaults.roleDefinition,
        customInstructions: defaults.customInstructions,
        whenToUse: defaults.whenToUse,
        description: defaults.description,
        groups: [...defaults.groups],
      }

  // Overlay customModePrompts on top (matching legacy runtime behavior)
  if (prompt) {
    if (prompt.roleDefinition) base.roleDefinition = prompt.roleDefinition
    if (prompt.customInstructions) base.customInstructions = prompt.customInstructions
    if (prompt.whenToUse) base.whenToUse = prompt.whenToUse
    if (prompt.description) base.description = prompt.description
  }

  return base
}

function resolveDefaultModel(
  profiles: LegacyProviderProfiles | null,
  oauthProviders: Set<string>,
): { provider: string; model: string } | undefined {
  if (!profiles?.currentApiConfigName) return undefined
  const active = profiles.apiConfigs[profiles.currentApiConfigName]
  if (!active?.apiProvider) return undefined
  const mapping = PROVIDER_MAP[active.apiProvider]
  if (!mapping) return undefined
  // If the active profile requires OAuth credentials (e.g. openai-codex) but they are
  // unavailable, do not offer default-model migration — it would write a broken reference.
  if (mapping.oauthSecretKey && !oauthProviders.has(active.apiProvider)) return undefined
  const modelField = mapping.modelField ?? "apiModelId"
  const model = active[modelField] as string | undefined
  if (!model) return undefined
  return { provider: mapping.name, model }
}
