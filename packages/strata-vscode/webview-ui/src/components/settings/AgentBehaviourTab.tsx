import { Component, createSignal, createMemo, For, Show } from "solid-js"
import { Select } from "@stratacode/strata-ui/select"
import { Card } from "@stratacode/strata-ui/card"
import { Button } from "@stratacode/strata-ui/button"
import { IconButton } from "@stratacode/strata-ui/icon-button"
import { Dialog } from "@stratacode/strata-ui/dialog"
import { useDialog } from "@stratacode/strata-ui/context/dialog"

import { useConfig } from "../../context/config"
import { useSession } from "../../context/session"
import { useLanguage } from "../../context/language"
import { useVSCode } from "../../context/vscode"
import type { AgentInfo } from "../../types/messages"
import ModeEditView from "./ModeEditView"
import ModeCreateView from "./ModeCreateView"
import { parseImport, MAX_IMPORT_SIZE } from "./mode-io"
import type { ImportError } from "./mode-io"
import { parseImport as parseSettingsImport, MAX_IMPORT_SIZE as MAX_SETTINGS_IMPORT_SIZE } from "./settings-io"

import { parseModelString } from "../../../../src/shared/provider-model"
import { ModelSelectorBase } from "../shared/ModelSelector"

interface SelectOption {
  value: string
  label: string
}

import SettingsRow from "./SettingsRow"

// View states for the agents subtab
type AgentView = "list" | "create" | "edit"

const AgentBehaviourTab: Component = () => {
  const language = useLanguage()
  const { config, updateConfig } = useConfig()
  const session = useSession()
  const dialog = useDialog()
  const vscode = useVSCode()
  const browse = () => vscode.postMessage({ type: "openMarketplacePanel" })

  // Agent view state
  const [agentView, setAgentView] = createSignal<AgentView>("list")
  const [editingAgent, setEditingAgent] = createSignal<string>("")

  const PINNED = ["commit", "autocomplete"] as const

  const agentNames = createMemo(() => {
    // Exclude server-side hidden internal modes (compaction, title, summary)
    // from the list by using the pre-filtered visible agents list, which safely
    // includes any agents explicitly force-shown by the user.
    const names = session.agents().map((a) => a.name)
    // Always include pinned native agents so users can re-enable them
    for (const pin of PINNED) {
      if (!names.includes(pin)) names.push(pin)
    }
    // Also include any agents from config that might not be in the agent list
    const agents = Object.keys(config().agent ?? {})
    for (const name of agents) {
      if (!names.includes(name)) {
        names.push(name)
      }
    }
    return names.sort()
  })

  // Default-agent picker must only show visible primary agents (not subagents
  // or hidden modes) since the CLI rejects those as default_agent values.
  const defaultAgentOptions = createMemo<SelectOption[]>(() => {
    const visible = session
      .agents()
      .filter((a) => !a.hidden)
      .map((a) => a.name)
    return [
      { value: "", label: language.t("common.default") },
      ...visible.map((name) => ({ value: name, label: name })),
    ]
  })

  const removableModes = createMemo(() => session.allAgents().filter((a) => !a.native))

  const confirmRemoveMode = (agent: AgentInfo) => {
    dialog.show(() => (
      <Dialog title={language.t("settings.agentBehaviour.removeMode.title")} fit>
        <div class="dialog-confirm-body">
          <span>{language.t("settings.agentBehaviour.removeMode.confirm", { name: agent.name })}</span>
          <div class="dialog-confirm-actions">
            <Button variant="ghost" size="large" onClick={() => dialog.close()}>
              {language.t("common.cancel")}
            </Button>
            <Button
              variant="primary"
              size="large"
              onClick={() => {
                dialog.close()
                // Delay optimistic removal until after dialog close animation (100ms)
                // to prevent the reactive list re-render from firing click handlers
                // on shifted list items while the dialog overlay is still present.
                setTimeout(() => {
                  session.removeMode(agent.name)
                  // If we were editing this mode, go back to list
                  if (editingAgent() === agent.name) {
                    setAgentView("list")
                    setEditingAgent("")
                  }
                }, 150)
              }}
            >
              {language.t("settings.agentBehaviour.removeMode.button")}
            </Button>
          </div>
        </div>
      </Dialog>
    ))
  }

  const startEdit = (name: string) => {
    setEditingAgent(name)
    setAgentView("edit")
  }

  const back = () => {
    setAgentView("list")
    setEditingAgent("")
  }

  const [importError, setImportError] = createSignal("")

  const errorKey = (tag: ImportError) => `settings.agentBehaviour.importMode.${tag}` as const

  const importMode = (file: File) => {
    setImportError("")
    if (file.size > MAX_IMPORT_SIZE) {
      setImportError(language.t(errorKey("tooLarge")))
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      const result = parseImport(reader.result as string, agentNames())
      if (!result.ok) {
        setImportError(language.t(errorKey(result.error)))
        return
      }
      const existing = config().agent ?? {}
      updateConfig({ agent: { ...existing, [result.name]: result.config } })
      setImportError("")
    }
    reader.readAsText(file)
  }

  const triggerImport = () => {
    const input = document.createElement("input")
    input.type = "file"
    input.accept = ".json"
    input.onchange = () => {
      const file = input.files?.[0]
      if (file) importMode(file)
    }
    input.click()
  }

  const importOpenCodeSettings = (file: File) => {
    setImportError("")
    if (file.size > MAX_SETTINGS_IMPORT_SIZE) {
      setImportError(language.t(errorKey("tooLarge")))
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      const result = parseSettingsImport(reader.result as string)
      if (!result.ok) {
        setImportError(language.t(errorKey(result.error as any)))
        return
      }
      updateConfig(result.config)
      setImportError("")
    }
    reader.readAsText(file)
  }

  const triggerImportSettings = () => {
    const input = document.createElement("input")
    input.type = "file"
    input.accept = ".json,.jsonc"
    input.onchange = () => {
      const file = input.files?.[0]
      if (file) importOpenCodeSettings(file)
    }
    input.click()
  }

  function handleModelSelect(configKey: "model" | "small_model") {
    return (providerID: string, modelID: string) => {
      if (!providerID || !modelID) {
        updateConfig({ [configKey]: null })
        return
      }
      updateConfig({ [configKey]: `${providerID}/${modelID}` })
    }
  }

  const view = agentView()
  if (view === "create") return <ModeCreateView taken={agentNames()} onBack={back} />
  if (view === "edit") return <ModeEditView name={editingAgent()} onBack={back} onRemove={confirmRemoveMode} />

  return (
    <div>
      {/* Default models and agent */}
      <Card style={{ "margin-bottom": "12px" }}>
        <SettingsRow
          title={language.t("settings.providers.defaultModel.title")}
          description={language.t("settings.providers.defaultModel.description")}
        >
          <ModelSelectorBase
            value={parseModelString(config().model ?? undefined)}
            onSelect={handleModelSelect("model")}
            placement="bottom-start"
            allowClear
            clearLabel={language.t("settings.providers.notSet")}
          />
        </SettingsRow>
        <SettingsRow
          title={language.t("settings.providers.smallModel.title")}
          description={language.t("settings.providers.smallModel.description")}
        >
          <ModelSelectorBase
            value={parseModelString(config().small_model ?? undefined)}
            onSelect={handleModelSelect("small_model")}
            placement="bottom-start"
            allowClear
            clearLabel={language.t("settings.providers.notSet")}
            includeAutoSmall
          />
        </SettingsRow>
        <SettingsRow
          title={language.t("settings.agentBehaviour.defaultAgent.title")}
          description={language.t("settings.agentBehaviour.defaultAgent.description")}
          last
        >
          <Select
            options={defaultAgentOptions()}
            current={defaultAgentOptions().find((o) => o.value === (config().default_agent ?? ""))}
            value={(o) => o.value}
            label={(o) => o.label}
            onSelect={(o) => {
              if (!o) return
              const next = o.value || undefined
              if (next === (config().default_agent ?? undefined)) return
              updateConfig({ default_agent: next })
            }}
            variant="secondary"
            size="small"
            triggerVariant="settings"
          />
        </SettingsRow>
      </Card>

      {/* Available agents list header + create button */}
      <div
        style={{
          display: "flex",
          "align-items": "center",
          "justify-content": "space-between",
          "margin-bottom": "8px",
          "margin-top": "16px",
        }}
      >
        <div data-slot="settings-row-label-title">{language.t("settings.agentBehaviour.availableAgents")}</div>
        <div style={{ display: "flex", gap: "8px" }}>
          <Button variant="ghost" size="small" onClick={triggerImportSettings}>
            {language.t("settings.agentBehaviour.importOpenCodeSettings")}
          </Button>
          <Button variant="ghost" size="small" onClick={triggerImport}>
            {language.t("settings.agentBehaviour.importMode")}
          </Button>
          <Button variant="ghost" size="small" onClick={browse}>
            {language.t("settings.agentBehaviour.mcpBrowseMarketplace")}
          </Button>
          <Button variant="secondary" size="small" onClick={() => setAgentView("create")}>
            {language.t("settings.agentBehaviour.createMode")}
          </Button>
        </div>
      </div>

      <Show when={importError()}>
        <div
          style={{
            "font-size": "12px",
            color: "var(--vscode-errorForeground)",
            "margin-bottom": "8px",
          }}
        >
          {importError()}
        </div>
      </Show>

      {/* Agents list - clickable to edit */}
      <Show
        when={agentNames().length > 0}
        fallback={
          <Card style={{ "margin-bottom": "12px" }}>
            <div
              style={{
                "font-size": "12px",
                color: "var(--text-weak-base, var(--vscode-descriptionForeground))",
              }}
            >
              {language.t("settings.agentBehaviour.noModesFound")}
            </div>
          </Card>
        }
      >
        <Card style={{ "margin-bottom": "12px" }}>
          <For each={agentNames()}>
            {(name, index) => {
              const agent = () => session.allAgents().find((a) => a.name === name)
              const isCustom = () => !agent()?.native
              const agentCfg = () => config().agent?.[name] ?? {}
              const disabled = () => agentCfg().disable ?? false
              const hidden = () => agentCfg().hidden ?? false
              const deprecated = () => agent()?.deprecated ?? false
              return (
                <div
                  style={{
                    display: "flex",
                    "align-items": "center",
                    "justify-content": "space-between",
                    padding: "8px 4px",
                    "border-bottom": index() < agentNames().length - 1 ? "1px solid var(--border-weak-base)" : "none",
                    "border-radius": "4px",
                    cursor: "pointer",
                    opacity: disabled() ? "0.5" : "1",
                  }}
                  onClick={() => startEdit(name)}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "var(--bg-hover-base, var(--vscode-list-hoverBackground))"
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "transparent"
                  }}
                >
                  <div style={{ flex: 1, "min-width": 0 }}>
                    <div style={{ display: "flex", "align-items": "center", gap: "6px" }}>
                      <div style={{ "font-weight": "500", "font-size": "13px" }}>{name}</div>
                      <Show when={isCustom()}>
                        <span
                          style={{
                            "font-size": "10px",
                            padding: "1px 5px",
                            "border-radius": "3px",
                            background: "var(--bg-subtle-base, var(--vscode-badge-background))",
                            color: "var(--text-weak-base, var(--vscode-badge-foreground))",
                          }}
                        >
                          custom
                        </span>
                      </Show>
                      <Show when={agent()?.mode === "subagent"}>
                        <span
                          style={{
                            "font-size": "10px",
                            padding: "1px 5px",
                            "border-radius": "3px",
                            background: "var(--bg-subtle-base, var(--vscode-badge-background))",
                            color: "var(--text-weak-base, var(--vscode-badge-foreground))",
                          }}
                        >
                          {language.t("settings.agentBehaviour.badge.subagent")}
                        </span>
                      </Show>
                      <Show when={hidden()}>
                        <span
                          style={{
                            "font-size": "10px",
                            padding: "1px 5px",
                            "border-radius": "3px",
                            background: "var(--bg-subtle-base, var(--vscode-badge-background))",
                            color: "var(--text-weak-base, var(--vscode-badge-foreground))",
                          }}
                        >
                          {language.t("settings.agentBehaviour.badge.hidden")}
                        </span>
                      </Show>
                      <Show when={disabled()}>
                        <span
                          style={{
                            "font-size": "10px",
                            padding: "1px 5px",
                            "border-radius": "3px",
                            background: "var(--vscode-errorForeground, #f44)",
                            color: "var(--vscode-errorForeground-foreground, #fff)",
                          }}
                        >
                          {language.t("settings.agentBehaviour.badge.disabled")}
                        </span>
                      </Show>
                      <Show when={deprecated()}>
                        <span
                          style={{
                            "font-size": "10px",
                            padding: "1px 5px",
                            "border-radius": "3px",
                            background: "var(--vscode-editorWarning-foreground, #cca700)",
                            color: "var(--vscode-editorWarning-foreground-text, #1e1e1e)",
                          }}
                        >
                          {language.t("settings.agentBehaviour.badge.deprecated")}
                        </span>
                      </Show>
                    </div>
                    <Show when={agent()?.description}>
                      <div
                        style={{
                          "font-size": "11px",
                          color: "var(--text-weak-base, var(--vscode-descriptionForeground))",
                          "margin-top": "2px",
                          overflow: "hidden",
                          "text-overflow": "ellipsis",
                          "white-space": "nowrap",
                        }}
                      >
                        {agent()!.description}
                      </div>
                    </Show>
                  </div>
                  <div style={{ display: "flex", "align-items": "center", gap: "4px" }}>
                    <Show when={isCustom()}>
                      <IconButton
                        size="small"
                        variant="ghost"
                        icon="close"
                        onClick={(e: MouseEvent) => {
                          e.stopPropagation()
                          const a = agent()
                          if (a) confirmRemoveMode(a)
                        }}
                      />
                    </Show>
                    <IconButton size="small" variant="ghost" icon="chevron-right" />
                  </div>
                </div>
              )
            }}
          </For>
        </Card>
      </Show>
    </div>
  )
}

export default AgentBehaviourTab
