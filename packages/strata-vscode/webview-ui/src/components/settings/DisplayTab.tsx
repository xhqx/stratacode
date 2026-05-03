import { Component, createSignal, onCleanup } from "solid-js"
import { Switch } from "@stratacode/strata-ui/switch"
import { Select } from "@stratacode/strata-ui/select"
import { TextField } from "@stratacode/strata-ui/text-field"
import { Card } from "@stratacode/strata-ui/card"
import { useConfig } from "../../context/config"
import { useLanguage } from "../../context/language"
import { useVSCode } from "../../context/vscode"
import type { ExtensionMessage } from "../../types/messages"
import SettingsRow from "./SettingsRow"
import { LOCALES, LOCALE_LABELS, type Locale } from "../../context/language"

const AUTO = "auto"
const options = [AUTO, ...LOCALES] as const
type Option = typeof AUTO | Locale

interface LayoutOption {
  value: string
  labelKey: string
}

const LAYOUT_OPTIONS: LayoutOption[] = [
  { value: "auto", labelKey: "settings.display.layout.auto" },
  { value: "stretch", labelKey: "settings.display.layout.stretch" },
]

const DisplayTab: Component = () => {
  const { config, updateConfig } = useConfig()
  const language = useLanguage()
  const vscode = useVSCode()

  const [showTaskTimeline, setShowTaskTimeline] = createSignal(false)
  const [showSelectionTip, setShowSelectionTip] = createSignal(true)

  const unsubscribe = vscode.onMessage((message: ExtensionMessage) => {
    if (message.type === "timelineSettingLoaded") {
      setShowTaskTimeline(message.visible)
    } else if (message.type === "settingLoaded" && message.key === "showSelectionTip") {
      setShowSelectionTip(message.value as boolean)
    }
  })
  onCleanup(unsubscribe)
  vscode.postMessage({ type: "requestTimelineSetting" })
  vscode.postMessage({ type: "requestSetting", key: "showSelectionTip" })

  return (
    <div>
      <Card>
        <SettingsRow
          title={language.t("settings.display.username.title")}
          description={language.t("settings.display.username.description")}
        >
          <div style={{ width: "160px" }}>
            <TextField
              value={config().username ?? ""}
              placeholder="User"
              onChange={(val) => updateConfig({ username: val.trim() || undefined })}
            />
          </div>
        </SettingsRow>

        <SettingsRow
          title={language.t("settings.display.layout.title")}
          description={language.t("settings.display.layout.description")}
        >
          <Select
            options={LAYOUT_OPTIONS}
            current={LAYOUT_OPTIONS.find((o) => o.value === (config().layout ?? "auto"))}
            value={(o) => o.value}
            label={(o) => language.t(o.labelKey)}
            onSelect={(o) => {
              if (!o) return
              const next = o.value as "auto" | "stretch"
              if (next === (config().layout ?? "auto")) return
              updateConfig({ layout: next })
            }}
            variant="secondary"
            size="small"
            triggerVariant="settings"
          />
        </SettingsRow>

        <SettingsRow
          title={language.t("settings.language.title")}
          description={language.t("settings.language.description")}
        >
          <div style={{ display: "flex", "flex-direction": "column", "align-items": "flex-end" }}>
            <Select
              options={[...options]}
              current={language.userOverride() || AUTO}
              label={(opt: Option) => (opt === AUTO ? language.t("settings.language.auto") : LOCALE_LABELS[opt])}
              value={(opt: Option) => opt}
              onSelect={(opt) => {
                if (opt !== undefined) {
                  language.setLocale(opt === AUTO ? "" : (opt as Locale))
                }
              }}
              variant="secondary"
              size="small"
              triggerVariant="settings"
            />
            <div style={{ "font-size": "11px", color: "var(--vscode-descriptionForeground)", "margin-top": "4px" }}>
              {language.t("settings.language.current")} {LOCALE_LABELS[language.locale()]}
            </div>
          </div>
        </SettingsRow>

        <SettingsRow
          title={language.t("settings.display.taskTimeline.title")}
          description={language.t("settings.display.taskTimeline.description")}
        >
          <Switch
            checked={showTaskTimeline()}
            onChange={(checked) => {
              setShowTaskTimeline(checked)
              vscode.postMessage({
                type: "updateSetting",
                key: "showTaskTimeline",
                value: checked,
              })
            }}
            hideLabel
          >
            {language.t("settings.display.taskTimeline.title")}
          </Switch>
        </SettingsRow>

        <SettingsRow
          title={language.t("settings.appearance.selectionTip.title")}
          description={language.t("settings.appearance.selectionTip.description")}
          last
        >
          <Switch
            checked={showSelectionTip()}
            onChange={(checked) => {
              setShowSelectionTip(checked)
              vscode.postMessage({
                type: "updateSetting",
                key: "showSelectionTip",
                value: checked,
              })
            }}
            hideLabel
          >
            {language.t("settings.appearance.selectionTip.title")}
          </Switch>
        </SettingsRow>
      </Card>
    </div>
  )
}

export default DisplayTab
