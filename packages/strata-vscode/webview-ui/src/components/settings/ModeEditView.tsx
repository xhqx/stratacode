import { Component, Show, For, createMemo, createSignal, onCleanup, createEffect } from "solid-js"
import { TextField } from "@stratacode/strata-ui/text-field"
import { Select } from "@stratacode/strata-ui/select"
import { parseModelString } from "../../../../src/shared/provider-model"
import MarkdownEditor from "./MarkdownEditor"
import { ModelSelectorBase } from "../shared/ModelSelector"
import { Switch } from "@stratacode/strata-ui/switch"
import { Card } from "@stratacode/strata-ui/card"
import { Button } from "@stratacode/strata-ui/button"
import { IconButton } from "@stratacode/strata-ui/icon-button"
import { Tabs } from "@stratacode/strata-ui/tabs"

import { useConfig } from "../../context/config"
import { useSession } from "../../context/session"
import { useLanguage } from "../../context/language"
import { useVSCode } from "../../context/vscode"
import type {
  AgentConfig,
  AgentInfo,
  PermissionRuleItem,
  ExtensionMessage,
  PermissionLevel,
  PermissionRule,
} from "../../types/messages"
import SettingsRow from "./SettingsRow"
import { buildExport } from "./mode-io"

const ACTION_COLORS: Record<string, { bg: string; fg: string }> = {
  allow: { bg: "var(--vscode-terminal-ansiGreen, #3fb950)", fg: "var(--vscode-editor-background, #1e1e1e)" },
  ask: { bg: "var(--vscode-editorWarning-foreground, #cca700)", fg: "var(--vscode-editor-background, #1e1e1e)" },
  deny: { bg: "var(--vscode-errorForeground, #f85149)", fg: "var(--vscode-editor-background, #fff)" },
  unknown: { bg: "var(--vscode-descriptionForeground, #8b949e)", fg: "var(--vscode-editor-background, #1e1e1e)" },
}

interface LevelOption {
  value: PermissionLevel
  label: string
}

const LEVEL_OPTIONS: LevelOption[] = [
  { value: "allow", label: "Allow" },
  { value: "ask", label: "Ask" },
  { value: "deny", label: "Deny" },
]

const AGENT_TOOLS = [
  { id: "edit", label: "Edit" },
  { id: "bash", label: "Bash" },
  { id: "read", label: "Read" },
  { id: "external_directory", label: "External Directory" },
  { id: "glob", label: "Glob" },
  { id: "grep", label: "Grep" },
  { id: "list", label: "List" },
  { id: "task", label: "Task" },
  { id: "skill", label: "Skill" },
  { id: "lsp", label: "LSP" },
  { id: "todoread", label: "Todo Read" },
  { id: "todowrite", label: "Todo Write" },
  { id: "websearch", label: "Web Search" },
  { id: "codesearch", label: "Code Search" },
  { id: "webfetch", label: "Web Fetch" },
  { id: "doom_loop", label: "Doom Loop" },
]

/** Returns the wildcard-level action for a permission rule (string or object with "*" key). */
function ruleAction(rule: PermissionRule | undefined): PermissionLevel | undefined {
  if (!rule) return undefined
  if (typeof rule === "string") return rule
  return rule["*"] ?? undefined
}

const AgentPermissionEditor: Component<{
  cfg: AgentConfig
  update: (partial: Partial<AgentConfig>) => void
}> = (props) => {
  const language = useLanguage()

  const overrides = createMemo(() => {
    const perm = props.cfg.permission || {}
    return AGENT_TOOLS.map((tool) => ({
      ...tool,
      level: ruleAction(perm[tool.id]),
    }))
  })

  const hasAny = createMemo(() => overrides().some((o) => o.level !== undefined))

  const setLevel = (tool: string, level: PermissionLevel | undefined) => {
    if (level === undefined) {
      props.update({ permission: { [tool]: null as any } })
      return
    }
    props.update({ permission: { [tool]: level } })
  }

  return (
    <Card style={{ "margin-bottom": "12px" }}>
      <div
        style={{
          display: "flex",
          "align-items": "center",
          "justify-content": "space-between",
          "margin-bottom": "8px",
        }}
      >
        <div>
          <div data-slot="settings-row-label-title">
            {language.t("settings.agentBehaviour.permissions.agentOverridesTitle") || "Agent Permission Overrides"}
          </div>
          <div data-slot="settings-row-label-subtitle">
            {language.t("settings.agentBehaviour.permissions.agentOverridesDesc") ||
              "Override global tool permissions for this agent. Unset values inherit from global settings."}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", "flex-direction": "column" }}>
        <For each={overrides()}>
          {(tool) => (
            <div
              style={{
                display: "flex",
                gap: "12px",
                "align-items": "center",
                "justify-content": "space-between",
                padding: "6px 0",
                "border-bottom": "1px solid var(--border-weak-base)",
              }}
            >
              <div style={{ flex: 1, "font-size": "13px", color: "var(--text-base, var(--vscode-foreground))" }}>
                {tool.label}
              </div>
              <div style={{ display: "flex", "align-items": "center", gap: "4px" }}>
                <Select
                  options={[
                    { value: undefined as any, label: language.t("common.default") || "Default" },
                    ...LEVEL_OPTIONS,
                  ]}
                  current={
                    tool.level !== undefined
                      ? LEVEL_OPTIONS.find((o) => o.value === tool.level)
                      : { value: undefined as any, label: language.t("common.default") || "Default" }
                  }
                  value={(o) => o.value}
                  label={(o) => o.label}
                  onSelect={(option) => {
                    if (!option || option.value === undefined) {
                      setLevel(tool.id, undefined)
                    } else {
                      setLevel(tool.id, option.value)
                    }
                  }}
                  variant="secondary"
                  size="small"
                  triggerVariant="settings"
                />
              </div>
            </div>
          )}
        </For>
      </div>

      <Show when={hasAny()}>
        <div style={{ "margin-top": "8px", display: "flex", "justify-content": "flex-end" }}>
          <Button
            variant="ghost"
            onClick={() => {
              const reset: Record<string, null> = {}
              for (const tool of AGENT_TOOLS) reset[tool.id] = null as any
              props.update({ permission: reset as any })
            }}
          >
            {language.t("settings.agentBehaviour.permissions.resetAll") || "Reset All to Default"}
          </Button>
        </div>
      </Show>
    </Card>
  )
}

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

  // agent() may be undefined for modes that only exist in the config draft (just
  // created, not yet saved). This is fine — native defaults to false (correct for
  // custom modes) and all fields read from cfg() which comes from config context.
  const agent = () => session.allAgents().find((a) => a.name === props.name)
  const native = () => agent()?.native ?? false
  const [expanded, setExpanded] = createSignal(false)

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

  // --- Autocomplete IDE Settings ---
  const [enableAutoTrigger, setEnableAutoTrigger] = createSignal(true)
  const [enableSmartInlineTaskKeybinding, setEnableSmartInlineTaskKeybinding] = createSignal(false)
  const [enableChatAutocomplete, setEnableChatAutocomplete] = createSignal(false)

  const unsubscribe = vscode.onMessage((message: ExtensionMessage) => {
    if (message.type !== "autocompleteSettingsLoaded") {
      return
    }
    setEnableAutoTrigger(message.settings.enableAutoTrigger)
    setEnableSmartInlineTaskKeybinding(message.settings.enableSmartInlineTaskKeybinding)
    setEnableChatAutocomplete(message.settings.enableChatAutocomplete)
  })

  onCleanup(unsubscribe)

  // We request settings eagerly here. Only the autocomplete settings need this IDE state.
  vscode.postMessage({ type: "requestAutocompleteSettings" })

  const updateAutocompleteSetting = (
    key: "enableAutoTrigger" | "enableSmartInlineTaskKeybinding" | "enableChatAutocomplete",
    value: boolean,
  ) => {
    vscode.postMessage({ type: "updateAutocompleteSetting", key, value })
  }

  // --- Commit Message Settings ---
  const commitExpanded = createSignal(Boolean(config().commit_message?.prompt))

  const toggleCommitPrompt = (checked: boolean) => {
    commitExpanded[1](checked)
    if (!checked) {
      updateConfig({ commit_message: { prompt: "" } })
    }
  }

  const [activeTab, setActiveTab] = createSignal("general")

  const hasFeaturesTab = createMemo(() => props.name === "autocomplete" || props.name === "commit")

  createEffect(() => {
    if (activeTab() === "features" && !hasFeaturesTab()) {
      setActiveTab("general")
    }
  })

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
        <Show when={native()}>
          <Card style={{ "margin-bottom": "12px" }}>
            <div
              style={{
                "font-size": "12px",
                color: "var(--text-weak-base, var(--vscode-descriptionForeground))",
                padding: "4px 0",
              }}
            >
              {language.t("settings.agentBehaviour.editMode.native")}
            </div>
          </Card>
        </Show>

        {/* Visibility and Model Overrides */}
        <Card data-variant="wide-input" style={{ "margin-bottom": "12px" }}>
          <SettingsRow
            title={language.t("settings.agentBehaviour.hidden.title")}
            description={language.t("settings.agentBehaviour.hidden.description")}
          >
            <Switch
              checked={cfg().hidden ?? false}
              onChange={(val) => {
                update({ hidden: val || undefined })
                // Clear default_agent if hiding the current default
                if (val && config().default_agent === props.name) {
                  updateConfig({ default_agent: undefined })
                }
              }}
              hideLabel
            >
              {language.t("settings.agentBehaviour.hidden.title")}
            </Switch>
          </SettingsRow>

          <SettingsRow
            title={language.t("settings.agentBehaviour.disable.title")}
            description={language.t("settings.agentBehaviour.disable.description")}
          >
            <Switch
              checked={cfg().disable ?? false}
              onChange={(val) => {
                update({ disable: val || undefined })
                // Clear default_agent if disabling the current default
                if (val && config().default_agent === props.name) {
                  updateConfig({ default_agent: undefined })
                }
              }}
              hideLabel
            >
              {language.t("settings.agentBehaviour.disable.title")}
            </Switch>
          </SettingsRow>

          <SettingsRow
            title={language.t("settings.agentBehaviour.modelOverride.title")}
            description={language.t("settings.agentBehaviour.modelOverride.description")}
            last
          >
            <ModelSelectorBase
              value={parseModelString(cfg().model ?? undefined)}
              onSelect={(providerID, modelID) => {
                if (!providerID || !modelID) {
                  update({ model: null })
                  return
                }
                update({ model: `${providerID}/${modelID}` })
              }}
              placement="bottom-start"
              allowClear
              clearLabel={language.t("settings.providers.notSet")}
            />
          </SettingsRow>
        </Card>

        {/* Description (full-width, custom modes only) */}
        <Show when={!native()}>
          <Card style={{ "margin-bottom": "12px" }}>
            <div data-slot="settings-row-label-title" style={{ "margin-bottom": "8px" }}>
              {language.t("settings.agentBehaviour.editMode.description")}
            </div>
            <TextField
              value={cfg().description ?? ""}
              placeholder={language.t("settings.agentBehaviour.createMode.description.placeholder")}
              onChange={(val) => update({ description: val || undefined })}
            />
          </Card>
        </Show>

        {/* Model Pool Overrides */}
        <Card data-variant="wide-input" style={{ "margin-bottom": "12px" }}>
          <SettingsRow
            title={language.t("settings.agentBehaviour.modelPool.title")}
            description={language.t("settings.agentBehaviour.modelPool.description")}
            last={!cfg().model_pool?.enabled}
          >
            <Switch
              checked={cfg().model_pool?.enabled ?? false}
              onChange={(val) => {
                const existing = cfg().model_pool ?? { models: [] }
                const updated = val ? { ...existing, enabled: true } : { ...existing, enabled: false }
                // Only remove enabled flag if it's the only key remaining
                update({ model_pool: Object.keys(updated).length === 1 && !updated.enabled ? null : updated })
              }}
              hideLabel
            >
              {language.t("settings.agentBehaviour.modelPool.enabled")}
            </Switch>
          </SettingsRow>

          <Show when={cfg().model_pool?.enabled}>
            <div
              style={{
                "padding-top": "8px",
                "padding-bottom": "8px",
                "border-top": "1px solid var(--border-weak-base, var(--vscode-panel-border))",
              }}
            >
              <SettingsRow
                title={language.t("settings.agentBehaviour.modelPool.models")}
                description={language.t("settings.agentBehaviour.modelPool.models.description")}
              >
                <div style={{ display: "flex", "flex-direction": "column", gap: "6px", width: "100%" }}>
                  <For each={cfg().model_pool?.models ?? []}>
                    {(entry, index) => (
                      <div style={{ display: "flex", "align-items": "center", gap: "6px" }}>
                        <span
                          style={{
                            "min-width": "18px",
                            "text-align": "right",
                            "font-size": "11px",
                            color: "var(--text-weak-base, var(--vscode-descriptionForeground))",
                          }}
                        >
                          {index() + 1}.
                        </span>
                        <div style={{ flex: 1 }}>
                          <ModelSelectorBase
                            value={parseModelString(entry)}
                            onSelect={(providerID, modelID) => {
                              if (!providerID || !modelID) return
                              const existing = cfg().model_pool ?? { models: [] }
                              const list = [...(existing.models || [])]
                              list[index()] = `${providerID}/${modelID}`
                              update({ model_pool: { ...existing, models: list } })
                            }}
                            placement="bottom-start"
                          />
                        </div>
                        <IconButton
                          size="small"
                          variant="ghost"
                          icon="close"
                          onClick={() => {
                            const existing = cfg().model_pool ?? { models: [] }
                            const list = [...(existing.models || [])]
                            list.splice(index(), 1)
                            update({ model_pool: { ...existing, models: list } })
                          }}
                        />
                      </div>
                    )}
                  </For>
                  <div>
                    <ModelSelectorBase
                      value={null}
                      onSelect={(providerID, modelID) => {
                        if (!providerID || !modelID) return
                        const existing = cfg().model_pool ?? { models: [] }
                        const list = [...(existing.models || []), `${providerID}/${modelID}`]
                        update({ model_pool: { ...existing, models: list } })
                      }}
                      placement="bottom-start"
                      clearLabel={language.t("settings.agentBehaviour.modelPool.add")}
                      allowClear
                    />
                  </div>
                </div>
              </SettingsRow>
              <SettingsRow title={language.t("settings.agentBehaviour.modelPool.maxConcurrent")} description={""}>
                <input
                  type="number"
                  style={{
                    width: "80px",
                    padding: "4px 8px",
                    "background-color": "var(--vscode-input-background)",
                    color: "var(--vscode-input-foreground)",
                    border: "1px solid var(--vscode-input-border)",
                  }}
                  value={cfg().model_pool?.max_concurrent ?? ""}
                  placeholder="2"
                  min="1"
                  onChange={(e) => {
                    const parsed = parseInt(e.currentTarget.value, 10)
                    const existing = cfg().model_pool ?? { models: [] }
                    update({ model_pool: { ...existing, max_concurrent: isNaN(parsed) ? undefined : parsed } })
                  }}
                />
              </SettingsRow>
              <SettingsRow title={language.t("settings.agentBehaviour.modelPool.timeout")} description={""} last>
                <input
                  type="number"
                  style={{
                    width: "80px",
                    padding: "4px 8px",
                    "background-color": "var(--vscode-input-background)",
                    color: "var(--vscode-input-foreground)",
                    border: "1px solid var(--vscode-input-border)",
                  }}
                  value={cfg().model_pool?.timeout ?? ""}
                  placeholder="120"
                  min="1"
                  onChange={(e) => {
                    const parsed = parseInt(e.currentTarget.value, 10)
                    const existing = cfg().model_pool ?? { models: [] }
                    update({ model_pool: { ...existing, timeout: isNaN(parsed) ? undefined : parsed } })
                  }}
                />
              </SettingsRow>
            </div>
          </Show>
        </Card>

        {/* Config overrides (wider inputs) */}
        <Card data-variant="wide-input" style={{ "margin-bottom": "12px" }}>
          <SettingsRow
            title={language.t("settings.agentBehaviour.fallbackModels.title")}
            description={language.t("settings.agentBehaviour.fallbackModels.description")}
          >
            <div style={{ display: "flex", "flex-direction": "column", gap: "6px", width: "100%" }}>
              <For each={cfg().fallback_models ?? []}>
                {(entry, index) => (
                  <div style={{ display: "flex", "align-items": "center", gap: "6px" }}>
                    <span
                      style={{
                        "min-width": "18px",
                        "text-align": "right",
                        "font-size": "11px",
                        color: "var(--text-weak-base, var(--vscode-descriptionForeground))",
                      }}
                    >
                      {index() + 1}.
                    </span>
                    <div style={{ flex: 1 }}>
                      <ModelSelectorBase
                        value={parseModelString(entry)}
                        onSelect={(providerID, modelID) => {
                          if (!providerID || !modelID) return
                          const list = [...(cfg().fallback_models ?? [])]
                          list[index()] = `${providerID}/${modelID}`
                          update({ fallback_models: list })
                        }}
                        placement="bottom-start"
                      />
                    </div>
                    <IconButton
                      size="small"
                      variant="ghost"
                      icon="close"
                      onClick={() => {
                        const list = [...(cfg().fallback_models ?? [])]
                        list.splice(index(), 1)
                        update({ fallback_models: list.length ? list : null })
                      }}
                    />
                  </div>
                )}
              </For>
              <div>
                <ModelSelectorBase
                  value={null}
                  onSelect={(providerID, modelID) => {
                    if (!providerID || !modelID) return
                    const list = [...(cfg().fallback_models ?? []), `${providerID}/${modelID}`]
                    update({ fallback_models: list })
                  }}
                  placement="bottom-start"
                  clearLabel={language.t("settings.agentBehaviour.fallbackModels.add")}
                  allowClear
                />
              </div>
            </div>
          </SettingsRow>

          <SettingsRow
            title={language.t("settings.agentBehaviour.temperature.title")}
            description={language.t("settings.agentBehaviour.temperature.description")}
          >
            <TextField
              value={cfg().temperature?.toString() ?? ""}
              placeholder={language.t("common.default")}
              onChange={(val) => {
                const parsed = parseFloat(val)
                update({ temperature: isNaN(parsed) ? undefined : parsed })
              }}
            />
          </SettingsRow>

          <SettingsRow
            title={language.t("settings.agentBehaviour.topP.title")}
            description={language.t("settings.agentBehaviour.topP.description")}
          >
            <TextField
              value={cfg().top_p?.toString() ?? ""}
              placeholder={language.t("common.default")}
              onChange={(val) => {
                const parsed = parseFloat(val)
                update({ top_p: isNaN(parsed) ? undefined : parsed })
              }}
            />
          </SettingsRow>

          <SettingsRow
            title={language.t("settings.agentBehaviour.maxSteps.title")}
            description={language.t("settings.agentBehaviour.maxSteps.description")}
          >
            <TextField
              value={cfg().steps?.toString() ?? ""}
              placeholder={language.t("common.default")}
              onChange={(val) => {
                const parsed = parseInt(val, 10)
                update({ steps: isNaN(parsed) ? undefined : parsed })
              }}
            />
          </SettingsRow>

          <SettingsRow
            title="Auto-Approve Timeouts"
            description="Override global auto-approve settings for this specific agent."
          >
            <div style={{ display: "flex", "flex-direction": "column", gap: "8px" }}>
              <div style={{ display: "flex", "align-items": "center", gap: "12px" }}>
                <label style={{ "font-size": "13px", color: "var(--text-base, var(--vscode-foreground))", flex: 1 }}>
                  Action timeout (seconds)
                </label>
                <input
                  type="number"
                  style={{
                    width: "80px",
                    padding: "4px 8px",
                    "background-color": "var(--vscode-input-background)",
                    color: "var(--vscode-input-foreground)",
                    border: "1px solid var(--vscode-input-border)",
                  }}
                  value={cfg().auto_approve?.timeout ?? ""}
                  placeholder="Global"
                  min="0"
                  max="300"
                  onChange={(e) => {
                    const val = e.currentTarget.value
                    const parsed = parseInt(val, 10)
                    const existing = cfg().auto_approve ?? {}
                    const updated = { ...existing, timeout: isNaN(parsed) ? undefined : parsed }
                    if (updated.timeout === undefined && updated.question_timeout === undefined) {
                      update({ auto_approve: null })
                    } else {
                      update({ auto_approve: updated })
                    }
                  }}
                />
              </div>
              <div style={{ display: "flex", "align-items": "center", gap: "12px" }}>
                <label style={{ "font-size": "13px", color: "var(--text-base, var(--vscode-foreground))", flex: 1 }}>
                  Question timeout (seconds)
                </label>
                <input
                  type="number"
                  style={{
                    width: "80px",
                    padding: "4px 8px",
                    "background-color": "var(--vscode-input-background)",
                    color: "var(--vscode-input-foreground)",
                    border: "1px solid var(--vscode-input-border)",
                  }}
                  value={cfg().auto_approve?.question_timeout ?? ""}
                  placeholder="Global"
                  min="0"
                  max="300"
                  onChange={(e) => {
                    const val = e.currentTarget.value
                    const parsed = parseInt(val, 10)
                    const existing = cfg().auto_approve ?? {}
                    const updated = { ...existing, question_timeout: isNaN(parsed) ? undefined : parsed }
                    if (updated.timeout === undefined && updated.question_timeout === undefined) {
                      update({ auto_approve: null })
                    } else {
                      update({ auto_approve: updated })
                    }
                  }}
                />
              </div>
            </div>
          </SettingsRow>

          <SettingsRow
            title={language.t("settings.agentBehaviour.retry.title")}
            description={language.t("settings.agentBehaviour.retry.description")}
            last
          >
            <div style={{ display: "flex", "flex-direction": "column", gap: "8px" }}>
              <div style={{ display: "flex", "align-items": "center", gap: "12px" }}>
                <label style={{ "font-size": "13px", color: "var(--text-base, var(--vscode-foreground))", flex: 1 }}>
                  Enabled
                </label>
                <select
                  style={{
                    width: "80px",
                    padding: "4px 8px",
                    "background-color": "var(--vscode-input-background)",
                    color: "var(--vscode-input-foreground)",
                    border: "1px solid var(--vscode-input-border)",
                  }}
                  value={cfg().retry?.enabled === false ? "false" : cfg().retry?.enabled === true ? "true" : "global"}
                  onChange={(e) => {
                    const val = e.currentTarget.value
                    const existing = cfg().retry ?? {}
                    let updated = { ...existing }
                    if (val === "global") delete updated.enabled
                    else updated.enabled = val === "true"
                    update({ retry: Object.keys(updated).length === 0 ? null : updated })
                  }}
                >
                  <option value="global">Global</option>
                  <option value="true">True</option>
                  <option value="false">False</option>
                </select>
              </div>
              <div style={{ display: "flex", "align-items": "center", gap: "12px" }}>
                <label style={{ "font-size": "13px", color: "var(--text-base, var(--vscode-foreground))", flex: 1 }}>
                  Limit (attempts)
                </label>
                <input
                  type="number"
                  style={{
                    width: "80px",
                    padding: "4px 8px",
                    "background-color": "var(--vscode-input-background)",
                    color: "var(--vscode-input-foreground)",
                    border: "1px solid var(--vscode-input-border)",
                  }}
                  value={cfg().retry?.limit ?? ""}
                  placeholder="Global"
                  min="0"
                  max="10"
                  onChange={(e) => {
                    const parsed = parseInt(e.currentTarget.value, 10)
                    const existing = cfg().retry ?? {}
                    const updated = { ...existing, limit: isNaN(parsed) ? undefined : parsed }
                    update({ retry: Object.keys(updated).length === 0 && updated.limit === undefined ? null : updated })
                  }}
                />
              </div>
              <div style={{ display: "flex", "align-items": "center", gap: "12px" }}>
                <label style={{ "font-size": "13px", color: "var(--text-base, var(--vscode-foreground))", flex: 1 }}>
                  Base Delay (seconds)
                </label>
                <input
                  type="number"
                  style={{
                    width: "80px",
                    padding: "4px 8px",
                    "background-color": "var(--vscode-input-background)",
                    color: "var(--vscode-input-foreground)",
                    border: "1px solid var(--vscode-input-border)",
                  }}
                  value={cfg().retry?.delay ?? ""}
                  placeholder="Global"
                  min="1"
                  onChange={(e) => {
                    const parsed = parseFloat(e.currentTarget.value)
                    const existing = cfg().retry ?? {}
                    const updated = { ...existing, delay: isNaN(parsed) ? undefined : parsed }
                    update({ retry: Object.keys(updated).length === 0 && updated.delay === undefined ? null : updated })
                  }}
                />
              </div>
              <div style={{ display: "flex", "align-items": "center", gap: "12px" }}>
                <label style={{ "font-size": "13px", color: "var(--text-base, var(--vscode-foreground))", flex: 1 }}>
                  Max Delay Cap (seconds)
                </label>
                <input
                  type="number"
                  style={{
                    width: "80px",
                    padding: "4px 8px",
                    "background-color": "var(--vscode-input-background)",
                    color: "var(--vscode-input-foreground)",
                    border: "1px solid var(--vscode-input-border)",
                  }}
                  value={cfg().retry?.max_delay ?? ""}
                  placeholder="Global"
                  min="1"
                  onChange={(e) => {
                    const parsed = parseFloat(e.currentTarget.value)
                    const existing = cfg().retry ?? {}
                    const updated = { ...existing, max_delay: isNaN(parsed) ? undefined : parsed }
                    update({
                      retry: Object.keys(updated).length === 0 && updated.max_delay === undefined ? null : updated,
                    })
                  }}
                />
              </div>
            </div>
          </SettingsRow>
        </Card>
      </Show>

      <Show when={activeTab() === "prompt"}>
        {/* Prompt (full-width, markdown editor) */}
        <Card style={{ "margin-bottom": "12px" }}>
          <div data-slot="settings-row-label-title" style={{ "margin-bottom": "4px" }}>
            {native()
              ? language.t("settings.agentBehaviour.editMode.promptOverride")
              : language.t("settings.agentBehaviour.editMode.prompt")}
          </div>
          <div data-slot="settings-row-label-subtitle" style={{ "margin-bottom": "8px" }}>
            {language.t("settings.agentBehaviour.editMode.prompt.help")}
          </div>
          <MarkdownEditor
            value={cfg().prompt ?? ""}
            placeholder={language.t("settings.agentBehaviour.createMode.prompt.placeholder")}
            onChange={(val) => update({ prompt: val || undefined })}
          />
        </Card>
      </Show>

      <Show when={activeTab() === "permissions"}>
        {/* Per-agent permission overrides */}
        <AgentPermissionEditor cfg={cfg()} update={update} />

        {/* Calculated permissions (read-only, collapsible) */}
        <Show when={agent()?.permission} keyed>
          {(rules) => (
            <PermissionRuleset
              agent={props.name}
              rules={rules}
              expanded={expanded()}
              onToggle={() => setExpanded((v) => !v)}
            />
          )}
        </Show>
      </Show>

      <Show when={hasFeaturesTab() && activeTab() === "features"}>
        <Show when={props.name === "autocomplete" && !cfg().disable}>
          <Card style={{ "margin-bottom": "12px" }}>
            <SettingsRow
              title={language.t("settings.autocomplete.autoTrigger.title")}
              description={language.t("settings.autocomplete.autoTrigger.description")}
            >
              <Switch
                checked={enableAutoTrigger()}
                onChange={(checked) => updateAutocompleteSetting("enableAutoTrigger", checked)}
                hideLabel
              >
                {language.t("settings.autocomplete.autoTrigger.title")}
              </Switch>
            </SettingsRow>

            <SettingsRow
              title={language.t("settings.autocomplete.smartKeybinding.title")}
              description={language.t("settings.autocomplete.smartKeybinding.description")}
            >
              <Switch
                checked={enableSmartInlineTaskKeybinding()}
                onChange={(checked) => updateAutocompleteSetting("enableSmartInlineTaskKeybinding", checked)}
                hideLabel
              >
                {language.t("settings.autocomplete.smartKeybinding.title")}
              </Switch>
            </SettingsRow>

            <SettingsRow
              title={language.t("settings.autocomplete.chatAutocomplete.title")}
              description={language.t("settings.autocomplete.chatAutocomplete.description")}
              last
            >
              <Switch
                checked={enableChatAutocomplete()}
                onChange={(checked) => updateAutocompleteSetting("enableChatAutocomplete", checked)}
                hideLabel
              >
                {language.t("settings.autocomplete.chatAutocomplete.title")}
              </Switch>
            </SettingsRow>
          </Card>
        </Show>

        <Show when={props.name === "commit" && !cfg().disable}>
          <Card style={{ "margin-bottom": "12px" }}>
            <SettingsRow
              title={language.t("settings.commitMessage.override.title")}
              description={language.t("settings.commitMessage.override.description")}
              last={!commitExpanded[0]()}
            >
              <Switch checked={commitExpanded[0]()} onChange={toggleCommitPrompt} hideLabel>
                {language.t("settings.commitMessage.override.title")}
              </Switch>
            </SettingsRow>

            <Show when={commitExpanded[0]()}>
              <div style={{ "padding-top": "8px" }}>
                <div data-slot="settings-row-label-title" style={{ "margin-bottom": "4px" }}>
                  {language.t("settings.commitMessage.prompt.title")}
                </div>
                <div data-slot="settings-row-label-subtitle" style={{ "margin-bottom": "8px" }}>
                  {language.t("settings.commitMessage.prompt.description")}
                </div>
                <div style={{ "max-height": "300px", overflow: "auto" }}>
                  <TextField
                    value={config().commit_message?.prompt ?? ""}
                    placeholder={language.t("settings.commitMessage.prompt.placeholder")}
                    multiline
                    onChange={(val) => {
                      updateConfig({ commit_message: { prompt: val } })
                    }}
                  />
                </div>
              </div>
            </Show>
          </Card>
        </Show>
      </Show>

      <div style={{ display: "flex", "justify-content": "flex-end" }}>
        <Button variant="ghost" onClick={props.onBack}>
          {language.t("settings.agentBehaviour.editMode.back")}
        </Button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Collapsible permissions ruleset display
// ---------------------------------------------------------------------------

interface RulesetProps {
  agent: string
  rules: PermissionRuleItem[]
  expanded: boolean
  onToggle: () => void
}

const PermissionRuleset: Component<RulesetProps> = (props) => {
  const language = useLanguage()
  const [copied, setCopied] = createSignal(false)

  // Compute effective action per unique tool by finding the last rule with pattern "*"
  // NOTE: This assumes the CLI uses "*" as the wildcard pattern for catch-all rules.
  // If the CLI convention changes (e.g. to "**" or another pattern), this will need updating.
  const summary = createMemo(() => {
    const tools = new Map<string, PermissionRuleItem["action"]>()
    for (const rule of props.rules) {
      if (rule.pattern === "*") {
        tools.set(rule.permission, rule.action)
      }
    }
    return [...tools.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  })

  const copy = (e: MouseEvent) => {
    e.stopPropagation()
    const data = { agent: props.agent, rules: props.rules }
    navigator.clipboard.writeText(JSON.stringify(data, null, 2))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Card style={{ "margin-bottom": "12px" }}>
      <div
        style={{ display: "flex", "align-items": "center", cursor: "pointer", "user-select": "none" }}
        onClick={props.onToggle}
      >
        <IconButton
          size="small"
          variant="ghost"
          icon={props.expanded ? "chevron-down" : "chevron-right"}
          onClick={(e: MouseEvent) => {
            e.stopPropagation()
            props.onToggle()
          }}
        />
        <span data-slot="settings-row-label-title" style={{ "margin-left": "4px" }}>
          {language.t("settings.agentBehaviour.permissions.title")}
        </span>
        <span
          style={{
            "margin-left": "8px",
            "font-size": "11px",
            color: "var(--text-weak-base, var(--vscode-descriptionForeground))",
          }}
        >
          {language.t("settings.agentBehaviour.permissions.count", { count: String(props.rules.length) })}
        </span>
        <div style={{ "margin-left": "auto" }}>
          <IconButton
            size="small"
            variant="ghost"
            icon={copied() ? "check" : "copy"}
            title={language.t("settings.agentBehaviour.permissions.copy")}
            onClick={copy}
          />
        </div>
      </div>

      <Show when={props.expanded}>
        {/* Summary: effective action per tool for wildcard pattern */}
        <Show when={summary().length > 0}>
          <div style={{ "margin-top": "8px", "margin-bottom": "8px" }}>
            <div
              style={{
                "font-size": "11px",
                color: "var(--text-weak-base, var(--vscode-descriptionForeground))",
                "margin-bottom": "4px",
              }}
            >
              {language.t("settings.agentBehaviour.permissions.effective")}
            </div>
            <div style={{ display: "flex", "flex-wrap": "wrap", gap: "4px" }}>
              <For each={summary()}>
                {([tool, action]) => {
                  const colors = ACTION_COLORS[action] ?? ACTION_COLORS.unknown
                  return (
                    <span
                      style={{
                        "font-size": "11px",
                        padding: "2px 6px",
                        "border-radius": "3px",
                        background: colors.bg,
                        color: colors.fg,
                        "font-family": "var(--vscode-editor-font-family, monospace)",
                      }}
                    >
                      {tool}: {action}
                    </span>
                  )
                }}
              </For>
            </div>
          </div>
        </Show>

        {/* Full ruleset table */}
        <div
          style={{
            "margin-top": "8px",
            "font-size": "11px",
            "font-family": "var(--vscode-editor-font-family, monospace)",
            "max-height": "300px",
            "overflow-y": "auto",
            border: "1px solid var(--border-weak-base, var(--vscode-panel-border))",
            "border-radius": "4px",
          }}
        >
          <table style={{ width: "100%", "border-collapse": "collapse" }}>
            <thead>
              <tr
                style={{
                  background: "var(--bg-subtle-base, var(--vscode-editorWidget-background))",
                  position: "sticky",
                  top: "0",
                }}
              >
                <th style={{ padding: "4px 8px", "text-align": "left", "font-weight": "600" }}>
                  {language.t("settings.agentBehaviour.permissions.col.tool")}
                </th>
                <th style={{ padding: "4px 8px", "text-align": "left", "font-weight": "600" }}>
                  {language.t("settings.agentBehaviour.permissions.col.pattern")}
                </th>
                <th style={{ padding: "4px 8px", "text-align": "left", "font-weight": "600" }}>
                  {language.t("settings.agentBehaviour.permissions.col.action")}
                </th>
              </tr>
            </thead>
            <tbody>
              <For each={props.rules}>
                {(rule, idx) => {
                  const colors = ACTION_COLORS[rule.action] ?? ACTION_COLORS.unknown
                  return (
                    <tr
                      style={{
                        "border-top":
                          idx() > 0 ? "1px solid var(--border-weak-base, var(--vscode-panel-border))" : "none",
                      }}
                    >
                      <td style={{ padding: "3px 8px" }}>{rule.permission}</td>
                      <td style={{ padding: "3px 8px", color: "var(--text-weak-base)" }}>{rule.pattern}</td>
                      <td style={{ padding: "3px 8px" }}>
                        <span
                          style={{
                            padding: "1px 4px",
                            "border-radius": "2px",
                            background: colors.bg,
                            color: colors.fg,
                          }}
                        >
                          {rule.action}
                        </span>
                      </td>
                    </tr>
                  )
                }}
              </For>
            </tbody>
          </table>
        </div>

        <div
          style={{
            "margin-top": "6px",
            "font-size": "10px",
            color: "var(--text-weak-base, var(--vscode-descriptionForeground))",
          }}
        >
          {language.t("settings.agentBehaviour.permissions.hint")}
        </div>
      </Show>
    </Card>
  )
}

export default ModeEditView
