import { Component, createSignal, createEffect } from "solid-js"
import { Card } from "@stratacode/strata-ui/card"
import { Select } from "@stratacode/strata-ui/select"
import SettingsRow from "./SettingsRow"
import { useConfig } from "../../context/config"
import { useLanguage } from "../../context/language"

const SessionSharingTab: Component = () => {
  const language = useLanguage()
  const { config, updateConfig } = useConfig()

  const [shareMode, setShareMode] = createSignal<"manual" | "auto" | "disabled">("manual")

  // Sync from CLI config
  createEffect(() => {
    const cfg = config()
    if (typeof (cfg as Record<string, unknown>).share === "string") {
      const mode = (cfg as Record<string, unknown>).share as "manual" | "auto" | "disabled"
      if (["manual", "auto", "disabled"].includes(mode)) {
        setShareMode(mode)
      }
    }
  })

  return (
    <div>
      <Card>
        <SettingsRow
          title={language.t("settings.experimental.share.title")}
          description={language.t("settings.experimental.share.description")}
        >
          <Select
            options={[
              { value: "manual", label: language.t("settings.experimental.share.manual") || "Manual" },
              { value: "auto", label: language.t("settings.experimental.share.auto") || "Auto" },
              { value: "disabled", label: language.t("settings.experimental.share.disabled") || "Disabled" },
            ]}
            current={{
              value: shareMode(),
              label:
                shareMode() === "manual"
                  ? language.t("settings.experimental.share.manual") || "Manual"
                  : shareMode() === "auto"
                    ? language.t("settings.experimental.share.auto") || "Auto"
                    : language.t("settings.experimental.share.disabled") || "Disabled",
            }}
            value={(o) => o.value}
            label={(o) => o.label}
            onSelect={(o) => {
              if (o) {
                setShareMode(o.value as "manual" | "auto" | "disabled")
                updateConfig({ share: o.value as "manual" | "auto" | "disabled" })
              }
            }}
            variant="secondary"
            size="small"
            triggerVariant="settings"
          />
        </SettingsRow>
      </Card>
    </div>
  )
}

export default SessionSharingTab
