import type { PermissionConfig } from "./permissions"
import type { AgentConfig } from "./agents"
import type { ProviderConfig } from "./providers"

type SdkIndexingStatus = import("@stratacode/sdk/v2/client").IndexingStatus

export interface AcpProviderConfig {
  command?: string | string[]
  env?: Record<string, string>
  cwd?: string
  transport?: "stdio" | "http"
  url?: string
  trusted?: boolean
  model?: string
  enabled?: boolean
  predefined?: boolean
}

export interface McpConfig {
  type?: "local" | "remote"
  command?: string[] | string
  args?: string[]
  env?: Record<string, string>
  environment?: Record<string, string>
  url?: string
  headers?: Record<string, string>
  enabled?: boolean
}

export interface CommandConfig {
  template: string
  description?: string
  agent?: string
  model?: string
  subtask?: boolean
}

export interface SkillsConfig {
  paths?: string[]
  urls?: string[]
}

export interface CompactionConfig {
  auto?: boolean
  prune?: boolean
  threshold_percent?: number
}

export interface WatcherConfig {
  ignore?: string[]
}

export interface ExperimentalConfig {
  disable_paste_summary?: boolean
  batch_tool?: boolean
  semantic_indexing?: boolean
  codebase_search?: boolean
  primary_tools?: string[]
  continue_loop_on_deny?: boolean
  mcp_timeout?: number
  auto_improve_prompts?: boolean
}

export interface CommitMessageConfig {
  prompt?: string
  model?: string | null
  format?: "conventional" | "simple" | "gitmoji"
}

export type IndexingProvider =
  | "openai"
  | "ollama"
  | "openai-compatible"
  | "gemini"
  | "mistral"
  | "vercel-ai-gateway"
  | "bedrock"
  | "openrouter"
  | "voyage"

export interface IndexingConfig {
  enabled?: boolean
  provider?: IndexingProvider
  model?: string
  dimension?: number
  vectorStore?: "lancedb" | "qdrant"
  openai?: { apiKey?: string }
  ollama?: { baseUrl?: string }
  "openai-compatible"?: { baseUrl?: string; apiKey?: string }
  gemini?: { apiKey?: string }
  mistral?: { apiKey?: string }
  "vercel-ai-gateway"?: { apiKey?: string }
  bedrock?: { region?: string; profile?: string }
  openrouter?: { apiKey?: string; specificProvider?: string }
  voyage?: { apiKey?: string }
  qdrant?: { url?: string; apiKey?: string }
  lancedb?: { directory?: string }
  searchMinScore?: number
  searchMaxResults?: number
  embeddingBatchSize?: number
  scannerMaxBatchRetries?: number
}

export type IndexingStatus = SdkIndexingStatus

export interface BrowserSettings {
  enabled: boolean
  useSystemChrome: boolean
  headless: boolean
}

export interface Config {
  permission?: PermissionConfig
  model?: string | null
  small_model?: string | null
  default_agent?: string
  agent?: Record<string, AgentConfig>
  provider?: Record<string, ProviderConfig>
  disabled_providers?: string[]
  enabled_providers?: string[]
  mcp?: Record<string, McpConfig>
  acp_providers?: Record<string, AcpProviderConfig>
  acp_agents?: Record<string, AcpProviderConfig>
  command?: Record<string, CommandConfig>
  instructions?: string[]
  skills?: SkillsConfig
  snapshot?: boolean
  remote_control?: boolean
  share?: "manual" | "auto" | "disabled"
  username?: string
  watcher?: WatcherConfig
  formatter?: false | Record<string, unknown>
  lsp?: false | Record<string, unknown>
  compaction?: CompactionConfig
  commit_message?: CommitMessageConfig
  tools?: Record<string, boolean>
  layout?: "auto" | "stretch"
  experimental?: ExperimentalConfig
  indexing?: IndexingConfig

  auto_approve?: {
    timeout?: number
    question_timeout?: number
  } | null

  retry?: {
    enabled?: boolean
    limit?: number
    delay?: number
    max_delay?: number
  } | null

  repomap?: {
    budget?: number
  } | null

  project_memory?: {
    enabled?: boolean
    max_commits?: number
  } | null
}

export interface FeatureFlags {
  indexing: boolean
}

export type ExtensionFeatureFlags = Record<
  Extract<keyof typeof import("../../../../src/stratacode/feature-manifest").MANIFEST, string>,
  boolean
>
