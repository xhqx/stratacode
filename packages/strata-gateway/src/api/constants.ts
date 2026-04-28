/**
 * Strata Gateway Configuration Constants
 * Centralized configuration for all API endpoints, headers, and settings
 */

/** Environment variable for custom Strata API URL */
export const ENV_STRATA_API_URL = "STRATA_API_URL"

/** Default Strata API URL */
export const DEFAULT_STRATA_API_URL = "https://api.strata.ai"

/** Base URL for Strata API - can be overridden by STRATA_API_URL env var */
export const STRATA_API_BASE = process.env[ENV_STRATA_API_URL] || DEFAULT_STRATA_API_URL

/** Default base URL for OpenRouter-compatible endpoint */
export const STRATA_OPENROUTER_BASE = `${STRATA_API_BASE}/api/openrouter`

/** Device auth polling interval in milliseconds */
export const POLL_INTERVAL_MS = 3000

/** Default model for authenticated users */
export const DEFAULT_MODEL = "strata-auto/balanced"

/** Default model for anonymous/free usage */
export const DEFAULT_FREE_MODEL = "strata-auto/free"

/** Token expiration duration in milliseconds (1 year) */
export const TOKEN_EXPIRATION_MS = 365 * 24 * 60 * 60 * 1000

/** User-Agent header base value for requests */
export const USER_AGENT_BASE = "opencode-strata-provider"

/** Content-Type header value for requests */
export const CONTENT_TYPE = "application/json"

/** Default provider name */
export const DEFAULT_PROVIDER_NAME = "strata"

/** Default API key for anonymous requests */
export const ANONYMOUS_API_KEY = "anonymous"

/** Fetch timeout for model requests in milliseconds (10 seconds) */
export const MODELS_FETCH_TIMEOUT_MS = 10 * 1000

/**
 * Header constants for StrataCode API requests
 */
export const HEADER_ORGANIZATIONID = "X-STRATACODE-ORGANIZATIONID"
export const HEADER_TASKID = "X-STRATACODE-TASKID"
export const HEADER_PROJECTID = "X-STRATACODE-PROJECTID"
export const HEADER_TESTER = "X-STRATACODE-TESTER"
export const HEADER_EDITORNAME = "X-STRATACODE-EDITORNAME"
export const HEADER_MACHINEID = "X-STRATACODE-MACHINEID"

/** Default editor name value */
export const DEFAULT_EDITOR_NAME = "Strata CLI"

/** Environment variable name for custom editor name */
export const ENV_EDITOR_NAME = "STRATACODE_EDITOR_NAME"

/** Environment variable name for version (set by CLI at startup) */
export const ENV_VERSION = "STRATACODE_VERSION"

/** Tester header value for suppressing warnings */
export const TESTER_SUPPRESS_VALUE = "SUPPRESS"

/** Header name for feature tracking */
export const HEADER_FEATURE = "X-STRATACODE-FEATURE"

/** Environment variable name for feature override */
export const ENV_FEATURE = "STRATACODE_FEATURE"

export const PROMPTS = ["codex", "gemini", "beast", "anthropic", "trinity", "anthropic_without_todo", "ling"] as const

export const AI_SDK_PROVIDERS = ["alibaba", "anthropic", "openai", "openai-compatible", "openrouter"] as const
