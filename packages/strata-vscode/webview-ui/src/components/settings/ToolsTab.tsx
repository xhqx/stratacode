import { Component, createSignal, createEffect, Show } from "solid-js"
import { useLanguage } from "../../context/language"

import McpServersTab from "./McpServersTab"
import RulesTab from "./RulesTab"
import WorkflowsTab from "./agent-behaviour/WorkflowsTab"
import SkillsTab from "./SkillsTab"

export interface ToolsTabProps {
  initialTab?: string
}

const tabs = ["mcpServers", "rules", "workflows", "skills"] as const
type ToolTab = (typeof tabs)[number]

const ToolsTab: Component<ToolsTabProps> = (props) => {
  const language = useLanguage()

  const resolve = (tab?: string): ToolTab => {
    if (tab && (tabs as readonly string[]).includes(tab)) return tab as ToolTab
    return "mcpServers"
  }

  const [active, setActive] = createSignal<ToolTab>(resolve(props.initialTab))

  createEffect(() => {
    if (props.initialTab) setActive(resolve(props.initialTab))
  })

  const label = (tab: ToolTab) => {
    const keys: Record<ToolTab, string> = {
      mcpServers: "settings.agentBehaviour.subtab.mcpServers",
      rules: "settings.agentBehaviour.subtab.rules",
      workflows: "settings.agentBehaviour.subtab.workflows",
      skills: "settings.agentBehaviour.subtab.skills",
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
        <Show when={active() === "mcpServers"}>
          <McpServersTab />
        </Show>
        <Show when={active() === "rules"}>
          <RulesTab />
        </Show>
        <Show when={active() === "workflows"}>
          <WorkflowsTab />
        </Show>
        <Show when={active() === "skills"}>
          <SkillsTab />
        </Show>
      </div>
    </div>
  )
}

export default ToolsTab
