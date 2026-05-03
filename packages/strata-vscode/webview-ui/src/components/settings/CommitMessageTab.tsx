import { Component, Show, createSignal } from "solid-js"
import { Card } from "@stratacode/strata-ui/card"
import { Switch } from "@stratacode/strata-ui/switch"
import SettingsRow from "./SettingsRow"
import MarkdownEditor from "./MarkdownEditor"
import { useConfig } from "../../context/config"
import { useLanguage } from "../../context/language"

const CommitMessageTab: Component = () => {
  const language = useLanguage()
  const { config, updateConfig } = useConfig()

  const [expanded, setExpanded] = createSignal(Boolean(config().commit_message?.prompt))

  const handleToggle = (checked: boolean) => {
    setExpanded(checked)
    if (!checked) {
      updateConfig({ commit_message: { prompt: "" } })
    }
  }

  return (
    <div>
      <Card style={{ "margin-bottom": "12px" }}>
        <SettingsRow
          title={language.t("settings.commitMessage.override.title") || "Override Default Prompt"}
          description={language.t("settings.commitMessage.override.description") || "Override the default prompt used for AI-generated commit messages."}
          last={!expanded()}
        >
          <Switch checked={expanded()} onChange={handleToggle} hideLabel>
            {language.t("settings.commitMessage.override.title") || "Override Default Prompt"}
          </Switch>
        </SettingsRow>

        <Show when={expanded()}>
          <div style={{ "padding-top": "8px" }}>
            <div data-slot="settings-row-label-title" style={{ "margin-bottom": "4px" }}>
              {language.t("settings.commitMessage.prompt.title") || "Custom Prompt"}
            </div>
            <div data-slot="settings-row-label-subtitle" style={{ "margin-bottom": "8px", "font-size": "12px", color: "var(--vscode-descriptionForeground)" }}>
              {language.t("settings.commitMessage.prompt.description") || "Provide a custom prompt for the AI to use."}
            </div>
            <MarkdownEditor
              value={config().commit_message?.prompt ?? ""}
              placeholder={language.t("settings.commitMessage.prompt.placeholder") || "Enter custom prompt..."}
              onChange={(val) => {
                updateConfig({ commit_message: { prompt: val } })
              }}
            />
          </div>
        </Show>
      </Card>
    </div>
  )
}

export default CommitMessageTab
