import { Component, createSignal, onCleanup } from "solid-js"
import { Switch } from "@stratacode/strata-ui/switch"
import { Card } from "@stratacode/strata-ui/card"
import { useVSCode } from "../../context/vscode"
import { useLanguage } from "../../context/language"
import type { ExtensionMessage } from "../../types/messages"
import SettingsRow from "./SettingsRow"

const ExplainerWorkerTab: Component = () => {
  const vscode = useVSCode()
  const language = useLanguage()

  const [autoExplain, setAutoExplain] = createSignal(false)

  const unsubscribe = vscode.onMessage((message: ExtensionMessage) => {
    if (message.type !== "settingLoaded") return
    if (message.key === "workers.autoExplain") setAutoExplain(message.value as boolean)
  })
  onCleanup(unsubscribe)

  vscode.postMessage({ type: "requestSetting", key: "workers.autoExplain" })

  const save = (key: string, value: unknown) => {
    vscode.postMessage({ type: "updateSetting", key, value })
  }

  return (
    <div style={{ display: "flex", "flex-direction": "column", gap: "16px" }}>
      <div
        style={{
          background: "var(--vscode-textBlockQuote-background)",
          border: "1px solid var(--vscode-panel-border)",
          "border-radius": "4px",
          padding: "12px 16px",
        }}
      >
        <p
          style={{
            "font-size": "12px",
            color: "var(--vscode-descriptionForeground)",
            margin: 0,
            "line-height": "1.5",
          }}
        >
          The explainer worker automatically analyzes changes when you save files and maintains an up-to-date
          understanding of your code.
        </p>
      </div>

      <Card>
        <SettingsRow
          title={language.t("settings.workers.autoExplain.title")}
          description={language.t("settings.workers.autoExplain.description")}
          last
        >
          <Switch
            checked={autoExplain()}
            onChange={(checked: boolean) => {
              setAutoExplain(checked)
              save("workers.autoExplain", checked)
            }}
            hideLabel
          >
            {language.t("settings.workers.autoExplain.title")}
          </Switch>
        </SettingsRow>
      </Card>
    </div>
  )
}

export default ExplainerWorkerTab
