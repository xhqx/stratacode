import { Component } from "solid-js"
import { IconProps } from "@stratacode/strata-ui/icon"
import type { ExtensionFeatureFlags } from "../../types/messages/config"

import AcpAgentsTab from "./AcpAgentsTab"
import AgentManagerTab from "./AgentManagerTab"
import AutoApproveSettingsTab from "./AutoApproveSettingsTab"
import AutocompleteTab from "./AutocompleteTab"
import BackgroundWorkersTab from "./BackgroundWorkersTab"
import BrowserTab from "./BrowserTab"
import CheckpointsTab from "./CheckpointsTab"
import CodeActionsTab from "./CodeActionsTab"
import CommitMessageTab from "./CommitMessageTab"
import CompactionTab from "./CompactionTab"
import DiffViewerTab from "./DiffViewerTab"
import DocumentDrivenTasksTab from "./DocumentDrivenTasksTab"
import ExplainerTab from "./ExplainerTab"
import KanbanTab from "./KanbanTab"
import LspTab from "./LspTab"
import NotificationsTab from "./NotificationsTab"
import PasteSummaryTab from "./PasteSummaryTab"
import ProjectMemoryTab from "./ProjectMemoryTab"
import RemoteControlTab from "./RemoteControlTab"
import RetriesTab from "./RetriesTab"
import SessionSharingTab from "./SessionSharingTab"

export interface FeatureDefinition {
  key: keyof ExtensionFeatureFlags
  label: string
  description: string
  icon: IconProps["name"]
  component?: Component
  agents?: string[] // Agent names gated by this feature (hidden when OFF)
  pinned?: string[] // Agents force-shown when this feature is ON
  tools?: string[] // Tool/group-member IDs hidden when this feature is OFF
  requires?: keyof ExtensionFeatureFlags // Parent feature that must be ON for this one to be enabled
}

export type ResolvableFeatureDefinition = Omit<FeatureDefinition, "label" | "description"> & {
  label: (t: (key: string) => string) => string
  description: (t: (key: string) => string) => string
}

export const FEATURES: ResolvableFeatureDefinition[] = [
  {
    key: "acpAgents",
    label: () => "ACP Agents",
    description: () => "Enable Agent Communication Protocol agents integration.",
    icon: "mcp",
    component: AcpAgentsTab,
  },
  {
    key: "agentManager",
    label: () => "Agent Manager",
    description: () => "Enable the multi-session Agent Manager panel with git worktree isolation.",
    icon: "layout-left",
    component: AgentManagerTab,
  },
  {
    key: "autoApprove",
    label: () => "Auto-Approve",
    description: () => "Configure auto-approve timeouts and per-tool permission rules.",
    icon: "shield",
    component: AutoApproveSettingsTab,
  },
  {
    key: "autocomplete",
    label: () => "Autocomplete",
    description: () =>
      "Enable all autocomplete features (inline completions, chat autocomplete, task suggestions). Disabling requires a window reload.",
    icon: "keyboard",
    component: AutocompleteTab,
    agents: ["autocomplete"],
    pinned: ["autocomplete"],
  },
  {
    key: "autoretries",
    label: () => "Auto-Retries",
    description: () => "Enable automatic retry logic for failed AI requests with exponential backoff.",
    icon: "reset",
    component: RetriesTab,
  },
  {
    key: "batchTool",
    label: (t) => t("settings.experimental.batchTool.title") || "Batch Tool",
    description: (t) =>
      t("settings.experimental.batchTool.description") || "Enable the experimental batch tool for agents.",
    icon: "layers",
  },
  {
    key: "browserAutomation",
    label: () => "Browser Automation",
    description: () => "Enable AI browser tools for UI testing and navigation. Disabling requires a window reload.",
    icon: "window-cursor",
    component: BrowserTab,
  },
  {
    key: "checkpoints",
    label: () => "Checkpoints",
    description: () => "Enable git-based checkpoints for tracking and reverting AI changes.",
    icon: "branch",
    component: CheckpointsTab,
  },
  {
    key: "codeActions",
    label: () => "Code Actions",
    description: () =>
      "Enable AI-powered Quick Fixes and code actions in the editor. Disabling requires a window reload.",
    icon: "edit",
    component: CodeActionsTab,
  },
  {
    key: "codebaseSearch",
    label: (t) => t("settings.experimental.codebaseSearch.title") || "Codebase Search",
    description: (t) =>
      t("settings.experimental.codebaseSearch.description") || "Enable semantic codebase search capability.",
    icon: "magnifying-glass",
    tools: ["codesearch"],
  },
  {
    key: "commitMessage",
    label: () => "Commit Message",
    description: () =>
      "Enable AI-generated commit messages in the Source Control panel. Disabling requires a window reload.",
    icon: "pencil-line",
    component: CommitMessageTab,
    agents: ["commit"],
    pinned: ["commit"],
  },
  {
    key: "compaction",
    label: () => "Compaction",
    description: () => "Enable automatic context compaction for long sessions.",
    icon: "compress",
    component: CompactionTab,
  },
  {
    key: "diffViewer",
    label: () => "Diff Viewer",
    description: () =>
      "Enable the Changes tab, AI explain commands, and diff viewer panel. Disabling requires a window reload.",
    icon: "review",
    component: DiffViewerTab,
  },
  {
    key: "documentDrivenTasks",
    label: () => "Document-Driven Tasks",
    description: () => "Enable document-driven task execution from markdown plans and specs.",
    icon: "checklist",
    component: DocumentDrivenTasksTab,
    tools: ["task", "todoread", "todowrite"],
  },
  {
    key: "explainer",
    label: () => "Explainer",
    description: () => "Enable the standalone AI explainer for code selection and symbol explanations.",
    icon: "brain" as IconProps["name"],
    component: ExplainerTab,
    agents: ["explainer"],
  },
  {
    key: "formatter",
    label: (t) => t("settings.agentBehaviour.formatter.title") || "AI Formatter",
    description: (t) =>
      t("settings.agentBehaviour.formatter.description") ||
      "Use the AI formatter to automatically apply changes after code generation.",
    icon: "edit-small-2",
  },
  {
    key: "kanban",
    label: () => "Kanban",
    description: () => "Enable the Kanban task board for tracking AI-generated tasks.",
    icon: "task",
    component: KanbanTab,
    tools: ["task", "todoread", "todowrite"],
  },
  {
    key: "lsp",
    label: () => "LSP",
    description: () => "Enable Language Server Protocol integration for diagnostics and code intelligence.",
    icon: "circuit-board",
    component: LspTab,
    tools: ["lsp"],
  },
  {
    key: "notifications",
    label: () => "Notifications",
    description: () => "Enable in-app notification center for agent activity and system events.",
    icon: "bubble-5",
    component: NotificationsTab,
  },
  {
    key: "pasteSummary",
    label: () => "Paste Summary",
    description: () => "Enable experimental paste summarization.",
    icon: "copy",
    component: PasteSummaryTab,
  },
  {
    key: "planningMode",
    label: () => "Planning Mode",
    description: () => "Enable planning mode for structured multi-step task orchestration.",
    icon: "bullet-list",
  },
  {
    key: "projectMemory",
    label: () => "Project Memory",
    description: () => "Enable project memory for persisting context across sessions.",
    icon: "folder",
    component: ProjectMemoryTab,
  },
  {
    key: "promptAutocomplete",
    label: () => "Prompt Autocomplete",
    description: () => "Enable AI-powered autocomplete suggestions in the chat input.",
    icon: "prompt",
  },
  {
    key: "promptEnhancer",
    label: () => "Prompt Enhancer",
    description: () => "Enable the prompt enhancer to refine and improve user prompts before sending.",
    icon: "sliders",
    agents: ["enhance"],
  },
  {
    key: "promptEnhancerSuggestions",
    label: () => "Prompt Enhancer Suggestions",
    description: () => "Show inline suggestions from the prompt enhancer as you type.",
    icon: "eye",
    requires: "promptEnhancer",
  },
  {
    key: "remoteControl",
    label: () => "Remote Control",
    description: () => "Enable remote control API for external tool integration.",
    icon: "console",
    component: RemoteControlTab,
  },
  {
    key: "selectionTip",
    label: (t) => t("settings.appearance.selectionTip.title") || "Selection Tip",
    description: (t) =>
      t("settings.appearance.selectionTip.description") ||
      "Show a tip when you select code to explain or use code actions.",
    icon: "glasses",
  },
  {
    key: "taskTimeline",
    label: (t) => t("settings.display.taskTimeline.title") || "Task Timeline",
    description: (t) => t("settings.display.taskTimeline.description") || "Show the task timeline view in the sidebar.",
    icon: "file-tree",
  },
  {
    key: "workers",
    label: () => "Workers",
    description: () =>
      "Enable background context workers. Configure in your project's strata.jsonc file under the workers key.",
    icon: "providers",
    component: BackgroundWorkersTab,
  },
]

// O(1) Pre-computed Indices for Premium Performance
const FEATURE_MAP = new Map<keyof ExtensionFeatureFlags, ResolvableFeatureDefinition>(
  FEATURES.map((f) => [f.key, f]),
)

const AGENT_GATE_MAP = new Map<string, (keyof ExtensionFeatureFlags)[]>()
const TOOL_GATE_MAP = new Map<string, (keyof ExtensionFeatureFlags)[]>()
const CHILD_MAP = new Map<keyof ExtensionFeatureFlags, (keyof ExtensionFeatureFlags)[]>()

for (const feature of FEATURES) {
  if (feature.agents) {
    for (const agent of feature.agents) {
      const gates = AGENT_GATE_MAP.get(agent) || []
      gates.push(feature.key)
      AGENT_GATE_MAP.set(agent, gates)
    }
  }
  if (feature.tools) {
    for (const tool of feature.tools) {
      const gates = TOOL_GATE_MAP.get(tool) || []
      gates.push(feature.key)
      TOOL_GATE_MAP.set(tool, gates)
    }
  }
  if (feature.requires) {
    const children = CHILD_MAP.get(feature.requires) || []
    children.push(feature.key)
    CHILD_MAP.set(feature.requires, children)
  }
}

export const FEATURE_KEYS: ReadonlySet<keyof ExtensionFeatureFlags> = new Set(FEATURES.map((f) => f.key))

/**
 * Returns true if an agent is visible given the current feature flags.
 * An agent is visible if ALL features gating it are ON.
 */
export function agentVisible(name: string, feats: ExtensionFeatureFlags): boolean {
  const gates = AGENT_GATE_MAP.get(name)
  if (!gates) return true
  return gates.every((key) => feats[key])
}

/**
 * Returns true if a tool is visible given the current feature flags.
 * A tool is visible if ANY of its gating features are ON (OR relationship).
 */
export function toolVisible(id: string, feats: ExtensionFeatureFlags): boolean {
  const gates = TOOL_GATE_MAP.get(id)
  if (!gates) return true
  return gates.some((key) => feats[key])
}

/**
 * Returns an array of agent names that should be pinned (force-included)
 * based on the currently enabled features.
 */
export function pinnedFor(feats: ExtensionFeatureFlags): string[] {
  const pinned: string[] = []
  for (const feature of FEATURES) {
    if (feats[feature.key] && feature.pinned) {
      pinned.push(...feature.pinned)
    }
  }
  return pinned
}

/** Returns true if a feature's parent dependency (if any) is enabled. */
export function parentEnabled(key: keyof ExtensionFeatureFlags, feats: ExtensionFeatureFlags): boolean {
  const feature = FEATURE_MAP.get(key)
  if (!feature?.requires) return true
  return feats[feature.requires]
}

/** Returns all child feature keys whose `requires` field points to the given parent. */
export function children(parent: keyof ExtensionFeatureFlags): (keyof ExtensionFeatureFlags)[] {
  return CHILD_MAP.get(parent) || []
}

/** Returns a feature definition by its key. */
export function getFeature(key: keyof ExtensionFeatureFlags): ResolvableFeatureDefinition | undefined {
  return FEATURE_MAP.get(key)
}
