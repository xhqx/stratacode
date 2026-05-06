import { Component, createSignal, createEffect } from "solid-js"
import { Card } from "@stratacode/strata-ui/card"
import SettingsRow from "./SettingsRow"
import { useConfig } from "../../context/config"
import { useLanguage } from "../../context/language"

const RetriesTab: Component = () => {
  const language = useLanguage()
  const { config, updateConfig } = useConfig()

  const [retryLimit, setRetryLimit] = createSignal(2)
  const [retryDelay, setRetryDelay] = createSignal(2)
  const [retryMaxDelay, setRetryMaxDelay] = createSignal(60)

  // Sync from CLI config
  createEffect(() => {
    const cfg = config()
    const r = (cfg as Record<string, unknown>).retry as
      | {
          limit?: number
          delay?: number
          max_delay?: number
        }
      | undefined
    if (r) {
      if (typeof r.limit === "number") setRetryLimit(r.limit)
      if (typeof r.delay === "number") setRetryDelay(r.delay)
      if (typeof r.max_delay === "number") setRetryMaxDelay(r.max_delay)
    }
  })

  return (
    <div>
      <Card>
        <SettingsRow
          title={language.t("settings.retries.limit.title") || "Limit (attempts)"}
          description={language.t("settings.retries.limit.description") || "Maximum number of retry attempts"}
        >
          <input
            type="number"
            min={0}
            max={10}
            value={retryLimit()}
            style={{
              width: "60px",
              padding: "4px 8px",
              border: "1px solid var(--vscode-input-border, #3c3c3c)",
              background: "var(--vscode-input-background, #1e1e1e)",
              color: "var(--vscode-input-foreground, #cccccc)",
              "border-radius": "4px",
              "font-size": "13px",
            }}
            onChange={(e) => {
              const val = parseInt(e.currentTarget.value, 10)
              if (isNaN(val)) return
              const clamped = Math.max(0, Math.min(10, val))
              setRetryLimit(clamped)
              updateConfig({ retry: { limit: clamped } } as Record<string, unknown>)
            }}
          />
        </SettingsRow>

        <SettingsRow
          title={language.t("settings.retries.delay.title") || "Base Delay (seconds)"}
          description={language.t("settings.retries.delay.description") || "Initial delay before first retry"}
        >
          <input
            type="number"
            min={1}
            max={60}
            value={retryDelay()}
            style={{
              width: "60px",
              padding: "4px 8px",
              border: "1px solid var(--vscode-input-border, #3c3c3c)",
              background: "var(--vscode-input-background, #1e1e1e)",
              color: "var(--vscode-input-foreground, #cccccc)",
              "border-radius": "4px",
              "font-size": "13px",
            }}
            onChange={(e) => {
              const val = parseInt(e.currentTarget.value, 10)
              if (isNaN(val)) return
              const clamped = Math.max(1, Math.min(60, val))
              setRetryDelay(clamped)
              updateConfig({ retry: { delay: clamped } } as Record<string, unknown>)
            }}
          />
        </SettingsRow>

        <SettingsRow
          title={language.t("settings.retries.maxDelay.title") || "Max Delay Cap (seconds)"}
          description={language.t("settings.retries.maxDelay.description") || "Maximum delay between retries"}
          last
        >
          <input
            type="number"
            min={1}
            max={300}
            value={retryMaxDelay()}
            style={{
              width: "60px",
              padding: "4px 8px",
              border: "1px solid var(--vscode-input-border, #3c3c3c)",
              background: "var(--vscode-input-background, #1e1e1e)",
              color: "var(--vscode-input-foreground, #cccccc)",
              "border-radius": "4px",
              "font-size": "13px",
            }}
            onChange={(e) => {
              const val = parseInt(e.currentTarget.value, 10)
              if (isNaN(val)) return
              const clamped = Math.max(1, Math.min(300, val))
              setRetryMaxDelay(clamped)
              updateConfig({ retry: { max_delay: clamped } } as Record<string, unknown>)
            }}
          />
        </SettingsRow>
      </Card>
    </div>
  )
}

export default RetriesTab
