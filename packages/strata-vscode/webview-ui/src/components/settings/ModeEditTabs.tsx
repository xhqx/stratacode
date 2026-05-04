import { Component, Show, For, createMemo, createSignal } from "solid-js"
import { TextField } from "@stratacode/strata-ui/text-field"
import { Switch } from "@stratacode/strata-ui/switch"
import { Card } from "@stratacode/strata-ui/card"
import { parseModelString } from "../../../../src/shared/provider-model"
import MarkdownEditor from "./MarkdownEditor"
import { ModelSelectorBase } from "../shared/ModelSelector"
import { IconButton } from "@stratacode/strata-ui/icon-button"
import SettingsRow from "./SettingsRow"
import type { AgentConfig, AgentInfo } from "../../types/messages"

// Shared context type passed to each tab
export interface TabContext {
  name: string
  cfg: () => AgentConfig
  native: () => boolean
  update: (partial: Partial<AgentConfig>) => void
  t: (key: string, params?: Record<string, string>) => string
}

// ---------------------------------------------------------------------------
// General Tab
// ---------------------------------------------------------------------------

const numberInput = {
  width: "80px",
  padding: "4px 8px",
  "background-color": "var(--vscode-input-background)",
  color: "var(--vscode-input-foreground)",
  border: "1px solid var(--vscode-input-border)",
} as const

export const GeneralTab: Component<
  TabContext & {
    config: () => Record<string, unknown>
    updateConfig: (partial: Record<string, unknown>) => void
  }
> = (props) => {
  const handleAutoApprove = (field: "timeout" | "question_timeout", val: string) => {
    const parsed = parseInt(val, 10)
    const existing = props.cfg().auto_approve ?? {}
    const updated = { ...existing, [field]: isNaN(parsed) ? undefined : parsed }
    if (updated.timeout === undefined && updated.question_timeout === undefined) {
      props.update({ auto_approve: null })
    } else {
      props.update({ auto_approve: updated })
    }
  }

  const handleRetry = (field: string, val: string, float = false) => {
    const parsed = float ? parseFloat(val) : parseInt(val, 10)
    const existing = props.cfg().retry ?? {}
    const updated = { ...existing, [field]: isNaN(parsed) ? undefined : parsed }
    props.update({ retry: Object.keys(updated).length === 0 ? null : updated })
  }

  const handleRetryEnabled = (val: string) => {
    const existing = props.cfg().retry ?? {}
    const updated = { ...existing } as Record<string, unknown>
    if (val === "global") delete updated.enabled
    else updated.enabled = val === "true"
    props.update({ retry: Object.keys(updated).length === 0 ? null : updated })
  }

  const handleNumber = (key: string, val: string, float = false) => {
    const parsed = float ? parseFloat(val) : parseInt(val, 10)
    props.update({ [key]: isNaN(parsed) ? undefined : parsed } as any)
  }

  return (
    <>
      <Show when={props.native()}>
        <Card style={{ "margin-bottom": "12px" }}>
          <div
            style={{
              "font-size": "12px",
              color: "var(--text-weak-base, var(--vscode-descriptionForeground))",
              padding: "4px 0",
            }}
          >
            {props.t("settings.agentBehaviour.editMode.native")}
          </div>
        </Card>
      </Show>

      {/* Visibility and Model Overrides */}
      <Card data-variant="wide-input" style={{ "margin-bottom": "12px" }}>
        <SettingsRow
          title={props.t("settings.agentBehaviour.hidden.title")}
          description={props.t("settings.agentBehaviour.hidden.description")}
        >
          <Switch
            checked={props.cfg().hidden ?? false}
            onChange={(val) => {
              props.update({ hidden: val || undefined })
              if (val && (props.config() as any).default_agent === props.name) {
                props.updateConfig({ default_agent: undefined })
              }
            }}
            hideLabel
          >
            {props.t("settings.agentBehaviour.hidden.title")}
          </Switch>
        </SettingsRow>

        <SettingsRow
          title={props.t("settings.agentBehaviour.disable.title")}
          description={props.t("settings.agentBehaviour.disable.description")}
        >
          <Switch
            checked={props.cfg().disable ?? false}
            onChange={(val) => {
              props.update({ disable: val || undefined })
              if (val && (props.config() as any).default_agent === props.name) {
                props.updateConfig({ default_agent: undefined })
              }
            }}
            hideLabel
          >
            {props.t("settings.agentBehaviour.disable.title")}
          </Switch>
        </SettingsRow>

        <SettingsRow
          title={props.t("settings.agentBehaviour.modelOverride.title")}
          description={props.t("settings.agentBehaviour.modelOverride.description")}
          last
        >
          <ModelSelectorBase
            value={parseModelString(props.cfg().model ?? undefined)}
            onSelect={(providerID, modelID) => {
              if (!providerID || !modelID) {
                props.update({ model: null })
                return
              }
              props.update({ model: `${providerID}/${modelID}` })
            }}
            placement="bottom-start"
            allowClear
            clearLabel={props.t("settings.providers.notSet")}
          />
        </SettingsRow>
      </Card>

      {/* Description (full-width, custom modes only) */}
      <Show when={!props.native()}>
        <Card style={{ "margin-bottom": "12px" }}>
          <div data-slot="settings-row-label-title" style={{ "margin-bottom": "8px" }}>
            {props.t("settings.agentBehaviour.editMode.description")}
          </div>
          <TextField
            value={props.cfg().description ?? ""}
            placeholder={props.t("settings.agentBehaviour.createMode.description.placeholder")}
            onChange={(val) => props.update({ description: val || undefined })}
          />
        </Card>
      </Show>

      {/* Model Pool Overrides */}
      <ModelPoolSection cfg={props.cfg} update={props.update} t={props.t} />

      {/* Config overrides */}
      <ConfigOverridesSection
        cfg={props.cfg}
        update={props.update}
        t={props.t}
        onAutoApprove={handleAutoApprove}
        onRetry={handleRetry}
        onRetryEnabled={handleRetryEnabled}
        onNumber={handleNumber}
      />
    </>
  )
}

// ---------------------------------------------------------------------------
// Model Pool Section (extracted from General tab)
// ---------------------------------------------------------------------------

const ModelPoolSection: Component<{
  cfg: () => AgentConfig
  update: (partial: Partial<AgentConfig>) => void
  t: (key: string, params?: Record<string, string>) => string
}> = (props) => {
  return (
    <Card data-variant="wide-input" style={{ "margin-bottom": "12px" }}>
      <SettingsRow
        title={props.t("settings.agentBehaviour.modelPool.title")}
        description={props.t("settings.agentBehaviour.modelPool.description")}
        last={!props.cfg().model_pool?.enabled}
      >
        <Switch
          checked={props.cfg().model_pool?.enabled ?? false}
          onChange={(val) => {
            const existing = props.cfg().model_pool ?? { models: [] }
            const updated = val ? { ...existing, enabled: true } : { ...existing, enabled: false }
            props.update({ model_pool: Object.keys(updated).length === 1 && !updated.enabled ? null : updated })
          }}
          hideLabel
        >
          {props.t("settings.agentBehaviour.modelPool.enabled")}
        </Switch>
      </SettingsRow>

      <Show when={props.cfg().model_pool?.enabled}>
        <div
          style={{
            "padding-top": "8px",
            "padding-bottom": "8px",
            "border-top": "1px solid var(--border-weak-base, var(--vscode-panel-border))",
          }}
        >
          <SettingsRow
            title={props.t("settings.agentBehaviour.modelPool.models")}
            description={props.t("settings.agentBehaviour.modelPool.models.description")}
            vertical
          >
            <div style={{ display: "flex", "flex-direction": "column", gap: "6px", width: "100%" }}>
              <For each={props.cfg().model_pool?.models ?? []}>
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
                          const existing = props.cfg().model_pool ?? { models: [] }
                          const list = [...(existing.models || [])]
                          list[index()] = `${providerID}/${modelID}`
                          props.update({ model_pool: { ...existing, models: list } })
                        }}
                        placement="bottom-start"
                      />
                    </div>
                    <IconButton
                      size="small"
                      variant="ghost"
                      icon="close"
                      onClick={() => {
                        const existing = props.cfg().model_pool ?? { models: [] }
                        const list = [...(existing.models || [])]
                        list.splice(index(), 1)
                        props.update({ model_pool: { ...existing, models: list } })
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
                    const existing = props.cfg().model_pool ?? { models: [] }
                    const list = [...(existing.models || []), `${providerID}/${modelID}`]
                    props.update({ model_pool: { ...existing, models: list } })
                  }}
                  placement="bottom-start"
                  clearLabel={props.t("settings.agentBehaviour.modelPool.add")}
                  allowClear
                />
              </div>
            </div>
          </SettingsRow>
          <SettingsRow
            title={props.t("settings.agentBehaviour.modelPool.maxConcurrent")}
            description={
              props.t("settings.agentBehaviour.modelPool.maxConcurrent.description") ||
              "Maximum number of concurrent executions per pool model."
            }
          >
            <input
              type="number"
              style={numberInput}
              value={props.cfg().model_pool?.max_concurrent ?? ""}
              placeholder="2"
              min="1"
              onChange={(e) => {
                const parsed = parseInt(e.currentTarget.value, 10)
                const existing = props.cfg().model_pool ?? { models: [] }
                props.update({ model_pool: { ...existing, max_concurrent: isNaN(parsed) ? undefined : parsed } })
              }}
            />
          </SettingsRow>
          <SettingsRow
            title={props.t("settings.agentBehaviour.modelPool.timeout")}
            description={
              props.t("settings.agentBehaviour.modelPool.timeout.description") ||
              "Maximum execution time before timing out the request."
            }
            last
          >
            <input
              type="number"
              style={numberInput}
              value={props.cfg().model_pool?.timeout ?? ""}
              placeholder="120"
              min="1"
              onChange={(e) => {
                const parsed = parseInt(e.currentTarget.value, 10)
                const existing = props.cfg().model_pool ?? { models: [] }
                props.update({ model_pool: { ...existing, timeout: isNaN(parsed) ? undefined : parsed } })
              }}
            />
          </SettingsRow>
        </div>
      </Show>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Fallback Models Section (extracted to reduce complexity)
// ---------------------------------------------------------------------------

const FallbackModelsSection: Component<{
  cfg: () => AgentConfig
  update: (partial: Partial<AgentConfig>) => void
  t: (key: string, params?: Record<string, string>) => string
}> = (props) => {
  return (
    <SettingsRow
      title={props.t("settings.agentBehaviour.fallbackModels.title")}
      description={props.t("settings.agentBehaviour.fallbackModels.description")}
      vertical
    >
      <div style={{ display: "flex", "flex-direction": "column", gap: "6px", width: "100%" }}>
        <For each={props.cfg().fallback_models ?? []}>
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
                    const list = [...(props.cfg().fallback_models ?? [])]
                    list[index()] = `${providerID}/${modelID}`
                    props.update({ fallback_models: list })
                  }}
                  placement="bottom-start"
                />
              </div>
              <IconButton
                size="small"
                variant="ghost"
                icon="close"
                onClick={() => {
                  const list = [...(props.cfg().fallback_models ?? [])]
                  list.splice(index(), 1)
                  props.update({ fallback_models: list.length ? list : null })
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
              const list = [...(props.cfg().fallback_models ?? []), `${providerID}/${modelID}`]
              props.update({ fallback_models: list })
            }}
            placement="bottom-start"
            clearLabel={props.t("settings.agentBehaviour.fallbackModels.add")}
            allowClear
          />
        </div>
      </div>
    </SettingsRow>
  )
}

// ---------------------------------------------------------------------------
// Config Overrides Section (extracted from General tab)
// ---------------------------------------------------------------------------

const ConfigOverridesSection: Component<{
  cfg: () => AgentConfig
  update: (partial: Partial<AgentConfig>) => void
  t: (key: string, params?: Record<string, string>) => string
  onAutoApprove: (field: "timeout" | "question_timeout", val: string) => void
  onRetry: (field: string, val: string, float?: boolean) => void
  onRetryEnabled: (val: string) => void
  onNumber: (key: string, val: string, float?: boolean) => void
}> = (props) => {
  const retryValue = () => {
    const enabled = props.cfg().retry?.enabled
    if (enabled === false) return "false"
    if (enabled === true) return "true"
    return "global"
  }
  return (
    <Card data-variant="wide-input" style={{ "margin-bottom": "12px" }}>
      <FallbackModelsSection cfg={props.cfg} update={props.update} t={props.t} />

      <SettingsRow
        title={props.t("settings.agentBehaviour.temperature.title")}
        description={props.t("settings.agentBehaviour.temperature.description")}
      >
        <TextField
          value={props.cfg().temperature?.toString() ?? ""}
          placeholder={props.t("common.default")}
          onChange={(val) => props.onNumber("temperature", val, true)}
        />
      </SettingsRow>

      <SettingsRow
        title={props.t("settings.agentBehaviour.topP.title")}
        description={props.t("settings.agentBehaviour.topP.description")}
      >
        <TextField
          value={props.cfg().top_p?.toString() ?? ""}
          placeholder={props.t("common.default")}
          onChange={(val) => props.onNumber("top_p", val, true)}
        />
      </SettingsRow>

      <SettingsRow
        title={props.t("settings.agentBehaviour.maxSteps.title")}
        description={props.t("settings.agentBehaviour.maxSteps.description")}
      >
        <TextField
          value={props.cfg().steps?.toString() ?? ""}
          placeholder={props.t("common.default")}
          onChange={(val) => props.onNumber("steps", val)}
        />
      </SettingsRow>

      <SettingsRow
        title="Auto-Approve Timeouts"
        description="Override global auto-approve settings for this specific agent."
        vertical
      >
        <div style={{ display: "flex", "flex-direction": "column", gap: "8px" }}>
          <div style={{ display: "flex", "align-items": "center", gap: "12px" }}>
            <label style={{ "font-size": "13px", color: "var(--text-base, var(--vscode-foreground))", flex: 1 }}>
              Action timeout (seconds)
            </label>
            <input
              type="number"
              style={numberInput}
              value={props.cfg().auto_approve?.timeout ?? ""}
              placeholder="Global"
              min="0"
              max="300"
              onChange={(e) => props.onAutoApprove("timeout", e.currentTarget.value)}
            />
          </div>
          <div style={{ display: "flex", "align-items": "center", gap: "12px" }}>
            <label style={{ "font-size": "13px", color: "var(--text-base, var(--vscode-foreground))", flex: 1 }}>
              Question timeout (seconds)
            </label>
            <input
              type="number"
              style={numberInput}
              value={props.cfg().auto_approve?.question_timeout ?? ""}
              placeholder="Global"
              min="0"
              max="300"
              onChange={(e) => props.onAutoApprove("question_timeout", e.currentTarget.value)}
            />
          </div>
        </div>
      </SettingsRow>

      <SettingsRow
        title={props.t("settings.agentBehaviour.retry.title")}
        description={props.t("settings.agentBehaviour.retry.description")}
        vertical
        last
      >
        <div style={{ display: "flex", "flex-direction": "column", gap: "8px" }}>
          <div style={{ display: "flex", "align-items": "center", gap: "12px" }}>
            <label style={{ "font-size": "13px", color: "var(--text-base, var(--vscode-foreground))", flex: 1 }}>
              Enabled
            </label>
            <select
              style={numberInput}
              value={retryValue()}
              onChange={(e) => props.onRetryEnabled(e.currentTarget.value)}
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
              style={numberInput}
              value={props.cfg().retry?.limit ?? ""}
              placeholder="Global"
              min="0"
              max="10"
              onChange={(e) => props.onRetry("limit", e.currentTarget.value)}
            />
          </div>
          <div style={{ display: "flex", "align-items": "center", gap: "12px" }}>
            <label style={{ "font-size": "13px", color: "var(--text-base, var(--vscode-foreground))", flex: 1 }}>
              Base Delay (seconds)
            </label>
            <input
              type="number"
              style={numberInput}
              value={props.cfg().retry?.delay ?? ""}
              placeholder="Global"
              min="1"
              onChange={(e) => props.onRetry("delay", e.currentTarget.value, true)}
            />
          </div>
          <div style={{ display: "flex", "align-items": "center", gap: "12px" }}>
            <label style={{ "font-size": "13px", color: "var(--text-base, var(--vscode-foreground))", flex: 1 }}>
              Max Delay Cap (seconds)
            </label>
            <input
              type="number"
              style={numberInput}
              value={props.cfg().retry?.max_delay ?? ""}
              placeholder="Global"
              min="1"
              onChange={(e) => props.onRetry("max_delay", e.currentTarget.value, true)}
            />
          </div>
        </div>
      </SettingsRow>
    </Card>
  )
}
