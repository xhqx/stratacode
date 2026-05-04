import { useConfig } from "../../context/config"
import { useLanguage } from "../../context/language"
import { Card } from "@stratacode/strata-ui/card"
import SettingsRow from "./SettingsRow"
import { Switch } from "@stratacode/strata-ui/switch"

export default function LspTab() {
  const { config, updateConfig } = useConfig()
  const language = useLanguage()

  return (
    <div style={{ padding: "16px", "overflow-y": "auto", height: "100%" }}>
      <h3 style={{ "margin-bottom": "16px" }}>Language Server Protocol</h3>
      <Card>
        <div style={{ padding: "16px", color: "var(--foreground-muted)" }}>
          {language.t("settings.experimental.lsp.description") ||
            "LSP integration is enabled via the Features tab. Configuration for specific language servers will be added here."}
        </div>
      </Card>
    </div>
  )
}
