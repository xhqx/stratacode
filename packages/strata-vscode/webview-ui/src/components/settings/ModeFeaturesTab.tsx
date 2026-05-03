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
  const [chatMode, setChatMode] = createSignal<"fim" | "agent">("fim")
  const [chatDebounceMs, setChatDebounceMs] = createSignal(2000)
  const [taskSuggestions, setTaskSuggestions] = createSignal(true)

  const [taskView, setTaskView] = createSignal(true)
  const [documentDriven, setDocumentDriven] = createSignal(true)

  const unsubscribe = vscode.onMessage((message: ExtensionMessage) => {
    if (message.type === "autocompleteSettingsLoaded") {
      setAutoTrigger(message.settings.enableAutoTrigger)
      setSmartInline(message.settings.enableSmartInlineTaskKeybinding)
      setChatAuto(message.settings.enableChatAutocomplete)
      setChatMode(message.settings.chatMode ?? "fim")
      setChatDebounceMs(message.settings.chatDebounceMs ?? 2000)
      setTaskSuggestions(message.settings.taskSuggestionsEnabled ?? true)
    } else if (message.type === "planningSettingsLoaded") {
      setTaskView(message.settings.taskView)
      setDocumentDriven(message.settings.documentDrivenTasks)
    }
  })

  onCleanup(unsubscribe)

  createEffect(() => {
    if (props.name === "autocomplete") {
      vscode.postMessage({ type: "requestAutocompleteSettings" })
    } else if (props.name === "plan") {
      vscode.postMessage({ type: "requestPlanningSettings" })
    }
  })

  const updateAutocompleteSetting = (
    key:
      | "enableAutoTrigger"
      | "enableSmartInlineTaskKeybinding"
      | "enableChatAutocomplete"
      | "chatMode"
      | "chatDebounceMs"
      | "taskSuggestionsEnabled",
    value: boolean | string | number,
  ) => {
    vscode.postMessage({ type: "updateAutocompleteSetting", key, value })
  }

  const updatePlanningSetting = (key: "taskView" | "documentDrivenTasks", value: boolean) => {
    vscode.postMessage({ type: "updatePlanningSetting", key, value })
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
            <Switch
              checked={autoTrigger()}
              onChange={(val) => updateAutocompleteSetting("enableAutoTrigger", val)}
              hideLabel
            >
              {props.t("settings.autocomplete.autoTrigger.title")}
            </Switch>
          </SettingsRow>

          <SettingsRow
            title={props.t("settings.autocomplete.smartKeybinding.title")}
            description={props.t("settings.autocomplete.smartKeybinding.description")}
          >
            <Switch
              checked={smartInline()}
              onChange={(val) => updateAutocompleteSetting("enableSmartInlineTaskKeybinding", val)}
              hideLabel
            >
              {props.t("settings.autocomplete.smartKeybinding.title")}
            </Switch>
          </SettingsRow>

          <SettingsRow
            title={props.t("settings.autocomplete.chatAutocomplete.title")}
            description={props.t("settings.autocomplete.chatAutocomplete.description")}
          >
            <Switch
              checked={chatAuto()}
              onChange={(val) => updateAutocompleteSetting("enableChatAutocomplete", val)}
              hideLabel
            >
              {props.t("settings.autocomplete.chatAutocomplete.title")}
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
                  updateAutocompleteSetting("chatMode", val)
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
                    updateAutocompleteSetting("chatDebounceMs", val)
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

            <SettingsRow
              title="Task Suggestion Chips"
              description="Show AI-generated next-task chips below the chat input when the prompt is empty."
              last
            >
              <Switch
                checked={taskSuggestions()}
                onChange={(val) => {
                  setTaskSuggestions(val)
                  updateAutocompleteSetting("taskSuggestionsEnabled", val)
                }}
                hideLabel
              >
                Task Suggestion Chips
              </Switch>
            </SettingsRow>
          </Show>
          <Show when={!chatAuto()}>
            <SettingsRow
              title="Task Suggestion Chips"
              description="Show AI-generated next-task chips below the chat input when the prompt is empty."
              last
            >
              <Switch
                checked={taskSuggestions()}
                onChange={(val) => {
                  setTaskSuggestions(val)
                  updateAutocompleteSetting("taskSuggestionsEnabled", val)
                }}
                hideLabel
              >
                Task Suggestion Chips
              </Switch>
            </SettingsRow>
          </Show>
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

      <Show when={props.name === "plan" && !props.cfg().disable}>
        <Card style={{ "margin-bottom": "12px" }}>
          <SettingsRow
            title={props.t("settings.plan.taskView.title") || "Planning Task View"}
            description={props.t("settings.plan.taskView.description") || "Show the Kanban task board in the sidebar."}
          >
            <Switch checked={taskView()} onChange={(val) => updatePlanningSetting("taskView", val)} hideLabel>
              {props.t("settings.plan.taskView.title") || "Planning Task View"}
            </Switch>
          </SettingsRow>

          <SettingsRow
            title={props.t("settings.plan.documentDriven.title") || "Document Driven Tasks"}
            description={
              props.t("settings.plan.documentDriven.description") ||
              "Automatically sync tasks with markdown plan files."
            }
            last
          >
            <Switch
              checked={documentDriven()}
              onChange={(val) => updatePlanningSetting("documentDrivenTasks", val)}
              hideLabel
            >
              {props.t("settings.plan.documentDriven.title") || "Document Driven Tasks"}
            </Switch>
          </SettingsRow>
        </Card>
      </Show>
    </>
  )
}
