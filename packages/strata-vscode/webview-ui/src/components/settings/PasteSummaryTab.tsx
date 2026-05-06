import { useConfig } from "../../context/config"
import { useLanguage } from "../../context/language"
import { Card } from "@stratacode/strata-ui/card"
import SettingsRow from "./SettingsRow"
import { Switch } from "@stratacode/strata-ui/switch"

export default function PasteSummaryTab() {
  const { config, updateConfig } = useConfig()
  const language = useLanguage()

  return (
    <div style={{ "overflow-y": "auto", height: "100%" }}>
      <Card>
        <SettingsRow
          title={language.t("settings.experimental.pasteSummary.title") || "Paste Summary"}
          description={
            language.t("settings.experimental.pasteSummary.description") || "Enable experimental paste summarization."
          }
          last
        >
          <Switch
            checked={!(config().experimental?.disable_paste_summary ?? false)}
            onChange={(checked: boolean) =>
              updateConfig({ experimental: { ...(config().experimental ?? {}), disable_paste_summary: !checked } })
            }
            hideLabel
          >
            {language.t("settings.experimental.pasteSummary.title") || "Paste Summary"}
          </Switch>
        </SettingsRow>
      </Card>
    </div>
  )
}
