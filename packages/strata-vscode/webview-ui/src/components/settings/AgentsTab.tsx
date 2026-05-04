import { Component, createSignal, createEffect, Show } from "solid-js"
import { useLanguage } from "../../context/language"

import ModelsTab from "./ModelsTab"
import AgentBehaviourTab from "./AgentBehaviourTab"
import AutoApproveTab from "./AutoApproveTab"

export interface AgentsTabProps {
  initialTab?: string
}

const tabs = ["models", "agents", "autoApprove"] as const
type AgentTab = (typeof tabs)[number]

const AgentsTab: Component<AgentsTabProps> = (props) => {
  const language = useLanguage()

  const resolve = (tab?: string): AgentTab => {
    if (tab === "models") return "models"
    if (tab === "agentBehaviour") return "models"
    if (tab === "agents") return "agents"
    if (tab === "autoApprove") return "autoApprove"
    if (tab && (tabs as readonly string[]).includes(tab)) return tab as AgentTab
    return "models"
  }

  const [active, setActive] = createSignal<AgentTab>(resolve(props.initialTab))

  createEffect(() => {
    if (props.initialTab) setActive(resolve(props.initialTab))
  })

  const label = (tab: AgentTab) => {
    const keys: Record<AgentTab, string> = {
      models: "settings.agentBehaviour.subtab.models",
      agents: "settings.agentBehaviour.subtab.agents",
      autoApprove: "settings.agentBehaviour.subtab.autoApprove",
    }
    return language.t(keys[tab])
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
          <ModelsTab />
        </Show>
        <Show when={active() === "agents"}>
          <AgentBehaviourTab />
        </Show>
        <Show when={active() === "autoApprove"}>
          <AutoApproveTab />
        </Show>
      </div>
    </div>
  )
}

export default AgentsTab
