// stratacode_change - new file
import * as vscode from "vscode"
import { FEATURE_DEFAULTS, type FeatureKey } from "./feature-defaults"
export type { FeatureKey }

const NS = "strata-code.new"

/** Read a feature's enabled state from VS Code settings. */
export function isEnabled(key: FeatureKey): boolean {
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
