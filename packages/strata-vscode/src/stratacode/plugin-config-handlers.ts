// stratacode_change - new file
import * as vscode from "vscode"
import { pluginRegistry } from "../plugin-api/index"
import type { JSONValue, ContextItem } from "@stratacode/vscode-api"

type PostMessage = (msg: Record<string, unknown>) => void

/** Builds the full pluginConfigLoaded payload for broadcasting to the webview. */
export function buildPluginConfigLoaded() {
  const sections = pluginRegistry.getRenderableConfigSections()
  const values: Record<string, Record<string, JSONValue>> = {}
  for (const section of sections) {
    values[section.id] = {}
    for (const field of section.fields) {
      values[section.id][field.key] = pluginRegistry.getPluginConfigValue(section.id, field.key) ?? field.default ?? null
    }
  }
  return { type: "pluginConfigLoaded" as const, sections, values }
}

/** Handles the savePluginConfig webview message. Validates the section, writes to VS Code config, and responds. */
export async function handleSavePluginConfig(
  sectionId: string,
  changes: Record<string, JSONValue>,
  post: PostMessage,
) {
  const registered = pluginRegistry.getRenderableConfigSections().find(s => s.id === sectionId)
  if (!registered) {
    post({ type: "pluginConfigUpdateFailed", sectionId, message: `Unknown config section: ${sectionId}` })
    return
  }
  try {
    const config = vscode.workspace.getConfiguration(sectionId)
    for (const [key, value] of Object.entries(changes)) {
      if (!registered.fields.some(f => f.key === key)) {
        console.warn(`[StrataPluginAPI] Skipping unknown config key: ${sectionId}.${key}`)
        continue
      }
      await config.update(key, value, vscode.ConfigurationTarget.Global)
    }
    // Re-read ALL field values so the webview has a complete snapshot
    const full: Record<string, JSONValue> = {}
    const fresh = vscode.workspace.getConfiguration(sectionId)
    for (const field of registered.fields) {
      full[field.key] = fresh.get(field.key) ?? field.default ?? null
    }
    post({ type: "pluginConfigUpdated", sectionId, values: full })
  } catch (e) {
    post({ type: "pluginConfigUpdateFailed", sectionId, message: e instanceof Error ? e.message : String(e) })
  }
}

/**
 * Fires onWillSendMessage and returns true if a plugin cancelled the message.
 * Also gathers context items and appends them as text parts to the parts array.
 */
export async function applyPluginHooks(
  sid: string,
  dir: string,
  text: string,
  parts: Array<{ type: string; text?: string }>,
): Promise<boolean> {
  let cancelled = false
  pluginRegistry.onWillSendMessage.fire({
    sessionId: sid,
    text,
    cancel: () => { cancelled = true },
  })
  if (cancelled) return true

  const items = await pluginRegistry.getContextItems({ id: sid, title: "Session", directory: dir })
  for (const item of items) {
    if (item.type === "text") {
      parts.push({ type: "text", text: `[Context from ${item.label}]\n${item.content}` })
    }
  }
  return false
}

/** Tracks pending sessions and fires onDidCompleteMessage when they go idle. */
const pending = new Set<string>()

export function markPending(sid: string) {
  pending.add(sid)
}

export function checkCompletion(sid: string, status: string) {
  if (status === "idle" && pending.has(sid)) {
    pending.delete(sid)
    pluginRegistry.onDidCompleteMessage.fire({ sessionId: sid })
  }
}
