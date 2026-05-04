// stratacode_change - new file
import * as vscode from "vscode"
import { FEATURE_DEFAULTS, type FeatureKey } from "./feature-defaults"
export type { FeatureKey }

const NS = "strata-code.new"

/** Cloud features that can be globally disabled by STRATA_DISABLE_CLOUD */
const CLOUD_FEATURES = new Set<FeatureKey>([
  "cloudSessions",
  "strataAuth",
  "sessionSharing",
  "remoteControl",
  "notifications",
])

/** Features that require a parent feature to be enabled. child → parent */
const FEATURE_DEPS: Partial<Record<FeatureKey, FeatureKey>> = {
  promptEnhancerSuggestions: "promptEnhancer",
  cloudSessions: "strataAuth",
  sessionSharing: "strataAuth",
}

/** Read a feature's enabled state from VS Code settings. */
export function isEnabled(key: FeatureKey): boolean {
  if (CLOUD_FEATURES.has(key) && process.env.STRATA_DISABLE_CLOUD) {
    return false
  }
  // If the feature has a parent dependency, it is disabled when the parent is off
  const parent = FEATURE_DEPS[key]
  if (parent && !isEnabled(parent)) {
    return false
  }
  return vscode.workspace.getConfiguration(NS).get<boolean>(`features.${key}`) ?? FEATURE_DEFAULTS[key]
}

/** Read all extension feature flags. */
export function readAll(): Record<FeatureKey, boolean> {
  const result = {} as Record<FeatureKey, boolean>
  for (const key of Object.keys(FEATURE_DEFAULTS) as FeatureKey[]) {
    result[key] = isEnabled(key)
  }
  return result
}

/** Push a feature's enabled state into the VS Code context so `when` clauses can use it. */
function sync(key: FeatureKey) {
  vscode.commands.executeCommand("setContext", `stratacode.${key}.enabled`, isEnabled(key))
}

/** Sync all feature gates immediately (call on activation). */
export function syncAll() {
  for (const key of Object.keys(FEATURE_DEFAULTS) as FeatureKey[]) {
    sync(key)
  }
}

/** Subscribe to configuration changes and keep context keys in sync. Returns a Disposable. */
export function watchAll(): vscode.Disposable {
  return vscode.workspace.onDidChangeConfiguration((e) => {
    if (!e.affectsConfiguration(NS)) return
    for (const key of Object.keys(FEATURE_DEFAULTS) as FeatureKey[]) {
      if (e.affectsConfiguration(`${NS}.features.${key}`)) {
        sync(key)
      }
    }
  })
}
