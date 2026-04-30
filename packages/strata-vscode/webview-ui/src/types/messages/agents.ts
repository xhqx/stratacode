import type { PermissionConfig, PermissionRuleItem } from "./permissions"

// Skill info from CLI backend
export interface SkillInfo {
  name: string
  description: string
  location: string
}

// Slash command info from CLI backend
export interface SlashCommandInfo {
  name: string
  description?: string
  source?: "command" | "mcp" | "skill"
  hints: string[]
}

// Agent/mode info from CLI backend
export interface AgentInfo {
  name: string
  displayName?: string
  description?: string
  mode: "subagent" | "primary" | "all"
  native?: boolean
  hidden?: boolean
  deprecated?: boolean
  color?: string
  permission?: PermissionRuleItem[]
}

export interface AgentConfig {
  model?: string | null
  prompt?: string
  description?: string
  mode?: "subagent" | "primary" | "all"
  hidden?: boolean
  disable?: boolean
  temperature?: number
  top_p?: number
  steps?: number
  permission?: PermissionConfig
  fallback_models?: string[] | null

  model_pool?: {
    enabled?: boolean
    models?: string[]
    max_concurrent?: number
    timeout?: number
  } | null

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
}
