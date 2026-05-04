// stratacode_change - new file
export interface FeatureSpec {
  /** Default enabled state — drives package.json, feature-defaults, and webview */
  default: boolean
  /** Human-readable label for the settings UI */
  label: string
  /** Short description */
  description: string
  /** Icon name from strata-ui icon set */
  icon: string
  /** Lifecycle: "runtime" = can toggle live; "reload" = needs window reload */
  lifecycle: "runtime" | "reload"
  /** Parent feature ID — child is disabled when parent is off */
  requires?: string
  /** Agent names gated by this feature (hidden when OFF) */
  agents?: string[]
  /** Agents force-shown when ON */
  pinned?: string[]
  /** Tool/group-member IDs hidden when OFF */
  tools?: string[]
  /** Policy group — features in a group can be bulk-disabled by env var */
  policy?: "cloud"
  /** If true, this feature does not appear in the Features settings tab */
  hidden?: boolean
}

export const MANIFEST = {
  acpAgents: {
    default: true,
    label: "ACP Agents",
    description: "Enable Agent Communication Protocol agents integration.",
    icon: "mcp",
    lifecycle: "runtime",
  },
  agentManager: {
    default: true,
    label: "Agent Manager",
    description: "Enable the multi-session Agent Manager panel with git worktree isolation.",
    icon: "layout-left",
    lifecycle: "reload",
  },
  autoApprove: {
    default: true,
    label: "Auto-Approve",
    description: "Configure auto-approve timeouts and per-tool permission rules.",
    icon: "shield",
    lifecycle: "runtime",
  },
  autocomplete: {
    default: true,
    label: "Autocomplete",
    description: "Enable all autocomplete features (inline completions, chat autocomplete, task suggestions). Disabling requires a window reload.",
    icon: "keyboard",
    lifecycle: "reload",
    agents: ["autocomplete"],
    pinned: ["autocomplete"],
  },
  autoretries: {
    default: true,
    label: "Auto-Retries",
    description: "Enable automatic retry logic for failed AI requests with exponential backoff.",
    icon: "reset",
    lifecycle: "runtime",
  },
  batchTool: {
    default: false,
    label: "Batch Tool",
    description: "Enable the experimental batch tool for agents.",
    icon: "layers",
    lifecycle: "runtime",
  },
  browserAutomation: {
    default: false,
    label: "Browser Automation",
    description: "Enable AI browser tools for UI testing and navigation. Disabling requires a window reload.",
    icon: "window-cursor",
    lifecycle: "reload",
  },
  checkpoints: {
    default: true,
    label: "Checkpoints",
    description: "Enable git-based checkpoints for tracking and reverting AI changes.",
    icon: "branch",
    lifecycle: "runtime",
  },
  cloudSessions: {
    default: false,
    label: "Cloud Sessions",
    description: "Enable cloud session syncing and sharing.",
    icon: "cloud",
    lifecycle: "runtime",
    requires: "strataAuth",
    policy: "cloud",
    hidden: true,
  },
  codeActions: {
    default: true,
    label: "Code Actions",
    description: "Enable AI-powered Quick Fixes and code actions in the editor. Disabling requires a window reload.",
    icon: "edit",
    lifecycle: "reload",
  },
  codebaseSearch: {
    default: false,
    label: "Codebase Search",
    description: "Enable semantic codebase search capability.",
    icon: "magnifying-glass",
    lifecycle: "runtime",
    tools: ["codesearch"],
  },
  commitMessage: {
    default: true,
    label: "Commit Message",
    description: "Enable AI-generated commit messages in the Source Control panel. Disabling requires a window reload.",
    icon: "pencil-line",
    lifecycle: "reload",
    agents: ["commit"],
    pinned: ["commit"],
  },
  compaction: {
    default: true,
    label: "Compaction",
    description: "Enable automatic context compaction for long sessions.",
    icon: "compress",
    lifecycle: "runtime",
  },
  diffViewer: {
    default: true,
    label: "Diff Viewer",
    description: "Enable the Changes tab, AI explain commands, and diff viewer panel. Disabling requires a window reload.",
    icon: "review",
    lifecycle: "reload",
  },
  documentDrivenTasks: {
    default: false,
    label: "Document-Driven Tasks",
    description: "Enable document-driven task execution from markdown plans and specs.",
    icon: "checklist",
    lifecycle: "runtime",
    tools: ["task", "todoread", "todowrite"],
  },
  explainer: {
    default: true,
    label: "Explainer",
    description: "Enable the standalone AI explainer for code selection and symbol explanations.",
    icon: "brain",
    lifecycle: "runtime",
    agents: ["explainer"],
  },
  formatter: {
    default: true,
    label: "AI Formatter",
    description: "Use the AI formatter to automatically apply changes after code generation.",
    icon: "edit-small-2",
    lifecycle: "runtime",
  },
  kanban: {
    default: false,
    label: "Kanban",
    description: "Enable the Kanban task board for tracking AI-generated tasks.",
    icon: "task",
    lifecycle: "reload",
    tools: ["task", "todoread", "todowrite"],
  },
  lsp: {
    default: true,
    label: "LSP",
    description: "Enable Language Server Protocol integration for diagnostics and code intelligence.",
    icon: "circuit-board",
    lifecycle: "runtime",
    tools: ["lsp"],
  },
  notifications: {
    default: true,
    label: "Notifications",
    description: "Enable in-app notification center for agent activity and system events.",
    icon: "bubble-5",
    lifecycle: "runtime",
    policy: "cloud",
  },
  pasteSummary: {
    default: true,
    label: "Paste Summary",
    description: "Enable experimental paste summarization.",
    icon: "copy",
    lifecycle: "runtime",
  },
  planningMode: {
    default: false,
    label: "Planning Mode",
    description: "Enable planning mode for structured multi-step task orchestration.",
    icon: "bullet-list",
    lifecycle: "runtime",
  },
  projectMemory: {
    default: true,
    label: "Project Memory",
    description: "Enable project memory for persisting context across sessions.",
    icon: "folder",
    lifecycle: "runtime",
  },
  promptAutocomplete: {
    default: true,
    label: "Prompt Autocomplete",
    description: "Enable AI-powered autocomplete suggestions in the chat input.",
    icon: "prompt",
    lifecycle: "runtime",
  },
  promptEnhancer: {
    default: true,
    label: "Prompt Enhancer",
    description: "Enable the prompt enhancer to refine and improve user prompts before sending.",
    icon: "sliders",
    lifecycle: "runtime",
    agents: ["enhance"],
  },
  promptEnhancerSuggestions: {
    default: true,
    label: "Prompt Enhancer Suggestions",
    description: "Show inline suggestions from the prompt enhancer as you type.",
    icon: "eye",
    lifecycle: "runtime",
    requires: "promptEnhancer",
  },
  remoteControl: {
    default: false,
    label: "Remote Control",
    description: "Enable remote control API for external tool integration.",
    icon: "console",
    lifecycle: "runtime",
    policy: "cloud",
  },
  selectionTip: {
    default: true,
    label: "Selection Tip",
    description: "Show a tip when you select code to explain or use code actions.",
    icon: "glasses",
    lifecycle: "runtime",
  },
  sessionSharing: {
    default: false,
    label: "Session Sharing",
    description: "Enable sharing sessions.",
    icon: "share",
    lifecycle: "runtime",
    requires: "strataAuth",
    policy: "cloud",
    hidden: true,
  },
  strataAuth: {
    default: false,
    label: "Strata Auth",
    description: "Enable Strata authentication and cloud account features.",
    icon: "user",
    lifecycle: "runtime",
    policy: "cloud",
    hidden: true,
  },
  taskTimeline: {
    default: true,
    label: "Task Timeline",
    description: "Show the task timeline view in the sidebar.",
    icon: "file-tree",
    lifecycle: "runtime",
  },
  workers: {
    default: false,
    label: "Workers",
    description: "Enable background context workers. Configure in your project's strata.jsonc file under the workers key.",
    icon: "providers",
    lifecycle: "reload",
  },
} as const satisfies Record<string, Omit<FeatureSpec, "default" | "lifecycle"> & { default: boolean; lifecycle: "runtime" | "reload" }>

