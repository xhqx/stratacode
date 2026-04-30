import { Component, For, Show, createMemo, createSignal, onCleanup, onMount } from "solid-js"
import { Switch } from "@stratacode/strata-ui/switch"
import { Select } from "@stratacode/strata-ui/select"
import { TextField } from "@stratacode/strata-ui/text-field"
import { Card } from "@stratacode/strata-ui/card"
import { useConfig } from "../../context/config"
import { useLanguage } from "../../context/language"
import { useVSCode } from "../../context/vscode"
import type { ExtensionMessage } from "../../types/messages"
import SettingsRow from "./SettingsRow"

interface ShareOption {
  value: string
  labelKey: string
}

const SHARE_OPTIONS: ShareOption[] = [
  { value: "manual", labelKey: "settings.experimental.share.manual" },
  { value: "auto", labelKey: "settings.experimental.share.auto" },
  { value: "disabled", labelKey: "settings.experimental.share.disabled" },
]

const ExperimentalTab: Component = () => {
  const { config, updateConfig } = useConfig()
  const language = useLanguage()
  const vscode = useVSCode()
  const [active, setActive] = createSignal(false)

  const handler = (msg: ExtensionMessage) => {
    if (msg.type === "remoteStatus") {
      setActive(msg.enabled)
    }
  }

  onMount(() => {
    const unsub = vscode.onMessage(handler)
    vscode.postMessage({ type: "requestRemoteStatus" })
    onCleanup(unsub)
  })

  const experimental = createMemo(() => config().experimental ?? {})

  const updateExperimental = (key: string, value: unknown) => {
    updateConfig({
      experimental: { ...experimental(), [key]: value },
    })
  }

  return (
    <div>
      <Card>
        {/* Remote control */}
        <div data-component="remote-settings">
          <div data-slot="remote-settings-header">
            <div data-slot="settings-row-label-title">{language.t("settings.experimental.remote.title")}</div>
            <div data-slot="settings-row-label-subtitle">{language.t("settings.experimental.remote.description")}</div>
          </div>
          <div data-slot="remote-settings-block">
            <div data-slot="remote-settings-row">
              <span data-slot="remote-settings-label">{language.t("settings.experimental.remote.current")}</span>
              <span data-slot="remote-settings-status" data-active={active()}>
                {active()
                  ? language.t("settings.experimental.remote.active")
                  : language.t("settings.experimental.remote.inactive")}
              </span>
            </div>
            <div data-slot="remote-settings-hint">{language.t("settings.experimental.remote.hint")}</div>
          </div>
          <div data-slot="remote-settings-row">
            <span data-slot="remote-settings-label">{language.t("settings.experimental.remote.startup")}</span>
            <Switch
              checked={config().remote_control ?? false}
              onChange={(checked) => {
                updateConfig({ remote_control: checked })
              }}
              hideLabel
            >
              {language.t("settings.experimental.remote.startup")}
            </Switch>
          </div>
        </div>

        {/* Global Retry config */}
        <SettingsRow
          title={language.t("settings.agentBehaviour.retry.title")}
          description={language.t("settings.agentBehaviour.retry.description")}
        >
          <div style={{ display: "flex", "flex-direction": "column", gap: "8px", width: "100%" }}>
            <div style={{ display: "flex", "align-items": "center", gap: "12px" }}>
              <label style={{ "font-size": "13px", color: "var(--text-base, var(--vscode-foreground))", flex: 1 }}>
                Enabled
              </label>
              <Switch
                checked={config().retry?.enabled !== false}
                onChange={(checked) => {
                  const existing = config().retry ?? {}
                  const updated = { ...existing, enabled: checked }
                  updateConfig({ retry: updated })
                }}
                hideLabel
              >
                Enabled
              </Switch>
            </div>
            <div style={{ display: "flex", "align-items": "center", gap: "12px" }}>
              <label style={{ "font-size": "13px", color: "var(--text-base, var(--vscode-foreground))", flex: 1 }}>
                Limit (attempts)
              </label>
              <input
                type="number"
                style={{ width: "80px", padding: "4px 8px", "background-color": "var(--vscode-input-background)", color: "var(--vscode-input-foreground)", border: "1px solid var(--vscode-input-border)" }}
                value={config().retry?.limit ?? ""}
                placeholder="2"
                min="0"
                max="10"
                onChange={(e) => {
                  const parsed = parseInt(e.currentTarget.value, 10)
                  const existing = config().retry ?? {}
                  const updated = { ...existing, limit: isNaN(parsed) ? undefined : parsed }
                  updateConfig({ retry: Object.keys(updated).length === 0 && updated.limit === undefined ? null : updated })
                }}
              />
            </div>
            <div style={{ display: "flex", "align-items": "center", gap: "12px" }}>
              <label style={{ "font-size": "13px", color: "var(--text-base, var(--vscode-foreground))", flex: 1 }}>
                Base Delay (seconds)
              </label>
              <input
                type="number"
                style={{ width: "80px", padding: "4px 8px", "background-color": "var(--vscode-input-background)", color: "var(--vscode-input-foreground)", border: "1px solid var(--vscode-input-border)" }}
                value={config().retry?.delay ?? ""}
                placeholder="5"
                min="1"
                onChange={(e) => {
                  const parsed = parseFloat(e.currentTarget.value)
                  const existing = config().retry ?? {}
                  const updated = { ...existing, delay: isNaN(parsed) ? undefined : parsed }
                  updateConfig({ retry: Object.keys(updated).length === 0 && updated.delay === undefined ? null : updated })
                }}
              />
            </div>
            <div style={{ display: "flex", "align-items": "center", gap: "12px" }}>
              <label style={{ "font-size": "13px", color: "var(--text-base, var(--vscode-foreground))", flex: 1 }}>
                Max Delay Cap (seconds)
              </label>
              <input
                type="number"
                style={{ width: "80px", padding: "4px 8px", "background-color": "var(--vscode-input-background)", color: "var(--vscode-input-foreground)", border: "1px solid var(--vscode-input-border)" }}
                value={config().retry?.max_delay ?? ""}
                placeholder="60"
                min="1"
                onChange={(e) => {
                  const parsed = parseFloat(e.currentTarget.value)
                  const existing = config().retry ?? {}
                  const updated = { ...existing, max_delay: isNaN(parsed) ? undefined : parsed }
                  updateConfig({ retry: Object.keys(updated).length === 0 && updated.max_delay === undefined ? null : updated })
                }}
              />
            </div>
          </div>
        </SettingsRow>

        {/* Share mode */}
        <SettingsRow
          title={language.t("settings.experimental.share.title")}
          description={language.t("settings.experimental.share.description")}
        >
          <Select
            options={SHARE_OPTIONS}
            current={SHARE_OPTIONS.find((o) => o.value === (config().share ?? "manual"))}
            value={(o) => o.value}
            label={(o) => language.t(o.labelKey)}
            onSelect={(o) => {
              if (!o) return
              const next = o.value as "manual" | "auto" | "disabled"
              if (next === (config().share ?? "manual")) return
              updateConfig({ share: next })
            }}
            variant="secondary"
            size="small"
            triggerVariant="settings"
          />
        </SettingsRow>

        <SettingsRow
          title={language.t("settings.experimental.formatter.title")}
          description={language.t("settings.experimental.formatter.description")}
        >
          <Switch
            checked={config().formatter !== false}
            onChange={(checked) => updateConfig({ formatter: checked ? {} : false })}
            hideLabel
          >
            {language.t("settings.experimental.formatter.title")}
          </Switch>
        </SettingsRow>

        <SettingsRow
          title={language.t("settings.experimental.lsp.title")}
          description={language.t("settings.experimental.lsp.description")}
        >
          <Switch
            checked={config().lsp !== false}
            onChange={(checked) => updateConfig({ lsp: checked ? {} : false })}
            hideLabel
          >
            {language.t("settings.experimental.lsp.title")}
          </Switch>
        </SettingsRow>

        <SettingsRow
          title={language.t("settings.experimental.pasteSummary.title")}
          description={language.t("settings.experimental.pasteSummary.description")}
        >
          <Switch
            checked={experimental().disable_paste_summary ?? false}
            onChange={(checked) => updateExperimental("disable_paste_summary", checked)}
            hideLabel
          >
            {language.t("settings.experimental.pasteSummary.title")}
          </Switch>
        </SettingsRow>

        <SettingsRow
          title={language.t("settings.experimental.batch.title")}
          description={language.t("settings.experimental.batch.description")}
        >
          <Switch
            checked={experimental().batch_tool ?? false}
            onChange={(checked) => updateExperimental("batch_tool", checked)}
            hideLabel
          >
            {language.t("settings.experimental.batch.title")}
          </Switch>
        </SettingsRow>

        <SettingsRow
          title={language.t("settings.experimental.semanticIndexing.title")}
          description={language.t("settings.experimental.semanticIndexing.description")}
        >
          <Switch
            checked={experimental().semantic_indexing ?? false}
            onChange={(checked) => updateExperimental("semantic_indexing", checked)}
            hideLabel
          >
            {language.t("settings.experimental.semanticIndexing.title")}
          </Switch>
        </SettingsRow>

        <SettingsRow
          title={language.t("settings.experimental.codebaseSearch.title")}
          description={language.t("settings.experimental.codebaseSearch.description")}
        >
          <Switch
            checked={experimental().codebase_search ?? false}
            onChange={(checked) => updateExperimental("codebase_search", checked)}
            hideLabel
          >
            {language.t("settings.experimental.codebaseSearch.title")}
          </Switch>
        </SettingsRow>

        <SettingsRow
          title={language.t("settings.experimental.continueOnDeny.title")}
          description={language.t("settings.experimental.continueOnDeny.description")}
        >
          <Switch
            checked={experimental().continue_loop_on_deny ?? false}
            onChange={(checked) => updateExperimental("continue_loop_on_deny", checked)}
            hideLabel
          >
            {language.t("settings.experimental.continueOnDeny.title")}
          </Switch>
        </SettingsRow>

        {/* MCP timeout */}
        <SettingsRow
          title={language.t("settings.experimental.mcpTimeout.title")}
          description={language.t("settings.experimental.mcpTimeout.description")}
          last
        >
          <TextField
            value={String(experimental().mcp_timeout ?? 60000)}
            onChange={(val) => {
              const num = parseInt(val, 10)
              if (!isNaN(num) && num > 0) {
                updateExperimental("mcp_timeout", num)
              }
            }}
          />
        </SettingsRow>
      </Card>

      {/* Tool toggles */}
      <Show when={config().tools && Object.keys(config().tools ?? {}).length > 0}>
        <h4 style={{ "margin-top": "16px", "margin-bottom": "8px" }}>
          {language.t("settings.experimental.toolToggles")}
        </h4>
        <Card>
          <For each={Object.entries(config().tools ?? {})}>
            {([name, enabled], index) => (
              <SettingsRow title={name} description="" last={index() >= Object.keys(config().tools ?? {}).length - 1}>
                <Switch
                  checked={enabled}
                  onChange={(checked) => updateConfig({ tools: { ...config().tools, [name]: checked } })}
                  hideLabel
                >
                  {name}
                </Switch>
              </SettingsRow>
            )}
          </For>
        </Card>
      </Show>
    </div>
  )
}

export default ExperimentalTab
