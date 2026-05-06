import * as vscode from "vscode"
import { AUTOCOMPLETE_MODELS, getAutocompleteModel } from "../../shared/autocomplete-models"

const keys = new Set([
  "enableAutoTrigger",
  "enableSmartInlineTaskKeybinding",
  "enableChatAutocomplete",
  "chatMode",
  "chatDebounceMs",
  "model",
])

type Message = {
  type: string
  key?: unknown
  value?: unknown
}

type Post = (msg: unknown) => void

export async function routeAutocompleteMessage(message: Message, post: Post): Promise<boolean> {
  if (message.type === "requestAutocompleteSettings") {
    post(buildAutocompleteSettingsMessage())
    return true
  }

  if (message.type === "updateAutocompleteSetting") {
    if (await update(message.key, message.value)) {
      post(buildAutocompleteSettingsMessage())
    }
    return true
  }

  return false
}

export function buildAutocompleteSettingsMessage() {
  const config = vscode.workspace.getConfiguration("strata-code.new.autocomplete")
  return {
    type: "autocompleteSettingsLoaded" as const,
    settings: {
      enableAutoTrigger: config.get<boolean>("enableAutoTrigger", true),
      enableSmartInlineTaskKeybinding: config.get<boolean>("enableSmartInlineTaskKeybinding", false),
      enableChatAutocomplete: config.get<boolean>("enableChatAutocomplete", false),
      model: getAutocompleteModel(config.get<string>("model") ?? "").id,
      chatMode: config.get<string>("chatMode", "fim") as "fim" | "agent",
      chatDebounceMs: config.get<number>("chatDebounceMs", 2000),
    },
  }
}

/** Push autocomplete settings to the webview whenever VS Code config changes. */
export function watchAutocompleteConfig(post: Post): vscode.Disposable {
  return vscode.workspace.onDidChangeConfiguration((e) => {
    if (e.affectsConfiguration("strata-code.new.autocomplete")) {
      post(buildAutocompleteSettingsMessage())
    }
  })
}

async function update(key: unknown, value: unknown) {
  if (typeof key !== "string") return false
  if (!keys.has(key)) return false
  if (!valid(key, value)) return false

  await vscode.workspace
    .getConfiguration("strata-code.new.autocomplete")
    .update(key, value, vscode.ConfigurationTarget.Global)

  return true
}

function valid(key: string, value: unknown) {
  if (key === "model") {
    if (typeof value !== "string") return false
    return AUTOCOMPLETE_MODELS.some((m) => m.id === value)
  }
  if (key === "chatMode") return value === "fim" || value === "agent"
  if (key === "chatDebounceMs") return typeof value === "number" && value >= 200 && value <= 10000
  return typeof value === "boolean"
}
