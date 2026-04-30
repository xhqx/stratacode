import { Component, Show, createMemo, createSignal, For } from "solid-js"
import { TextField } from "@stratacode/strata-ui/text-field"
import { Card } from "@stratacode/strata-ui/card"
import { Button } from "@stratacode/strata-ui/button"
import { IconButton } from "@stratacode/strata-ui/icon-button"

import { useConfig } from "../../context/config"
import { useLanguage } from "../../context/language"
import type { AcpAgentConfig } from "../../types/messages/config"
import SettingsRow from "./SettingsRow"

interface Props {
  name: string
  onBack: () => void
  onRemove: (name: string) => void
}

const AcpEditView: Component<Props> = (props) => {
  const language = useLanguage()
  const { config, updateConfig } = useConfig()

  const cfg = createMemo<AcpAgentConfig>(() => config().acp_agents?.[props.name] ?? {})

  const [envKey, setEnvKey] = createSignal("")
  const [envVal, setEnvVal] = createSignal("")

  const update = (partial: Partial<AcpAgentConfig>) => {
    const existing = config().acp_agents ?? {}
    const current = existing[props.name] ?? {}
    updateConfig({
      acp_agents: { ...existing, [props.name]: { ...current, ...partial } },
    })
  }

  const transport = () => cfg().transport ?? (cfg().url ? "http" : "stdio")

  const cmd = () => {
    const c = cfg().command
    if (Array.isArray(c)) return c[0] ?? ""
    return c ?? ""
  }

  const args = () => {
    const c = cfg().command
    if (Array.isArray(c)) return c.slice(1).join("\n")
    return ""
  }

  const env = createMemo(() => Object.entries(cfg().env ?? {}))

  const addEnv = () => {
    const key = envKey().trim()
    const val = envVal().trim()
    if (!key) return
    const existing = cfg().env ?? {}
    update({ env: { ...existing, [key]: val } })
    setEnvKey("")
    setEnvVal("")
  }

  const removeEnv = (key: string) => {
    const existing = { ...(cfg().env ?? {}) }
    delete existing[key]
    update({ env: existing })
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
            {language.t("settings.agentBehaviour.editAcp")} — {props.name}
          </span>
        </div>
        <IconButton size="small" variant="ghost" icon="close" onClick={() => props.onRemove(props.name)} />
      </div>

      {/* Transport info */}
      <Card style={{ "margin-bottom": "12px" }}>
        <div
          style={{
            "font-size": "12px",
            color: "var(--text-weak-base, var(--vscode-descriptionForeground))",
            padding: "4px 0",
          }}
        >
          {transport() === "stdio"
            ? language.t("settings.agentBehaviour.editAcp.transportLocal")
            : language.t("settings.agentBehaviour.editAcp.transportRemote")}
        </div>
      </Card>

      {/* Command / URL */}
      <Show when={transport() === "stdio"}>
        <Card style={{ "margin-bottom": "12px" }}>
          <div data-slot="settings-row-label-title" style={{ "margin-bottom": "8px" }}>
            {language.t("settings.agentBehaviour.addAcp.command")}
          </div>
          <TextField
            value={cmd()}
            placeholder={language.t("settings.agentBehaviour.addAcp.command.placeholder")}
            onChange={(val) => {
              const existing = cfg().command
              const rest = Array.isArray(existing) ? existing.slice(1) : []
              update({ command: [val.trim(), ...rest] })
            }}
          />
        </Card>
        <Card style={{ "margin-bottom": "12px" }}>
          <div data-slot="settings-row-label-title" style={{ "margin-bottom": "4px" }}>
            {language.t("settings.agentBehaviour.addAcp.args")}
          </div>
          <div data-slot="settings-row-label-subtitle" style={{ "margin-bottom": "8px" }}>
            {language.t("settings.agentBehaviour.addAcp.args.help")}
          </div>
          <TextField
            value={args()}
            placeholder={language.t("settings.agentBehaviour.addAcp.args.placeholder")}
            multiline
            onChange={(val) => {
              const parts = val.split(/\n/).filter(Boolean)
              update({ command: [cmd(), ...parts] })
            }}
          />
        </Card>
      </Show>

      <Show when={transport() === "http"}>
        <Card style={{ "margin-bottom": "12px" }}>
          <div data-slot="settings-row-label-title" style={{ "margin-bottom": "8px" }}>
            {language.t("settings.agentBehaviour.addAcp.url")}
          </div>
          <TextField
            value={cfg().url ?? ""}
            placeholder={language.t("settings.agentBehaviour.addAcp.url.placeholder")}
            onChange={(val) => update({ url: val.trim() || undefined })}
          />
        </Card>
      </Show>

      {/* Environment variables (stdio servers only) */}
      <Show when={transport() === "stdio"}>
        <Card style={{ "margin-bottom": "12px" }}>
          <div data-slot="settings-row-label-title" style={{ "margin-bottom": "4px" }}>
            {language.t("settings.agentBehaviour.editAcp.env")}
          </div>
          <div data-slot="settings-row-label-subtitle" style={{ "margin-bottom": "8px" }}>
            {language.t("settings.agentBehaviour.editAcp.env.help")}
          </div>

          <div
            style={{
              display: "flex",
              gap: "8px",
              "align-items": "center",
              padding: "8px 0",
              "border-bottom": env().length > 0 ? "1px solid var(--border-weak-base)" : "none",
            }}
          >
            <div style={{ flex: 1 }}>
              <TextField value={envKey()} placeholder="KEY" onChange={(val) => setEnvKey(val)} />
            </div>
            <div style={{ flex: 1 }}>
              <TextField
                value={envVal()}
                placeholder="value"
                onChange={(val) => setEnvVal(val)}
                onKeyDown={(e: KeyboardEvent) => {
                  if (e.key === "Enter") addEnv()
                }}
              />
            </div>
            <Button variant="secondary" onClick={addEnv}>
              {language.t("common.add")}
            </Button>
          </div>

          <For each={env()}>
            {([key, val], index) => (
              <div
                style={{
                  display: "flex",
                  "align-items": "center",
                  "justify-content": "space-between",
                  padding: "6px 0",
                  "border-bottom": index() < env().length - 1 ? "1px solid var(--border-weak-base)" : "none",
                }}
              >
                <span
                  style={{
                    "font-family": "var(--vscode-editor-font-family, monospace)",
                    "font-size": "12px",
                  }}
                >
                  {key as string}={val as string}
                </span>
                <IconButton size="small" variant="ghost" icon="close" onClick={() => removeEnv(key)} />
              </div>
            )}
          </For>
        </Card>
      </Show>

      <div style={{ display: "flex", "justify-content": "flex-end" }}>
        <Button variant="ghost" onClick={props.onBack}>
          {language.t("settings.agentBehaviour.editMode.back")}
        </Button>
      </div>
    </div>
  )
}

export default AcpEditView
