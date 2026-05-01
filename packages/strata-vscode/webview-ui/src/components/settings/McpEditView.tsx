import { Component, Show, createMemo, createSignal, For } from "solid-js"
import { TextField } from "@stratacode/strata-ui/text-field"
import { Card } from "@stratacode/strata-ui/card"
import { Button } from "@stratacode/strata-ui/button"
import { IconButton } from "@stratacode/strata-ui/icon-button"

import { useConfig } from "../../context/config"
import { useLanguage } from "../../context/language"
import type { McpConfig } from "../../types/messages"
import SettingsRow from "./SettingsRow"

interface Props {
  name: string
  mode?: "edit" | "create"
  /** Names already taken — used for uniqueness validation in create mode. */
  taken?: string[]
  onBack: () => void
  onRemove: (name: string) => void
}

const McpEditView: Component<Props> = (props) => {
  const language = useLanguage()
  const { config, updateConfig } = useConfig()

  const creating = () => props.mode === "create"

  // --- Create-mode local draft signals ---
  const [draftName, setDraftName] = createSignal("")
  const [draftTransport, setDraftTransport] = createSignal<"local" | "remote">("local")
  const [draftCmd, setDraftCmd] = createSignal("")
  const [draftArgs, setDraftArgs] = createSignal("")
  const [draftUrl, setDraftUrl] = createSignal("")
  const [draftEnv, setDraftEnv] = createSignal<[string, string][]>([])
  const [nameError, setNameError] = createSignal("")

  // --- Edit-mode: live config access ---
  const cfg = createMemo<McpConfig>(() => config().mcp?.[props.name] ?? {})

  const [envKey, setEnvKey] = createSignal("")
  const [envVal, setEnvVal] = createSignal("")

  const update = (partial: Partial<McpConfig>) => {
    const existing = config().mcp ?? {}
    const current = existing[props.name] ?? {}
    updateConfig({
      mcp: { ...existing, [props.name]: { ...current, ...partial } },
    })
  }

  // Transport resolution
  const transport = () => {
    if (creating()) return draftTransport()
    return cfg().type ?? (cfg().url ? "remote" : "local")
  }

  const cmd = () => {
    if (creating()) return draftCmd()
    const c = cfg().command
    if (Array.isArray(c)) return c[0] ?? ""
    return c ?? ""
  }

  const args = () => {
    if (creating()) return draftArgs()
    const c = cfg().command
    if (Array.isArray(c)) return c.slice(1).join("\n")
    return ""
  }

  const env = createMemo(() => {
    if (creating()) return draftEnv()
    return Object.entries(cfg().environment ?? cfg().env ?? {})
  })

  const addEnv = () => {
    const key = envKey().trim()
    const val = envVal().trim()
    if (!key) return
    if (creating()) {
      setDraftEnv((prev) => [...prev.filter(([k]) => k !== key), [key, val]])
    } else {
      const existing = cfg().environment ?? cfg().env ?? {}
      update({ environment: { ...existing, [key]: val } })
    }
    setEnvKey("")
    setEnvVal("")
  }

  const removeEnv = (key: string) => {
    if (creating()) {
      setDraftEnv((prev) => prev.filter(([k]) => k !== key))
    } else {
      const existing = { ...(cfg().environment ?? cfg().env ?? {}) }
      delete existing[key]
      update({ environment: existing })
    }
  }

  // --- Create-mode validation & submit ---
  const validate = (val: string): string => {
    if (!val.trim()) return language.t("settings.agentBehaviour.mcpCreate.name.required")
    if (!/^[a-z][a-z0-9-]*$/.test(val.trim())) return language.t("settings.agentBehaviour.mcpCreate.name.invalid")
    if ((props.taken ?? []).includes(val.trim())) return language.t("settings.agentBehaviour.mcpCreate.name.taken")
    return ""
  }

  const submit = () => {
    const slug = draftName().trim()
    const msg = validate(slug)
    if (msg) {
      setNameError(msg)
      return
    }
    const existing = config().mcp ?? {}
    const entry: McpConfig =
      draftTransport() === "local"
        ? {
            command: [draftCmd().trim(), ...draftArgs().split(/\n/).filter(Boolean)],
            environment: Object.fromEntries(draftEnv()),
          }
        : { url: draftUrl().trim() }
    updateConfig({ mcp: { ...existing, [slug]: entry } })
    props.onBack()
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
            {creating()
              ? language.t("settings.agentBehaviour.mcpCreate")
              : `${language.t("settings.agentBehaviour.editMcp")} — ${props.name}`}
          </span>
        </div>
        <Show when={!creating()}>
          <IconButton size="small" variant="ghost" icon="close" onClick={() => props.onRemove(props.name)} />
        </Show>
      </div>

      {/* Name (create mode only) */}
      <Show when={creating()}>
        <Card data-variant="wide-input" style={{ "margin-bottom": "12px" }}>
          <SettingsRow
            title={language.t("settings.agentBehaviour.mcpCreate.name")}
            last
          >
            <TextField
              value={draftName()}
              placeholder={language.t("settings.agentBehaviour.mcpCreate.name.placeholder")}
              onChange={(val) => {
                setDraftName(val)
                setNameError("")
              }}
            />
            <Show when={nameError()}>
              <div
                style={{
                  "font-size": "11px",
                  color: "var(--vscode-errorForeground)",
                  "margin-top": "4px",
                }}
              >
                {nameError()}
              </div>
            </Show>
          </SettingsRow>
        </Card>
      </Show>

      {/* Transport selector (create mode) / Transport info (edit mode) */}
      <Card style={{ "margin-bottom": "12px" }}>
        <Show
          when={creating()}
          fallback={
            <div
              style={{
                "font-size": "12px",
                color: "var(--text-weak-base, var(--vscode-descriptionForeground))",
                padding: "4px 0",
              }}
            >
              {transport() === "local"
                ? language.t("settings.agentBehaviour.editMcp.transportLocal")
                : language.t("settings.agentBehaviour.editMcp.transportRemote")}
            </div>
          }
        >
          <div data-slot="settings-row-label-title" style={{ "margin-bottom": "8px" }}>
            {language.t("settings.agentBehaviour.mcpCreate.transport")}
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            <Button
              variant={draftTransport() === "local" ? "primary" : "secondary"}
              size="small"
              onClick={() => setDraftTransport("local")}
            >
              {language.t("settings.agentBehaviour.mcpCreate.transportLocal")}
            </Button>
            <Button
              variant={draftTransport() === "remote" ? "primary" : "secondary"}
              size="small"
              onClick={() => setDraftTransport("remote")}
            >
              {language.t("settings.agentBehaviour.mcpCreate.transportRemote")}
            </Button>
          </div>
        </Show>
      </Card>

      {/* Command / URL */}
      <Show when={transport() === "local"}>
        <Card style={{ "margin-bottom": "12px" }}>
          <div data-slot="settings-row-label-title" style={{ "margin-bottom": "8px" }}>
            {language.t("settings.agentBehaviour.addMcp.command")}
          </div>
          <TextField
            value={cmd()}
            placeholder={language.t("settings.agentBehaviour.addMcp.command.placeholder")}
            onChange={(val) => {
              if (creating()) {
                setDraftCmd(val)
              } else {
                const existing = cfg().command
                const rest = Array.isArray(existing) ? existing.slice(1) : []
                update({ command: [val.trim(), ...rest] })
              }
            }}
          />
        </Card>
        <Card style={{ "margin-bottom": "12px" }}>
          <div data-slot="settings-row-label-title" style={{ "margin-bottom": "4px" }}>
            {language.t("settings.agentBehaviour.addMcp.args")}
          </div>
          <div data-slot="settings-row-label-subtitle" style={{ "margin-bottom": "8px" }}>
            {language.t("settings.agentBehaviour.addMcp.args.help")}
          </div>
          <TextField
            value={args()}
            placeholder={language.t("settings.agentBehaviour.addMcp.args.placeholder")}
            multiline
            onChange={(val) => {
              if (creating()) {
                setDraftArgs(val)
              } else {
                const parts = val.split(/\n/).filter(Boolean)
                update({ command: [cmd(), ...parts] })
              }
            }}
          />
        </Card>
      </Show>

      <Show when={transport() === "remote"}>
        <Card style={{ "margin-bottom": "12px" }}>
          <div data-slot="settings-row-label-title" style={{ "margin-bottom": "8px" }}>
            {language.t("settings.agentBehaviour.addMcp.url")}
          </div>
          <TextField
            value={creating() ? draftUrl() : cfg().url ?? ""}
            placeholder={language.t("settings.agentBehaviour.addMcp.url.placeholder")}
            onChange={(val) => {
              if (creating()) {
                setDraftUrl(val)
              } else {
                update({ url: val.trim() || undefined })
              }
            }}
          />
        </Card>
      </Show>

      {/* Environment variables (local only) */}
      <Show when={transport() === "local"}>
        <Card style={{ "margin-bottom": "12px" }}>
          <div data-slot="settings-row-label-title" style={{ "margin-bottom": "4px" }}>
            {language.t("settings.agentBehaviour.editMcp.env")}
          </div>
          <div data-slot="settings-row-label-subtitle" style={{ "margin-bottom": "8px" }}>
            {language.t("settings.agentBehaviour.editMcp.env.help")}
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
                  {key}={val}
                </span>
                <IconButton size="small" variant="ghost" icon="close" onClick={() => removeEnv(key)} />
              </div>
            )}
          </For>
        </Card>
      </Show>

      <div style={{ display: "flex", gap: "8px", "justify-content": "flex-end" }}>
        <Button variant="ghost" onClick={props.onBack}>
          {language.t("settings.agentBehaviour.editMode.back")}
        </Button>
        <Show when={creating()}>
          <Button variant="primary" onClick={submit}>
            {language.t("settings.agentBehaviour.mcpCreate.button")}
          </Button>
        </Show>
      </div>
    </div>
  )
}

export default McpEditView
