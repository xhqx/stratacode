// stratacode_change - new file
export interface ProviderModel {
  id: string
  name: string
  description?: string
}

export interface PredefinedProvider {
  name: string
  description: string
  icon: string
  /** Primary command — used when localBin is not found on $PATH. */
  command: string[]
  /**
   * Optional local binary name to check via `which` before falling back to
   * the npx-based `command`.  When present AND found on $PATH, the spawn uses
   * `[localBin, ...localArgs]` instead of `command`.
   */
  localBin?: string
  /** Extra args appended after localBin when the local binary is used. */
  localArgs?: string[]
  env: string[]
  models: ProviderModel[]
  default: string
}

export const PREDEFINED: Record<string, PredefinedProvider> = {
  opencode: {
    name: "OpenCode",
    description: "OpenCode AI agent via ACP",
    icon: "robot",
    command: ["opencode", "acp", "--pure"],
    localBin: "opencode",
    localArgs: ["acp", "--pure"],
    env: [],
    models: [{ id: "default", name: "Default" }],
    default: "default",
  },
  gemini: {
    name: "Gemini",
    description: "Google Gemini models via ACP",
    icon: "gemini",
    command: ["npx", "-y", "@google/gemini-cli", "--acp"],
    localBin: "gemini",
    localArgs: ["--acp"],
    env: [],
    models: [
      { id: "auto-gemini-3", name: "Auto (Gemini 3)", description: "Auto-selects best model" },
      { id: "auto-gemini-2.5", name: "Auto (Gemini 2.5)", description: "Auto-selects best 2.5 model" },
      { id: "gemini-3.1-pro-preview", name: "Gemini 3.1 Pro" },
      { id: "gemini-3-flash-preview", name: "Gemini 3 Flash" },
      { id: "gemini-3.1-flash-lite-preview", name: "Gemini 3.1 Flash Lite" },
      { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro" },
      { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash" },
      { id: "gemini-2.5-flash-lite", name: "Gemini 2.5 Flash Lite" },
    ],
    default: "auto-gemini-3",
  },
  claude: {
    name: "Claude",
    description: "Anthropic Claude models via ACP",
    icon: "anthropic",
    command: ["npx", "-y", "@agentclientprotocol/claude-agent-acp"],
    env: [],
    models: [
      { id: "claude-sonnet-4", name: "Claude Sonnet 4" },
      { id: "claude-opus-4", name: "Claude Opus 4", description: "Most capable" },
    ],
    default: "claude-sonnet-4",
  },
  codex: {
    name: "Codex",
    description: "OpenAI Codex models via ACP",
    icon: "openai",
    command: ["npx", "-y", "@zed-industries/codex-acp"],
    env: [],
    models: [{ id: "codex-mini", name: "Codex Mini" }],
    default: "codex-mini",
  },
}
