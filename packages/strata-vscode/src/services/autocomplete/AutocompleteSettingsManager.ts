import * as vscode from "vscode"
import { AUTOCOMPLETE_MODELS, getAutocompleteModel } from "../../shared/autocomplete-models"

export const CONFIG_SECTION = "strata-code.new.autocomplete"

export interface AutocompleteServiceSettings {
  enabled: boolean // stratacode_change
  enableAutoTrigger: boolean
  enableSmartInlineTaskKeybinding: boolean
  enableChatAutocomplete: boolean
  provider?: string
  model: string
  snoozeUntil?: number
  chatMode: "fim" | "agent"
  chatDebounceMs: number
  taskSuggestionsEnabled: boolean
}

export type WebviewMessage = {
  type: string
  key?: unknown
  value?: unknown
}

type WebviewPost = (msg: unknown) => void

const ALLOWED_KEYS = new Set([
  "enabled", // stratacode_change
  "enableAutoTrigger",
  "enableSmartInlineTaskKeybinding",
  "enableChatAutocomplete",
  "chatMode",
  "chatDebounceMs",
  "taskSuggestionsEnabled",
  "model",
  "snoozeUntil",
])

export class AutocompleteSettingsManager {
  private static _instance: AutocompleteSettingsManager | null = null

  private constructor() {}

  public static getInstance(): AutocompleteSettingsManager {
    if (!this._instance) {
      this._instance = new AutocompleteSettingsManager()
    }
    return this._instance
  }

  public getSettings(): AutocompleteServiceSettings {
    const config = vscode.workspace.getConfiguration(CONFIG_SECTION)
    const root = vscode.workspace.getConfiguration("strata-code.new") // stratacode_change
    return {
      enabled: root.get<boolean>("features.autocomplete") ?? true, // stratacode_change
      enableAutoTrigger: config.get<boolean>("enableAutoTrigger", true),
      enableSmartInlineTaskKeybinding: config.get<boolean>("enableSmartInlineTaskKeybinding", false),
      enableChatAutocomplete: config.get<boolean>("enableChatAutocomplete", false),
      model: getAutocompleteModel(config.get<string>("model") ?? "").id,
      snoozeUntil: config.get<number>("snoozeUntil"),
      chatMode: config.get<string>("chatMode", "fim") as "fim" | "agent",
      chatDebounceMs: config.get<number>("chatDebounceMs", 2000),
      taskSuggestionsEnabled: config.get<boolean>("taskSuggestionsEnabled", true),
    }
  }

  public async updateSetting(key: string, value: unknown): Promise<boolean> {
    if (!ALLOWED_KEYS.has(key)) return false
    if (!this.isValid(key, value)) return false

    await vscode.workspace
      .getConfiguration(CONFIG_SECTION)
      .update(key, value, vscode.ConfigurationTarget.Global)

    return true
  }

  public async updateSettings(patch: Partial<AutocompleteServiceSettings>): Promise<void> {
    for (const [key, value] of Object.entries(patch)) {
      await this.updateSetting(key, value)
    }
  }

  private isValid(key: string, value: unknown): boolean {
    if (key === "model") {
      if (typeof value !== "string") return false
      return AUTOCOMPLETE_MODELS.some((m) => m.id === value)
    }
    if (key === "chatMode") return value === "fim" || value === "agent"
    if (key === "chatDebounceMs") return typeof value === "number" && value >= 200 && value <= 10000
    if (key === "snoozeUntil") return value === undefined || typeof value === "number"
    return typeof value === "boolean"
  }

  // Webview Messaging
  public async routeAutocompleteMessage(message: WebviewMessage, post: WebviewPost): Promise<boolean> {
    if (message.type === "requestAutocompleteSettings") {
      post(this.buildAutocompleteSettingsMessage())
      return true
    }

    if (message.type === "updateAutocompleteSetting") {
      if (typeof message.key === "string" && await this.updateSetting(message.key, message.value)) {
        post(this.buildAutocompleteSettingsMessage())
      }
      return true
    }

    return false
  }

  public buildAutocompleteSettingsMessage() {
    return {
      type: "autocompleteSettingsLoaded" as const,
      settings: this.getSettings(),
    }
  }

  public watchAutocompleteConfig(post: WebviewPost): vscode.Disposable {
    return vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(CONFIG_SECTION)) {
        post(this.buildAutocompleteSettingsMessage())
      }
    })
  }

  public onDidChangeConfiguration(listener: () => void): vscode.Disposable {
    return vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(CONFIG_SECTION)) {
        listener()
      }
    })
  }

  public static _resetInstance(): void {
    this._instance = null
  }
}
