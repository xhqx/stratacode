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

interface LayoutOption {
  value: string
  labelKey: string
}

const LAYOUT_OPTIONS: LayoutOption[] = [
  { value: "auto", labelKey: "settings.display.layout.auto" },
  { value: "stretch", labelKey: "settings.display.layout.stretch" },
]

const EXPLAINER_MODE_OPTIONS: LayoutOption[] = [
  { value: "strata", labelKey: "settings.general.row.explainerMode.strata" },
  { value: "native", labelKey: "settings.general.row.explainerMode.native" },
]

const EXPLAINER_EFFORT_OPTIONS: LayoutOption[] = [
  { value: "low", labelKey: "settings.general.row.explainerEffort.low" },
  { value: "medium", labelKey: "settings.general.row.explainerEffort.medium" },
  { value: "high", labelKey: "settings.general.row.explainerEffort.high" },
]

const DisplayTab: Component = () => {
  const { config, updateConfig } = useConfig()
  const language = useLanguage()
  const vscode = useVSCode()

  const [showTaskTimeline, setShowTaskTimeline] = createSignal(false)
  const [explainerMode, setExplainerMode] = createSignal<"strata" | "native">("strata")
  const [explainerEffort, setExplainerEffort] = createSignal<"low" | "medium" | "high">("medium")
  const [autoExplain, setAutoExplain] = createSignal(true)

  const unsubscribe = vscode.onMessage((message: ExtensionMessage) => {
    if (message.type === "timelineSettingLoaded") {
      setShowTaskTimeline(message.visible)
    } else if (message.type === "settingLoaded" && message.key === "explainer.mode") {
      setExplainerMode(message.value as "strata" | "native")
    } else if (message.type === "settingLoaded" && message.key === "explainer.effort") {
      setExplainerEffort(message.value as "low" | "medium" | "high")
    } else if (message.type === "settingLoaded" && message.key === "explainer.autoExplain") {
      setAutoExplain(message.value as boolean)
    }
  })
  onCleanup(unsubscribe)
  vscode.postMessage({ type: "requestTimelineSetting" })
  vscode.postMessage({ type: "requestSetting", key: "explainer.mode" })
  vscode.postMessage({ type: "requestSetting", key: "explainer.effort" })
  vscode.postMessage({ type: "requestSetting", key: "explainer.autoExplain" })

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
          title={language.t("settings.general.row.explainerMode.title")}
          description={language.t("settings.general.row.explainerMode.description")}
        >
          <Select
            options={EXPLAINER_MODE_OPTIONS}
            current={EXPLAINER_MODE_OPTIONS.find((o) => o.value === explainerMode())}
            value={(o) => o.value}
            label={(o) => language.t(o.labelKey)}
            onSelect={(o) => {
              if (!o) return
              const next = o.value as "strata" | "native"
              if (next === explainerMode()) return
              setExplainerMode(next)
              vscode.postMessage({ type: "updateSetting", key: "explainer.mode", value: next })
            }}
            variant="secondary"
            size="small"
            triggerVariant="settings"
          />
        </SettingsRow>

        <SettingsRow
          title={language.t("settings.general.row.explainerEffort.title")}
          description={language.t("settings.general.row.explainerEffort.description")}
        >
          <Select
            options={EXPLAINER_EFFORT_OPTIONS}
            current={EXPLAINER_EFFORT_OPTIONS.find((o) => o.value === explainerEffort())}
            value={(o) => o.value}
            label={(o) => language.t(o.labelKey)}
            onSelect={(o) => {
              if (!o) return
              const next = o.value as "low" | "medium" | "high"
              if (next === explainerEffort()) return
              setExplainerEffort(next)
              vscode.postMessage({ type: "updateSetting", key: "explainer.effort", value: next })
            }}
            variant="secondary"
            size="small"
            triggerVariant="settings"
          />
        </SettingsRow>

        <SettingsRow
          title={language.t("settings.display.autoExplain.title")}
          description={language.t("settings.display.autoExplain.description")}
        >
          <Switch
            checked={autoExplain()}
            onChange={(checked) => {
              setAutoExplain(checked)
              vscode.postMessage({
                type: "updateSetting",
                key: "explainer.autoExplain",
                value: checked,
              })
            }}
            hideLabel
          >
            {language.t("settings.display.autoExplain.title")}
          </Switch>
        </SettingsRow>

        <SettingsRow
          title={language.t("settings.display.taskTimeline.title")}
          description={language.t("settings.display.taskTimeline.description")}
          last
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
      </Card>
    </div>
  )
}

export default DisplayTab
