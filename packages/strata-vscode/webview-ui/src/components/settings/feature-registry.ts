import { Component } from "solid-js"
import { IconProps } from "@stratacode/strata-ui/icon"
import type { ExtensionFeatureFlags } from "../../types/messages/config"

import AutoApproveSettingsTab from "./AutoApproveSettingsTab"
import AutocompleteTab from "./AutocompleteTab"
import BackgroundWorkersTab from "./BackgroundWorkersTab"
import BrowserTab from "./BrowserTab"
import CheckpointsTab from "./CheckpointsTab"
import CodeActionsTab from "./CodeActionsTab"
import CommitMessageTab from "./CommitMessageTab"
import CompactionTab from "./CompactionTab"
import DiffViewerTab from "./DiffViewerTab"
import ExplainerTab from "./ExplainerTab"
import ExplainerWorkerTab from "./ExplainerWorkerTab"
import LspTab from "./LspTab"
import NotificationsTab from "./NotificationsTab"
import PasteSummaryTab from "./PasteSummaryTab"
import ProjectMemoryTab from "./ProjectMemoryTab"
import RemoteControlTab from "./RemoteControlTab"
import RepoMapTab from "./RepoMapTab"
import RetriesTab from "./RetriesTab"
import ReviewerWorkerTab from "./ReviewerWorkerTab"

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

import { MANIFEST, type FeatureSpec } from "../../../../src/stratacode/feature-manifest"

const COMPONENT_MAP: Partial<Record<keyof ExtensionFeatureFlags, Component>> = {
  autoApprove: AutoApproveSettingsTab,
  autocomplete: AutocompleteTab,
  autoretries: RetriesTab,
  browserAutomation: BrowserTab,
  checkpoints: CheckpointsTab,
  codeActions: CodeActionsTab,
  commitMessage: CommitMessageTab,
  compaction: CompactionTab,
  diffViewer: DiffViewerTab,
  explainer: ExplainerTab,
  explainerWorker: ExplainerWorkerTab,
  lsp: LspTab,
  notifications: NotificationsTab,
  pasteSummary: PasteSummaryTab,
  projectMemory: ProjectMemoryTab,
  remoteControl: RemoteControlTab,
  repoMap: RepoMapTab,
  reviewerWorker: ReviewerWorkerTab,
  workers: BackgroundWorkersTab,
}

export const FEATURES: ResolvableFeatureDefinition[] = Object.entries(MANIFEST)
  .filter(([_, raw]) => !(raw as FeatureSpec).hidden)
  .map(([key, raw]) => {
    const spec = raw as FeatureSpec
    return {
      key: key as keyof ExtensionFeatureFlags,
      label: () => spec.label,
      description: () => spec.description,
      icon: spec.icon as IconProps["name"],
      component: COMPONENT_MAP[key as keyof ExtensionFeatureFlags],
      agents: spec.agents,
      pinned: spec.pinned,
      tools: spec.tools,
      requires: spec.requires as keyof ExtensionFeatureFlags | undefined,
    }
  })

// O(1) Pre-computed Indices for Premium Performance
const FEATURE_MAP = new Map<keyof ExtensionFeatureFlags, ResolvableFeatureDefinition>(FEATURES.map((f) => [f.key, f]))

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
function parentEnabled(key: keyof ExtensionFeatureFlags, feats: ExtensionFeatureFlags): boolean {
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
