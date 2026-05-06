import { Component, createSignal, createEffect, Show } from "solid-js"
import { useLanguage } from "../../context/language"

import ModelProvidersTab from "./ModelProvidersTab"
import AcpProvidersTab from "./AcpProvidersTab"

export interface ProvidersTabProps {
  initialTab?: string
}

const tabs = ["models", "acp"] as const
type ProviderTab = (typeof tabs)[number]

const ProvidersTab: Component<ProvidersTabProps> = (props) => {
  const language = useLanguage()

  const resolve = (tab?: string): ProviderTab => {
    if (tab === "models" || tab === "acp") return tab
    return "models"
  }

  const [active, setActive] = createSignal<ProviderTab>(resolve(props.initialTab))

  createEffect(() => {
    if (props.initialTab) setActive(resolve(props.initialTab))
  })

  const label = (tab: ProviderTab) => {
    if (tab === "models") return language.t("settings.providers.subtab.models") || "LLM Providers"
    if (tab === "acp") return language.t("settings.providers.subtab.acp") || "ACP Connections"
    return tab
  }

  return (
    <div style={{ display: "flex", "flex-direction": "column", flex: 1, "min-height": 0 }}>
      {/* Tab bar */}
      <div
        style={{
          display: "flex",
          gap: "0",
          "border-bottom": "1px solid var(--border-weak-base)",
          "margin-bottom": "16px",
          "flex-shrink": "0",
        }}
      >
        {tabs.map((tab) => (
          <button
            type="button"
            onClick={() => setActive(tab)}
            style={{
              padding: "8px 16px",
              background: "none",
              border: "none",
              "border-bottom": `2px solid ${active() === tab ? "var(--icon-strong-base, var(--vscode-focusBorder))" : "transparent"}`,
              color:
                active() === tab
                  ? "var(--text-strong, var(--vscode-foreground))"
                  : "var(--text-weak-base, var(--vscode-descriptionForeground))",
              "font-size": "13px",
              "font-weight": active() === tab ? "500" : "400",
              cursor: "pointer",
              "font-family": "inherit",
              transition: "color 120ms ease, border-color 120ms ease",
            }}
          >
            {label(tab)}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: "auto", "min-height": 0 }}>
        <Show when={active() === "models"}>
          <ModelProvidersTab />
        </Show>
        <Show when={active() === "acp"}>
          <AcpProvidersTab />
        </Show>
      </div>
    </div>
  )
}

export default ProvidersTab
