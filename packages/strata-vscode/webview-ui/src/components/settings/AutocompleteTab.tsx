import { Component, Show, createSignal, createEffect, onCleanup } from "solid-js"
import { Card } from "@stratacode/strata-ui/card"
import { Switch } from "@stratacode/strata-ui/switch"
import SettingsRow from "./SettingsRow"
import { useVSCode } from "../../context/vscode"
import { useLanguage } from "../../context/language"
import type { ExtensionMessage } from "../../types/messages"

const AutocompleteTab: Component = () => {
  const vscode = useVSCode()
  const language = useLanguage()

  const [autoTrigger, setAutoTrigger] = createSignal(true)
  const [smartInline, setSmartInline] = createSignal(false)
  const [chatAuto, setChatAuto] = createSignal(false)
  const [chatMode, setChatMode] = createSignal<"fim" | "agent">("fim")
  const [chatDebounceMs, setChatDebounceMs] = createSignal(2000)

  const unsubscribe = vscode.onMessage((message: ExtensionMessage) => {
    if (message.type === "autocompleteSettingsLoaded") {
      setAutoTrigger(message.settings.enableAutoTrigger)
      setSmartInline(message.settings.enableSmartInlineTaskKeybinding)
      setChatAuto(message.settings.enableChatAutocomplete)
      setChatMode(message.settings.chatMode ?? "fim")
      setChatDebounceMs(message.settings.chatDebounceMs ?? 2000)
    }
  })

  onCleanup(unsubscribe)

  createEffect(() => {
    vscode.postMessage({ type: "requestAutocompleteSettings" })
  })

  const updateSetting = (
    key:
      | "enableAutoTrigger"
      | "enableSmartInlineTaskKeybinding"
      | "enableChatAutocomplete"
      | "chatMode"
      | "chatDebounceMs",
    value: boolean | string | number,
  ) => {
    vscode.postMessage({ type: "updateAutocompleteSetting", key, value })
  }

  return (
    <div>
      <Card>
        <SettingsRow
          title={language.t("settings.autocomplete.autoTrigger.title") || "Auto-Trigger Inline Completions"}
          description={
            language.t("settings.autocomplete.autoTrigger.description") || "Show ghost text automatically as you type."
          }
        >
          <Switch checked={autoTrigger()} onChange={(val) => updateSetting("enableAutoTrigger", val)} hideLabel>
            {language.t("settings.autocomplete.autoTrigger.title") || "Auto-Trigger Inline Completions"}
          </Switch>
        </SettingsRow>

        <SettingsRow
          title={language.t("settings.autocomplete.smartKeybinding.title") || "Smart Inline Task Keybinding"}
          description={
            language.t("settings.autocomplete.smartKeybinding.description") ||
            "Enable the smart inline task keybinding."
          }
        >
          <Switch
            checked={smartInline()}
            onChange={(val) => updateSetting("enableSmartInlineTaskKeybinding", val)}
            hideLabel
          >
            {language.t("settings.autocomplete.smartKeybinding.title") || "Smart Inline Task Keybinding"}
          </Switch>
        </SettingsRow>

        <SettingsRow
          title={language.t("settings.autocomplete.chatAutocomplete.title") || "Chat Autocomplete"}
          description={
            language.t("settings.autocomplete.chatAutocomplete.description") || "Enable chat autocomplete suggestions."
          }
          last={!chatAuto()}
        >
          <Switch checked={chatAuto()} onChange={(val) => updateSetting("enableChatAutocomplete", val)} hideLabel>
            {language.t("settings.autocomplete.chatAutocomplete.title") || "Chat Autocomplete"}
          </Switch>
        </SettingsRow>

        <Show when={chatAuto()}>
          <SettingsRow
            title="Chat Autocomplete Mode"
            description="'FIM' is fast and uses the inline model. 'Agent' is context-aware and uses the project summarizer."
          >
            <select
              value={chatMode()}
              onChange={(e) => {
                const val = e.currentTarget.value as "fim" | "agent"
                setChatMode(val)
                updateSetting("chatMode", val)
              }}
              style={{
                padding: "3px 8px",
                "border-radius": "4px",
                "background-color": "var(--vscode-input-background)",
                color: "var(--vscode-input-foreground)",
                border: "1px solid var(--vscode-input-border)",
                "font-size": "12px",
              }}
            >
              <option value="fim">FIM (fast)</option>
              <option value="agent">Agent (context-aware)</option>
            </select>
          </SettingsRow>

          <SettingsRow
            title="Autocomplete Debounce (ms)"
            description="Delay after typing stops before requesting a completion. Default: 2000ms."
            last
          >
            <input
              type="number"
              min="200"
              max="10000"
              step="100"
              value={chatDebounceMs()}
              onChange={(e) => {
                const val = parseInt(e.currentTarget.value, 10)
                if (!isNaN(val) && val >= 200 && val <= 10000) {
                  setChatDebounceMs(val)
                  updateSetting("chatDebounceMs", val)
                }
              }}
              style={{
                width: "80px",
                padding: "4px 8px",
                "background-color": "var(--vscode-input-background)",
                color: "var(--vscode-input-foreground)",
                border: "1px solid var(--vscode-input-border)",
                "font-size": "12px",
              }}
            />
          </SettingsRow>
        </Show>
      </Card>
    </div>
  )
}

export default AutocompleteTab
