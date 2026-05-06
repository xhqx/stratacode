import { Component } from "solid-js"
import { Switch } from "@stratacode/strata-ui/switch"
import { useConfig } from "../../context/config"
import { useLanguage } from "../../context/language"

const clamp = (val: number): number => (val > 0 && val < 1 ? 1 : val)

const AutoApproveSettingsTab: Component = () => {
  const { config, updateConfig } = useConfig()
  const language = useLanguage()

  return (
    <div data-component="auto-approve-settings">
      <div style={{ display: "flex", "align-items": "center", gap: "12px", "margin-bottom": "8px" }}>
        <label style={{ "font-size": "13px", color: "var(--text-base, var(--vscode-foreground))", flex: 1 }}>
          Auto-approve timeout (seconds)
        </label>
        <input
          type="number"
          style={{
            width: "80px",
            padding: "4px 8px",
            "background-color": "var(--vscode-input-background)",
            color: "var(--vscode-input-foreground)",
            border: "1px solid var(--vscode-input-border)",
          }}
          value={config().auto_approve?.timeout ?? 0}
          min="0"
          step="1"
          max="300"
          onChange={(e) => updateConfig({ auto_approve: { timeout: clamp(Number(e.currentTarget.value)) } })}
        />
      </div>
      <div style={{ display: "flex", "align-items": "center", gap: "12px" }}>
        <label style={{ "font-size": "13px", color: "var(--text-base, var(--vscode-foreground))", flex: 1 }}>
          Auto-answer question timeout (seconds)
        </label>
        <input
          type="number"
          style={{
            width: "80px",
            padding: "4px 8px",
            "background-color": "var(--vscode-input-background)",
            color: "var(--vscode-input-foreground)",
            border: "1px solid var(--vscode-input-border)",
          }}
          value={config().auto_approve?.question_timeout ?? 0}
          min="0"
          step="1"
          max="300"
          onChange={(e) => updateConfig({ auto_approve: { question_timeout: clamp(Number(e.currentTarget.value)) } })}
        />
      </div>
      <div style={{ display: "flex", "align-items": "center", gap: "12px", "margin-top": "8px" }}>
        <label style={{ "font-size": "13px", color: "var(--text-base, var(--vscode-foreground))", flex: 1 }}>
          {language.t("settings.experimental.continueOnDeny.title")}
        </label>
        <Switch
          checked={config().experimental?.continue_loop_on_deny ?? false}
          onChange={(checked) =>
            updateConfig({ experimental: { ...(config().experimental ?? {}), continue_loop_on_deny: checked } })
          }
          hideLabel
        >
          {language.t("settings.experimental.continueOnDeny.title")}
        </Switch>
      </div>
    </div>
  )
}

export default AutoApproveSettingsTab
