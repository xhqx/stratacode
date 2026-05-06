import { Component, createSignal, onCleanup } from "solid-js"
import { Card } from "@stratacode/strata-ui/card"
import { useVSCode } from "../../context/vscode"
import { useLanguage } from "../../context/language"
import type { ExtensionMessage } from "../../types/messages"
import SettingsRow from "./SettingsRow"

const BackgroundWorkersTab: Component = () => {
  const vscode = useVSCode()
  const language = useLanguage()

  const [pollingInterval, setPollingInterval] = createSignal(5)

  const unsubscribe = vscode.onMessage((message: ExtensionMessage) => {
    if (message.type !== "settingLoaded") return
    if (message.key === "workers.pollingIntervalSec") setPollingInterval(message.value as number)
  })
  onCleanup(unsubscribe)

  vscode.postMessage({ type: "requestSetting", key: "workers.pollingIntervalSec" })

  const save = (key: string, value: unknown) => {
    vscode.postMessage({ type: "updateSetting", key, value })
  }

  return (
    <div style={{ display: "flex", "flex-direction": "column", gap: "16px" }}>
      {/* Info text */}
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
          {language.t("settings.workers.description")}
        </p>
      </div>

      <Card>
        <SettingsRow
          title={language.t("settings.workers.pollingIntervalSec.title")}
          description={language.t("settings.workers.pollingIntervalSec.description")}
          last
        >
          <input
            type="number"
            min="1"
            style={{
              width: "60px",
              padding: "4px 8px",
              background: "var(--vscode-input-background)",
              color: "var(--vscode-input-foreground)",
              border: "1px solid var(--vscode-input-border)",
              "border-radius": "2px",
            }}
            value={pollingInterval()}
            onInput={(e) => {
              const val = parseInt(e.currentTarget.value)
              if (!isNaN(val) && val > 0) {
                setPollingInterval(val)
                save("workers.pollingIntervalSec", val)
              }
            }}
          />
        </SettingsRow>
      </Card>
    </div>
  )
}

export default BackgroundWorkersTab
