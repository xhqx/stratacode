// ============================================================================
// Plugin
// ============================================================================
export { StrataAuthPlugin, default } from "./plugin.js"

// ============================================================================
// Provider
// ============================================================================
export { createStrata } from "./provider.js"
export { createStrataDebug } from "./provider-debug.js"
export { strataCustomLoader } from "./loader.js"
export {
  buildStrataHeaders,
  getEditorNameHeader,
  getFeatureHeader,
  getDefaultHeaders,
  getUserAgent,
} from "./headers.js"

// ============================================================================
// Auth
// ============================================================================
export { authenticateWithDeviceAuth } from "./auth/device-auth.js"
export { authenticateWithDeviceAuthTUI } from "./auth/device-auth-tui.js"
export { getStrataUrlFromToken, isValidStratacodeToken, getApiKey } from "./auth/token.js"
export { poll, formatTimeRemaining } from "./auth/polling.js"
export { migrateLegacyStrataAuth, LEGACY_CONFIG_PATH } from "./auth/legacy-migration.js"

// ============================================================================
// API
// ============================================================================
export {
  fetchProfile,
  fetchBalance,
  fetchProfileWithBalance,
  fetchDefaultModel,
  getStrataProfile,
  getStrataBalance,
  getStrataDefaultModel,
  promptOrganizationSelection,
} from "./api/profile.js"
export { fetchStrataModels } from "./api/models.js"
export {
  fetchOrganizationModes,
  clearModesCache,
  type OrganizationMode,
  type OrganizationModeConfig,
} from "./api/modes.js"
export { fetchStratacodeNotifications, type StratacodeNotification } from "./api/notifications.js"

// ============================================================================
// Server Routes (optional - requires hono and OpenCode dependencies)
// ============================================================================
export { createStrataRoutes } from "./server/routes.js"

// ============================================================================
// Note: TUI exports moved to separate entry point
// ============================================================================
// For TUI components and commands, import from "@stratacode/strata-gateway/tui"
// This avoids circular dependencies with opencode TUI infrastructure

// ============================================================================
// Types
// ============================================================================
export type {
  // Auth types
  DeviceAuthInitiateResponse,
  DeviceAuthPollResponse,
  Organization,
  StratacodeProfile,
  StratacodeBalance,
  PollOptions,
  PollResult,
  // Provider types
  StrataProvider,
  StrataProviderOptions,
  StrataMetadata,
  CustomLoaderResult,
  ProviderInfo,
  LanguageModelV3,
} from "./types.js"

// ============================================================================
// Constants
// ============================================================================
export {
  ENV_STRATA_API_URL,
  DEFAULT_STRATA_API_URL,
  STRATA_API_BASE,
  STRATA_OPENROUTER_BASE,
  POLL_INTERVAL_MS,
  DEFAULT_MODEL,
  DEFAULT_FREE_MODEL,
  TOKEN_EXPIRATION_MS,
  USER_AGENT_BASE,
  CONTENT_TYPE,
  DEFAULT_PROVIDER_NAME,
  ANONYMOUS_API_KEY,
  MODELS_FETCH_TIMEOUT_MS,
  HEADER_ORGANIZATIONID,
  HEADER_TASKID,
  HEADER_PROJECTID,
  HEADER_TESTER,
  HEADER_EDITORNAME,
  HEADER_MACHINEID,
  HEADER_FEATURE,
  DEFAULT_EDITOR_NAME,
  ENV_EDITOR_NAME,
  ENV_VERSION,
  TESTER_SUPPRESS_VALUE,
  ENV_FEATURE,
  PROMPTS,
  AI_SDK_PROVIDERS,
} from "./api/constants.js"
