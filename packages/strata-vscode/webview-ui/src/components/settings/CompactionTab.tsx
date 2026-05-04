import { Component } from "solid-js"
import { Switch } from "@stratacode/strata-ui/switch"
import { Card } from "@stratacode/strata-ui/card"
import { useConfig } from "../../context/config"
import { useLanguage } from "../../context/language"
import SettingsRow from "./SettingsRow"

const CompactionTab: Component = () => {
  const { config, updateConfig } = useConfig()
  const language = useLanguage()

  return (
    <div>
      <Card>
        <SettingsRow
          title={language.t("settings.context.autoCompaction.title")}
          description={language.t("settings.context.autoCompaction.description")}
        >
          <Switch
            checked={config().compaction?.auto ?? false}
            onChange={(checked) => updateConfig({ compaction: { ...config().compaction, auto: checked } })}
            hideLabel
          >
            {language.t("settings.context.autoCompaction.title")}
          </Switch>
        </SettingsRow>
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
          last
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
      </Card>
    </div>
  )
}

export default CompactionTab
