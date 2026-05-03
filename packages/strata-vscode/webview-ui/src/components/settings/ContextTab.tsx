import { Component, For, createSignal } from "solid-js"
import { Switch } from "@stratacode/strata-ui/switch"
import { TextField } from "@stratacode/strata-ui/text-field"
import { Card } from "@stratacode/strata-ui/card"
import { Button } from "@stratacode/strata-ui/button"
import { IconButton } from "@stratacode/strata-ui/icon-button"

import { useConfig } from "../../context/config"
import { useLanguage } from "../../context/language"
import SettingsRow from "./SettingsRow"

const ContextTab: Component = () => {
  const { config, updateConfig } = useConfig()
  const language = useLanguage()
  const [newPattern, setNewPattern] = createSignal("")

  const patterns = () => config().watcher?.ignore ?? []

  const addPattern = () => {
    const value = newPattern().trim()
    if (!value) return
    const current = [...patterns()]
    if (!current.includes(value)) {
      current.push(value)
      updateConfig({ watcher: { ignore: current } })
    }
    setNewPattern("")
  }

  const removePattern = (index: number) => {
    const current = [...patterns()]
    current.splice(index, 1)
    updateConfig({ watcher: { ignore: current } })
  }

  return (
    <div>
      {/* Compaction settings */}
      <Card>
        <SettingsRow
          title={language.t("settings.context.prune.title")}
          description={language.t("settings.context.prune.description")}
        >
          <Switch
            checked={config().compaction?.prune ?? false}
            onChange={(checked) => updateConfig({ compaction: { ...config().compaction, prune: checked } })}
            hideLabel
          >
            {language.t("settings.context.prune.title")}
          </Switch>
        </SettingsRow>
        <SettingsRow
          title={language.t("settings.context.compactionThreshold.title")}
          description={language.t("settings.context.compactionThreshold.description")}
        >
          <div style={{ display: "flex", "align-items": "center", gap: "8px" }}>
            <input
              id="compaction-threshold-range"
              type="range"
              min="10"
              max="100"
              step="5"
              value={config().compaction?.threshold_percent ?? 100}
              onInput={(e) => {
                const val = parseInt((e.target as HTMLInputElement).value, 10)
                updateConfig({ compaction: { ...config().compaction, threshold_percent: val } })
              }}
              style={{
                flex: 1,
                "accent-color": "var(--vscode-focusBorder)",
                cursor: "pointer",
              }}
            />
            <span
              style={{
                "min-width": "36px",
                "text-align": "right",
                "font-size": "13px",
                "font-variant-numeric": "tabular-nums",
              }}
            >
              {config().compaction?.threshold_percent ?? 100}%
            </span>
          </div>
        </SettingsRow>
        <SettingsRow
          title={language.t("settings.experimental.lsp.title")}
          description={language.t("settings.experimental.lsp.description")}
        >
          <Switch
            checked={config().lsp !== false}
            onChange={(checked) => updateConfig({ lsp: checked ? {} : false })}
            hideLabel
          >
            {language.t("settings.experimental.lsp.title")}
          </Switch>
        </SettingsRow>
        <SettingsRow
          title={language.t("settings.experimental.pasteSummary.title")}
          description={language.t("settings.experimental.pasteSummary.description")}
          last
        >
          <Switch
            checked={config().experimental?.disable_paste_summary ?? false}
            onChange={(checked) =>
              updateConfig({ experimental: { ...(config().experimental ?? {}), disable_paste_summary: checked } })
            }
            hideLabel
          >
            {language.t("settings.experimental.pasteSummary.title")}
          </Switch>
        </SettingsRow>
      </Card>

      <h4 style={{ "margin-top": "16px", "margin-bottom": "8px" }}>{language.t("settings.context.watcherPatterns")}</h4>

      <Card>
        <div
          style={{
            "font-size": "12px",
            color: "var(--text-weak-base, var(--vscode-descriptionForeground))",
            "padding-bottom": "8px",
            "border-bottom": patterns().length > 0 || newPattern() ? "1px solid var(--border-weak-base)" : "none",
          }}
        >
          {language.t("settings.context.watcherPatterns.description")}
        </div>

        {/* Add new pattern */}
        <div
          style={{
            display: "flex",
            gap: "8px",
            "align-items": "center",
            padding: "8px 0",
            "border-bottom": patterns().length > 0 ? "1px solid var(--border-weak-base)" : "none",
          }}
        >
          <div style={{ flex: 1 }}>
            <TextField
              value={newPattern()}
              placeholder="e.g. **/node_modules/**"
              onChange={(val) => setNewPattern(val)}
              onKeyDown={(e: KeyboardEvent) => {
                if (e.key === "Enter") addPattern()
              }}
            />
          </div>
          <Button variant="secondary" onClick={addPattern}>
            {language.t("common.add")}
          </Button>
        </div>

        {/* Pattern list */}
        <For each={patterns()}>
          {(pattern, index) => (
            <div
              style={{
                display: "flex",
                "align-items": "center",
                "justify-content": "space-between",
                padding: "6px 0",
                "border-bottom": index() < patterns().length - 1 ? "1px solid var(--border-weak-base)" : "none",
              }}
            >
              <span
                style={{
                  "font-family": "var(--vscode-editor-font-family, monospace)",
                  "font-size": "12px",
                }}
              >
                {pattern}
              </span>
              <IconButton size="small" variant="ghost" icon="close" onClick={() => removePattern(index())} />
            </div>
          )}
        </For>
      </Card>
    </div>
  )
}

export default ContextTab
