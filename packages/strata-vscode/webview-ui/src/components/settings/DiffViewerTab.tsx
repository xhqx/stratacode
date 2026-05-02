import { Component, createSignal, onCleanup } from "solid-js"
import { Switch } from "@stratacode/strata-ui/switch"
import { Select } from "@stratacode/strata-ui/select"
import { Card } from "@stratacode/strata-ui/card"
import { useVSCode } from "../../context/vscode"
import { useLanguage } from "../../context/language"
import type { ExtensionMessage } from "../../types/messages"
import SettingsRow from "./SettingsRow"

interface SelectOption {
  value: string
  labelKey: string
}

const MODE_OPTIONS: SelectOption[] = [
  { value: "strata", labelKey: "settings.general.row.explainerMode.strata" },
  { value: "native", labelKey: "settings.general.row.explainerMode.native" },
]

const EFFORT_OPTIONS: SelectOption[] = [
  { value: "low", labelKey: "settings.general.row.explainerEffort.low" },
  { value: "medium", labelKey: "settings.general.row.explainerEffort.medium" },
  { value: "high", labelKey: "settings.general.row.explainerEffort.high" },
]

const DiffViewerTab: Component = () => {
  const vscode = useVSCode()
  const language = useLanguage()

  const [mode, setMode] = createSignal<"strata" | "native">("strata")
  const [effort, setEffort] = createSignal<"low" | "medium" | "high">("medium")
  const [autoExplain, setAutoExplain] = createSignal(true)
  const [eager, setEager] = createSignal(false)
  const [instant, setInstant] = createSignal(false)

  const unsubscribe = vscode.onMessage((message: ExtensionMessage) => {
    if (message.type !== "settingLoaded") return
    if (message.key === "explainer.mode") setMode(message.value as "strata" | "native")
    if (message.key === "explainer.effort") setEffort(message.value as "low" | "medium" | "high")
    if (message.key === "explainer.autoExplain") setAutoExplain(message.value as boolean)
    if (message.key === "diff.eagerLoad") setEager(message.value as boolean)
    if (message.key === "diffViewer.instantComments") setInstant(message.value as boolean)
  })
  onCleanup(unsubscribe)

  vscode.postMessage({ type: "requestSetting", key: "explainer.mode" })
  vscode.postMessage({ type: "requestSetting", key: "explainer.effort" })
  vscode.postMessage({ type: "requestSetting", key: "explainer.autoExplain" })
  vscode.postMessage({ type: "requestSetting", key: "diff.eagerLoad" })
  vscode.postMessage({ type: "requestSetting", key: "diffViewer.instantComments" })

  const save = (key: string, value: unknown) => {
    vscode.postMessage({ type: "updateSetting", key, value })
  }

  return (
    <div>
      <Card>
        <SettingsRow
          title={language.t("settings.general.row.explainerMode.title")}
          description={language.t("settings.general.row.explainerMode.description")}
        >
          <Select
            options={MODE_OPTIONS}
            current={MODE_OPTIONS.find((o) => o.value === mode())}
            value={(o) => o.value}
            label={(o) => language.t(o.labelKey)}
            onSelect={(o) => {
              if (!o) return
              const next = o.value as "strata" | "native"
              if (next === mode()) return
              setMode(next)
              save("explainer.mode", next)
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
            options={EFFORT_OPTIONS}
            current={EFFORT_OPTIONS.find((o) => o.value === effort())}
            value={(o) => o.value}
            label={(o) => language.t(o.labelKey)}
            onSelect={(o) => {
              if (!o) return
              const next = o.value as "low" | "medium" | "high"
              if (next === effort()) return
              setEffort(next)
              save("explainer.effort", next)
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
              save("explainer.autoExplain", checked)
            }}
            hideLabel
          >
            {language.t("settings.display.autoExplain.title")}
          </Switch>
        </SettingsRow>

        <SettingsRow
          title={language.t("settings.display.diffEagerLoad.title")}
          description={language.t("settings.display.diffEagerLoad.description")}
        >
          <Switch
            checked={eager()}
            onChange={(checked) => {
              setEager(checked)
              save("diff.eagerLoad", checked)
            }}
            hideLabel
          >
            {language.t("settings.display.diffEagerLoad.title")}
          </Switch>
        </SettingsRow>

        <SettingsRow
          title={language.t("settings.display.diffInstantComments.title")}
          description={language.t("settings.display.diffInstantComments.description")}
          last
        >
          <Switch
            checked={instant()}
            onChange={(checked) => {
              setInstant(checked)
              save("diffViewer.instantComments", checked)
            }}
            hideLabel
          >
            {language.t("settings.display.diffInstantComments.title")}
          </Switch>
        </SettingsRow>
      </Card>
    </div>
  )
}

export default DiffViewerTab
