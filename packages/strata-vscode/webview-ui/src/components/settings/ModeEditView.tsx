import { Component, Show, For, createMemo, createSignal, createEffect } from "solid-js"
import { IconButton } from "@stratacode/strata-ui/icon-button"
import { Button } from "@stratacode/strata-ui/button"

import { useConfig } from "../../context/config"
import { useSession } from "../../context/session"
import { useLanguage } from "../../context/language"
import { useVSCode } from "../../context/vscode"
import type { AgentConfig, AgentInfo } from "../../types/messages"
import { buildExport } from "./mode-io"

import { GeneralTab } from "./ModeEditTabs"
import { PromptTab } from "./ModePromptTab"
import { PermissionsTab } from "./ModePermissionsTab"
import { FeaturesTab } from "./ModeFeaturesTab"

interface Props {
  name: string
  onBack: () => void
  onRemove: (agent: AgentInfo) => void
}

const ModeEditView: Component<Props> = (props) => {
  const language = useLanguage()
  const { config, updateConfig } = useConfig()
  const session = useSession()
  const vscode = useVSCode()

  const agent = () => session.allAgents().find((a) => a.name === props.name)
  const native = () => agent()?.native ?? false

  const cfg = createMemo<AgentConfig>(() => config().agent?.[props.name] ?? {})

  const update = (partial: Partial<AgentConfig>) => {
    const existing = config().agent ?? {}
    const current = existing[props.name] ?? {}
    updateConfig({
      agent: {
        ...existing,
        [props.name]: { ...current, ...partial },
      },
    })
  }

  const exportMode = () => {
    const data = buildExport(props.name, cfg())
    const json = JSON.stringify(data, null, 2)
    const blob = new Blob([json], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement("a")
    anchor.href = url
    anchor.download = `${props.name}.agent.json`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  const [activeTab, setActiveTab] = createSignal("general")

  const hasFeaturesTab = createMemo(() => props.name === "autocomplete" || props.name === "commit")

  createEffect(() => {
    if (activeTab() === "features" && !hasFeaturesTab()) {
      setActiveTab("general")
    }
  })

  const tabContext = {
    name: props.name,
    cfg,
    native,
    update,
    t: language.t as any,
  }

  return (
    <div>
      <div
        style={{
          display: "flex",
          "align-items": "center",
          "justify-content": "space-between",
          "margin-bottom": "16px",
        }}
      >
        <div style={{ display: "flex", "align-items": "center" }}>
          <IconButton size="small" variant="ghost" icon="arrow-left" onClick={props.onBack} />
          <span style={{ "font-weight": "600", "font-size": "14px", "margin-left": "8px" }}>
            {language.t("settings.agentBehaviour.editMode")} — {props.name}
          </span>
        </div>
        <Show when={!native()}>
          <div style={{ display: "flex", gap: "4px" }}>
            <IconButton
              size="small"
              variant="ghost"
              icon="download"
              title={language.t("settings.agentBehaviour.exportMode")}
              onClick={exportMode}
            />
            <IconButton
              size="small"
              variant="ghost"
              icon="close"
              onClick={() => {
                const a = agent()
                if (a) props.onRemove(a)
              }}
            />
          </div>
        </Show>
      </div>

      <div
        style={{
          display: "flex",
          gap: "0",
          "border-bottom": "1px solid var(--vscode-panel-border)",
          "margin-bottom": "16px",
        }}
      >
        <For
          each={[
            { id: "general", label: language.t("settings.agentBehaviour.editMode.tab.general") || "General" },
            { id: "prompt", label: language.t("settings.agentBehaviour.editMode.tab.prompt") || "Prompt" },
            {
              id: "permissions",
              label: language.t("settings.agentBehaviour.editMode.tab.permissions") || "Permissions",
            },
            ...(hasFeaturesTab()
              ? [
                  {
                    id: "features",
                    label: language.t("settings.agentBehaviour.editMode.tab.features") || "Agent-Specific",
                  },
                ]
              : []),
          ]}
        >
          {(tab) => (
            <button
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: "8px 16px",
                border: "none",
                background: "transparent",
                color:
                  activeTab() === tab.id
                    ? "var(--vscode-tab-activeForeground)"
                    : "var(--vscode-tab-inactiveForeground)",
                "border-bottom":
                  activeTab() === tab.id ? "2px solid var(--vscode-tab-activeBorder)" : "2px solid transparent",
                cursor: "pointer",
                "font-size": "12px",
                "text-transform": "uppercase",
                "font-weight": activeTab() === tab.id ? "600" : "normal",
              }}
            >
              {tab.label}
            </button>
          )}
        </For>
      </div>

      <Show when={activeTab() === "general"}>
        <GeneralTab {...tabContext} config={() => config() as any} updateConfig={updateConfig} />
      </Show>

      <Show when={activeTab() === "prompt"}>
        <PromptTab {...tabContext} />
      </Show>

      <Show when={activeTab() === "permissions"}>
        <PermissionsTab {...tabContext} agentData={agent} />
      </Show>

      <Show when={hasFeaturesTab() && activeTab() === "features"}>
        <FeaturesTab {...tabContext} config={() => config() as any} updateConfig={updateConfig} />
      </Show>

      <div style={{ display: "flex", "justify-content": "flex-end" }}>
        <Button variant="ghost" onClick={props.onBack}>
          {language.t("settings.agentBehaviour.editMode.back")}
        </Button>
      </div>
    </div>
  )
}

export default ModeEditView
