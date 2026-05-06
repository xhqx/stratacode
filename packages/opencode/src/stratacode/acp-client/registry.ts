// stratacode_change - new file
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
  },
  gemini: {
    name: "Gemini",
    description: "Google Gemini models via ACP",
    icon: "gemini",
    command: ["npx", "-y", "@google/gemini-cli", "--acp"],
    localBin: "gemini",
    localArgs: ["--acp"],
    env: [],
  },
  claude: {
    name: "Claude",
    description: "Anthropic Claude models via ACP",
    icon: "anthropic",
    command: ["npx", "-y", "@agentclientprotocol/claude-agent-acp"],
    env: [],
  },
  codex: {
    name: "Codex",
    description: "OpenAI Codex models via ACP",
    icon: "openai",
    command: ["npx", "-y", "@zed-industries/codex-acp"],
    env: [],
  },
}
