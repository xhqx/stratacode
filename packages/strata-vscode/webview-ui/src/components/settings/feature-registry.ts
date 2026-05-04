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

// Internal helper for translation (avoids coupling to SolidJS context)
// Note: Since this is outside the component tree, dynamic translations for labels/descriptions
// require either passing a translation function or resolving at render time.
// For simplicity, we use the static string keys or English defaults here, and components
// can translate them if needed, or we just rely on the static text for now (matching prior behavior).
// Since language.t was used dynamically in FeaturesTab for some experimental keys, we will
// use a function to resolve dynamic fields at render time.

export type ResolvableFeatureDefinition = Omit<FeatureDefinition, "label" | "description"> & {
  label: (t: (key: string) => string) => string
  description: (t: (key: string) => string) => string
}

export const FEATURES: ResolvableFeatureDefinition[] = [
  {
    key: "acpAgents",
    label: () => "ACP Agents",
    description: () => "Enable Agent Communication Protocol agents integration.",
    icon: "circuit-board",
    component: AcpAgentsTab,
  },
  {
    key: "agentManager",
    label: () => "Agent Manager",
    description: () => "Enable the multi-session Agent Manager panel with git worktree isolation.",
    icon: "sidebar",
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
    icon: "code-lines",
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
    icon: "settings-gear",
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
    icon: "code-lines",
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
    icon: "branch",
    component: CommitMessageTab,
    agents: ["commit"],
    pinned: ["commit"],
  },
  {
    key: "compaction",
    label: () => "Compaction",
    description: () => "Enable automatic context compaction for long sessions.",
    icon: "archive",
    component: CompactionTab,
  },
  {
    key: "diffViewer",
    label: () => "Diff Viewer",
    description: () =>
      "Enable the Changes tab, AI explain commands, and diff viewer panel. Disabling requires a window reload.",
    icon: "code-lines",
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
    icon: "brain",
    component: ExplainerTab,
    agents: ["explainer"],
  },
  {
    key: "formatter",
    label: (t) => t("settings.agentBehaviour.formatter.title") || "AI Formatter",
    description: (t) =>
      t("settings.agentBehaviour.formatter.description") ||
      "Use the AI formatter to automatically apply changes after code generation.",
    icon: "code-lines",
  },
  {
    key: "kanban",
    label: () => "Kanban",
    description: () => "Enable the Kanban task board for tracking AI-generated tasks.",
    icon: "checklist",
    component: KanbanTab,
    tools: ["task", "todoread", "todowrite"],
  },
  {
    key: "lsp",
    label: () => "LSP",
    description: () => "Enable Language Server Protocol integration for diagnostics and code intelligence.",
    icon: "code",
    component: LspTab,
    tools: ["lsp"],
  },
  {
    key: "notifications",
    label: () => "Notifications",
    description: () => "Enable in-app notification center for agent activity and system events.",
    icon: "circle-check",
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
    icon: "checklist",
  },
  {
    key: "projectMemory",
    label: () => "Project Memory",
    description: () => "Enable project memory for persisting context across sessions.",
    icon: "archive",
    component: ProjectMemoryTab,
  },
  {
    key: "promptAutocomplete",
    label: () => "Prompt Autocomplete",
    description: () => "Enable AI-powered autocomplete suggestions in the chat input.",
    icon: "code-lines",
  },
  {
    key: "promptEnhancer",
    label: () => "Prompt Enhancer",
    description: () => "Enable the prompt enhancer to refine and improve user prompts before sending.",
    icon: "code-lines",
    agents: ["enhance"],
  },
  {
    key: "promptEnhancerSuggestions",
    label: () => "Prompt Enhancer Suggestions",
    description: () => "Show inline suggestions from the prompt enhancer as you type.",
    icon: "code-lines",
    requires: "promptEnhancer",
  },
  {
    key: "remoteControl",
    label: () => "Remote Control",
    description: () => "Enable remote control API for external tool integration.",
    icon: "window-cursor",
    component: RemoteControlTab,
  },
  {
    key: "selectionTip",
    label: (t) => t("settings.appearance.selectionTip.title") || "Selection Tip",
    description: (t) =>
      t("settings.appearance.selectionTip.description") ||
      "Show a tip when you select code to explain or use code actions.",
    icon: "code-lines",
  },
  {
    key: "sessionSharing",
    label: () => "Session Sharing",
    description: () => "Enable session sharing and cloud sync for collaborative workflows.",
    icon: "link",
    component: SessionSharingTab,
  },
  {
    key: "taskTimeline",
    label: (t) => t("settings.display.taskTimeline.title") || "Task Timeline",
    description: (t) => t("settings.display.taskTimeline.description") || "Show the task timeline view in the sidebar.",
    icon: "checklist",
  },
  {
    key: "workers",
    label: () => "Workers",
    description: () =>
      "Enable background context workers. Configure in your project's strata.jsonc file under the workers key.",
    icon: "reset",
    component: BackgroundWorkersTab,
  },
]

export const FEATURE_KEYS: ReadonlySet<string> = new Set(FEATURES.map((f) => f.key))

/**
 * Returns true if an agent is visible given the current feature flags.
 * An agent is visible if it is NOT gated by any feature, or if ALL features gating it are ON.
 * Actually, typical gating is 1-to-1, but the rule is: if any feature lists this agent in its `agents` array
 * and that feature is OFF, the agent is hidden.
 */
export function agentVisible(name: string, feats: ExtensionFeatureFlags): boolean {
  for (const feature of FEATURES) {
    if (feature.agents?.includes(name) && !feats[feature.key]) {
      return false
    }
  }
  return true
}

/**
 * Returns true if a tool is visible given the current feature flags.
 * A tool is visible if it has NO gating features, OR if ANY of its gating features are ON.
 * This supports the "task -> kanban || documentDrivenTasks" OR relationship.
 */
export function toolVisible(id: string, feats: ExtensionFeatureFlags): boolean {
  let gatingFeaturesCount = 0
  let enabledGatingFeaturesCount = 0

  for (const feature of FEATURES) {
    if (feature.tools?.includes(id)) {
      gatingFeaturesCount++
      if (feats[feature.key]) {
        enabledGatingFeaturesCount++
      }
    }
  }

  // If no features gate this tool, it's visible.
  // If some features gate it, it's visible if at least one of them is enabled.
  return gatingFeaturesCount === 0 || enabledGatingFeaturesCount > 0
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
  const feature = FEATURES.find((f) => f.key === key)
  if (!feature?.requires) return true
  return feats[feature.requires]
}

/** Returns all child feature keys whose `requires` field points to the given parent. */
export function children(parent: keyof ExtensionFeatureFlags): (keyof ExtensionFeatureFlags)[] {
  return FEATURES.filter((f) => f.requires === parent).map((f) => f.key)
}
