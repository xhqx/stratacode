// stratacode_change - new file
import * as vscode from "vscode"
import type { FeatureKey } from "./feature-defaults"
import { FeatureGraph } from "./feature-graph"
import { MANIFEST } from "./feature-manifest"

export type { FeatureKey }

const NS = "strata-code.new"

const graph = new FeatureGraph(MANIFEST)
graph.validate()

function readRaw(): Record<string, boolean> {
  const result: Record<string, boolean> = {}
  for (const k of Object.keys(MANIFEST)) {
    const key = k as FeatureKey
    result[key] = vscode.workspace.getConfiguration(NS).get<boolean>(`features.${key}`) ?? MANIFEST[key].default
  }
  return result
}

/** Read a feature's enabled state from VS Code settings and resolve dependencies. */
export function isEnabled(key: FeatureKey): boolean {
  const rawFlags = readRaw()
  if (!graph.canEnable(key, rawFlags, process.env)) {
    return false
  }
  return rawFlags[key]
}

/** Read all extension feature flags. */
export function readAll(): Record<FeatureKey, boolean> {
  const result = {} as Record<FeatureKey, boolean>
  const rawFlags = readRaw()
  for (const key of Object.keys(MANIFEST) as FeatureKey[]) {
    result[key] = graph.canEnable(key, rawFlags, process.env) && rawFlags[key]
  }
  return result
}

/** Push a feature's enabled state into the VS Code context so `when` clauses can use it. */
function sync(key: FeatureKey) {
  vscode.commands.executeCommand("setContext", `stratacode.${key}.enabled`, isEnabled(key))
}

/** Sync all feature gates immediately (call on activation). */
export function syncAll() {
  for (const key of Object.keys(MANIFEST) as FeatureKey[]) {
    sync(key)
  }
}

/** Subscribe to configuration changes and keep context keys in sync. Returns a Disposable. */
export function watchAll(): vscode.Disposable {
  return vscode.workspace.onDidChangeConfiguration((e) => {
    if (!e.affectsConfiguration(NS)) return
    for (const key of Object.keys(MANIFEST) as FeatureKey[]) {
      if (e.affectsConfiguration(`${NS}.features.${key}`)) {
        sync(key)
        // Also sync children, as their effective state may have changed
        const cascade = graph.cascade(key)
        for (const child of cascade) {
          sync(child as FeatureKey)
        }
      }
    }
  })
}
