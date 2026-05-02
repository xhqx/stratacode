import { Component, Show, createSignal, createEffect, onCleanup } from "solid-js"
import { Card } from "@stratacode/strata-ui/card"
import { Switch } from "@stratacode/strata-ui/switch"
import SettingsRow from "./SettingsRow"
import MarkdownEditor from "./MarkdownEditor"
import { useConfig } from "../../context/config"
import { useVSCode } from "../../context/vscode"
import type { ExtensionMessage } from "../../types/messages"
import type { TabContext } from "./ModeEditTabs"

export const FeaturesTab: Component<
  TabContext & {
    config: () => Record<string, unknown>
    updateConfig: (partial: Record<string, unknown>) => void
  }
> = (props) => {
  const vscode = useVSCode()
  const { config, updateConfig } = useConfig()

  const [autoTrigger, setAutoTrigger] = createSignal(true)
  const [smartInline, setSmartInline] = createSignal(false)
  const [chatAuto, setChatAuto] = createSignal(false)

  const unsubscribe = vscode.onMessage((message: ExtensionMessage) => {
    if (message.type !== "autocompleteSettingsLoaded") return
    setAutoTrigger(message.settings.enableAutoTrigger)
    setSmartInline(message.settings.enableSmartInlineTaskKeybinding)
    setChatAuto(message.settings.enableChatAutocomplete)
  })

  onCleanup(unsubscribe)

  createEffect(() => {
    if (props.name === "autocomplete") {
      vscode.postMessage({ type: "requestAutocompleteSettings" })
    }
  })

  const updateAutocompleteSetting = (
    key: "enableAutoTrigger" | "enableSmartInlineTaskKeybinding" | "enableChatAutocomplete",
    value: boolean,
  ) => {
    vscode.postMessage({ type: "updateAutocompleteSetting", key, value })
  }

  const [expanded, setExpanded] = createSignal(Boolean(config().commit_message?.prompt))

  const handleToggle = (checked: boolean) => {
    setExpanded(checked)
    if (!checked) {
      updateConfig({ commit_message: { prompt: "" } })
    }
  }

  return (
    <>
      <Show when={props.name === "autocomplete" && !props.cfg().disable}>
        <Card style={{ "margin-bottom": "12px" }}>
          <SettingsRow
            title={props.t("settings.autocomplete.autoTrigger.title")}
            description={props.t("settings.autocomplete.autoTrigger.description")}
          >
            <Switch checked={autoTrigger()} onChange={(val) => updateAutocompleteSetting("enableAutoTrigger", val)} hideLabel>
              {props.t("settings.autocomplete.autoTrigger.title")}
            </Switch>
          </SettingsRow>

          <SettingsRow
            title={props.t("settings.autocomplete.smartKeybinding.title")}
            description={props.t("settings.autocomplete.smartKeybinding.description")}
          >
            <Switch checked={smartInline()} onChange={(val) => updateAutocompleteSetting("enableSmartInlineTaskKeybinding", val)} hideLabel>
              {props.t("settings.autocomplete.smartKeybinding.title")}
            </Switch>
          </SettingsRow>

          <SettingsRow
            title={props.t("settings.autocomplete.chatAutocomplete.title")}
            description={props.t("settings.autocomplete.chatAutocomplete.description")}
            last
          >
            <Switch checked={chatAuto()} onChange={(val) => updateAutocompleteSetting("enableChatAutocomplete", val)} hideLabel>
              {props.t("settings.autocomplete.chatAutocomplete.title")}
            </Switch>
          </SettingsRow>
        </Card>
      </Show>

      <Show when={props.name === "commit" && !props.cfg().disable}>
        <Card style={{ "margin-bottom": "12px" }}>
          <SettingsRow
            title={props.t("settings.commitMessage.override.title")}
            description={props.t("settings.commitMessage.override.description")}
            last={!expanded()}
          >
            <Switch checked={expanded()} onChange={handleToggle} hideLabel>
              {props.t("settings.commitMessage.override.title")}
            </Switch>
          </SettingsRow>

          <Show when={expanded()}>
            <div style={{ "padding-top": "8px" }}>
              <div data-slot="settings-row-label-title" style={{ "margin-bottom": "4px" }}>
                {props.t("settings.commitMessage.prompt.title")}
              </div>
              <div data-slot="settings-row-label-subtitle" style={{ "margin-bottom": "8px" }}>
                {props.t("settings.commitMessage.prompt.description")}
              </div>
              <MarkdownEditor
                value={config().commit_message?.prompt ?? ""}
                placeholder={props.t("settings.commitMessage.prompt.placeholder")}
                onChange={(val) => {
                  updateConfig({ commit_message: { prompt: val } })
                }}
              />
            </div>
          </Show>
        </Card>
      </Show>
    </>
  )
}
