import { Component, createSignal, createEffect } from "solid-js"
import { Card } from "@stratacode/strata-ui/card"
import { Switch } from "@stratacode/strata-ui/switch"
import SettingsRow from "./SettingsRow"
import { useConfig } from "../../context/config"
import { useLanguage } from "../../context/language"

const RemoteControlTab: Component = () => {
  const language = useLanguage()
  const { config, updateConfig } = useConfig()

  const [remoteControl, setRemoteControl] = createSignal(false)
  const [activeRemote, setActiveRemote] = createSignal(false)

  // Sync from CLI config
  createEffect(() => {
    const cfg = config()
    if (typeof (cfg as Record<string, unknown>).remote_control === "boolean") {
      setRemoteControl((cfg as Record<string, unknown>).remote_control as boolean)
    }
  })

  // Poll for active remote sessions
  createEffect(() => {
    const checkRemote = async () => {
      try {
        const res = await fetch("/api/remote")
        if (res.ok) {
          const data = await res.json()
          setActiveRemote(data.active)
        }
      } catch (e) {
        // Ignore fetch errors during polling
      }
    }

    checkRemote()
    const interval = setInterval(checkRemote, 5000)
    return () => clearInterval(interval)
  })

  return (
    <div>
      <Card>
        <SettingsRow
          title={language.t("settings.experimental.remote.title")}
          description={language.t("settings.experimental.remote.description")}
        >
          <div style={{ display: "flex", "flex-direction": "column", gap: "12px" }}>
            <div style={{ display: "flex", "align-items": "center", gap: "8px" }}>
              <span style={{ color: "var(--vscode-descriptionForeground)" }}>
                {language.t("settings.experimental.remote.current")}
              </span>
              <span
                style={{
                  color: activeRemote() ? "var(--vscode-testing-iconPassed)" : "var(--vscode-descriptionForeground)",
                  "font-weight": activeRemote() ? "600" : "normal",
                }}
              >
                {activeRemote()
                  ? language.t("settings.experimental.remote.active")
                  : language.t("settings.experimental.remote.inactive")}
              </span>
              <span
                style={{ color: "var(--vscode-descriptionForeground)", "margin-left": "8px", "font-size": "0.9em" }}
              >
                ({language.t("settings.experimental.remote.hint")})
              </span>
            </div>

            <div style={{ display: "flex", "align-items": "center", gap: "8px" }}>
              <span style={{ color: "var(--vscode-descriptionForeground)" }}>
                {language.t("settings.experimental.remote.startup")}
              </span>
              <Switch
                checked={remoteControl()}
                onChange={(checked) => {
                  setRemoteControl(checked)
                  updateConfig({ remote_control: checked } as Record<string, unknown>)
                }}
                hideLabel
              >
                {language.t("settings.experimental.remote.title")}
              </Switch>
            </div>
          </div>
        </SettingsRow>
      </Card>
    </div>
  )
}

export default RemoteControlTab
