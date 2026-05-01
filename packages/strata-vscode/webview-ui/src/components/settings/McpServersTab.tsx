import { Component, createSignal, createMemo, For, Show } from "solid-js"
import { Card } from "@stratacode/strata-ui/card"
import { Button } from "@stratacode/strata-ui/button"
import { IconButton } from "@stratacode/strata-ui/icon-button"
import { Dialog } from "@stratacode/strata-ui/dialog"
import { useDialog } from "@stratacode/strata-ui/context/dialog"
import { Switch } from "@stratacode/strata-ui/switch"

import { useConfig } from "../../context/config"
import { useSession } from "../../context/session"
import { useLanguage } from "../../context/language"
import { useVSCode } from "../../context/vscode"
import McpEditView from "./McpEditView"
import { TextField } from "@stratacode/strata-ui/text-field"
import SettingsRow from "./SettingsRow"

const McpServersTab: Component = () => {
  const language = useLanguage()
  const { config, updateConfig } = useConfig()
  const session = useSession()
  const dialog = useDialog()
  const vscode = useVSCode()

  const [editingMcp, setEditingMcp] = createSignal<string>("")
  const [creatingMcp, setCreatingMcp] = createSignal(false)
  const [expanded, setExpanded] = createSignal<Record<string, boolean>>({})

  const browse = () => vscode.postMessage({ type: "openMarketplacePanel" })

  const confirmRemoveMcp = (name: string) => {
    dialog.show(() => (
      <Dialog title={language.t("settings.agentBehaviour.removeMcp.title")} fit>
        <div class="dialog-confirm-body">
          <span>{language.t("settings.agentBehaviour.removeMcp.confirm", { name })}</span>
          <div class="dialog-confirm-actions">
            <Button variant="ghost" size="large" onClick={() => dialog.close()}>
              {language.t("common.cancel")}
            </Button>
            <Button
              variant="primary"
              size="large"
              onClick={() => {
                dialog.close()
                setTimeout(() => session.removeMcp(name), 150)
              }}
            >
              {language.t("settings.agentBehaviour.removeMcp.button")}
            </Button>
          </div>
        </div>
      </Dialog>
    ))
  }

  const mcpEntries = createMemo(() => Object.entries(config().mcp ?? {}))

  const toggle = (name: string) => {
    setExpanded((prev) => ({ ...prev, [name]: !prev[name] }))
  }

  const statusColor = (name: string) => {
    const s = session.mcpStatus()[name]?.status
    if (s === "connected") return "var(--vscode-testing-iconPassed, #4caf50)"
    if (s === "failed") return "var(--vscode-testing-iconFailed, #f44336)"
    if (s === "needs_auth" || s === "needs_client_registration")
      return "var(--vscode-editorWarning-foreground, #ff9800)"
    if (s === "disabled") return "var(--vscode-disabledForeground, #888)"
    return "var(--vscode-disabledForeground, #888)"
  }

  const statusLabel = (name: string) => {
    const s = session.mcpStatus()[name]?.status
    if (!s) return ""
    const key = {
      connected: "mcp.status.connected",
      failed: "mcp.status.failed",
      needs_auth: "mcp.status.needs_auth",
      disabled: "mcp.status.disabled",
      needs_client_registration: "mcp.status.needs_registration",
    }[s]
    return key ? language.t(key) : s
  }

  const isConnected = (name: string) => session.mcpStatus()[name]?.status === "connected"

  if (creatingMcp()) {
    return (
      <McpEditView
        name=""
        mode="create"
        taken={Object.keys(config().mcp ?? {})}
        onBack={() => setCreatingMcp(false)}
        onRemove={() => setCreatingMcp(false)}
      />
    )
  }

  if (editingMcp()) {
    return (
      <McpEditView
        name={editingMcp()}
        onBack={() => setEditingMcp("")}
        onRemove={(name) => {
          confirmRemoveMcp(name)
          setEditingMcp("")
        }}
      />
    )
  }

  return (
    <div>
      <div
        style={{
          display: "flex",
          "align-items": "center",
          "justify-content": "flex-end",
          "margin-bottom": "8px",
        }}
      >
        <Button variant="secondary" size="small" onClick={() => setCreatingMcp(true)}>
          {language.t("settings.agentBehaviour.addMcpServer")}
        </Button>
        <Button variant="secondary" size="small" onClick={browse}>
          {language.t("settings.agentBehaviour.mcpBrowseMarketplace")}
        </Button>
      </div>

      <h4 style={{ "margin-top": "0", "margin-bottom": "8px" }}>General Settings</h4>
      <Card style={{ "margin-bottom": "16px" }}>
        <SettingsRow
          title={language.t("settings.experimental.mcpTimeout.title")}
          description={language.t("settings.experimental.mcpTimeout.description")}
          last
        >
          <div style={{ width: "160px" }}>
            <TextField
              value={String(config().experimental?.mcp_timeout ?? 60000)}
              onChange={(val) => {
                const num = parseInt(val, 10)
                if (!isNaN(num) && num > 0) {
                  updateConfig({ experimental: { ...(config().experimental ?? {}), mcp_timeout: num } })
                }
              }}
            />
          </div>
        </SettingsRow>
      </Card>
      
      <h4 style={{ "margin-top": "0", "margin-bottom": "8px" }}>Servers</h4>
      <Show
        when={mcpEntries().length > 0}
        fallback={
          <Card>
            <div
              style={{
                "font-size": "12px",
                color: "var(--text-weak-base, var(--vscode-descriptionForeground))",
              }}
            >
              {language.t("settings.agentBehaviour.mcpEmpty")}
            </div>
          </Card>
        }
      >
        <Card>
          <For each={mcpEntries()}>
            {([name, mcp], index) => {
              const open = () => expanded()[name] ?? false
              const env = () => Object.entries(mcp.environment ?? mcp.env ?? {})
              const error = () => {
                const s = session.mcpStatus()[name]
                if (s?.status === "failed") return s.error
                if (s?.status === "needs_client_registration") return s.error
                return undefined
              }
              return (
                <div
                  style={{
                    "border-bottom": index() < mcpEntries().length - 1 ? "1px solid var(--border-weak-base)" : "none",
                  }}
                >
                  {/* Header row */}
                  <div
                    style={{
                      display: "flex",
                      "align-items": "center",
                      "justify-content": "space-between",
                      padding: "8px 0",
                      cursor: "pointer",
                    }}
                    onClick={() => toggle(name)}
                  >
                    <div style={{ display: "flex", "align-items": "center", gap: "6px", flex: 1, "min-width": 0 }}>
                      <IconButton
                        size="small"
                        variant="ghost"
                        icon={open() ? "chevron-down" : "chevron-right"}
                        onClick={(e: MouseEvent) => {
                          e.stopPropagation()
                          toggle(name)
                        }}
                      />
                      {/* Status dot */}
                      <div
                        style={{
                          width: "6px",
                          height: "6px",
                          "border-radius": "50%",
                          "background-color": statusColor(name),
                          "flex-shrink": "0",
                        }}
                      />
                      <div style={{ "font-weight": "500" }}>{name}</div>
                      <span
                        style={{
                          "font-size": "10px",
                          color: "var(--text-weak-base, var(--vscode-descriptionForeground))",
                        }}
                      >
                        {statusLabel(name) || (mcp.url ? "remote" : "stdio")}
                      </span>
                    </div>
                    <div style={{ display: "flex", gap: "4px", "align-items": "center" }}>
                      <div onClick={(e: MouseEvent) => e.stopPropagation()}>
                        <Switch
                          checked={isConnected(name)}
                          disabled={session.mcpLoading() === name}
                          onChange={() => {
                            if (isConnected(name)) {
                              session.disconnectMcp(name)
                            } else {
                              session.connectMcp(name)
                            }
                          }}
                          hideLabel
                        >
                          {name}
                        </Switch>
                      </div>
                      <IconButton
                        size="small"
                        variant="ghost"
                        icon="close"
                        onClick={(e: MouseEvent) => {
                          e.stopPropagation()
                          confirmRemoveMcp(name)
                        }}
                      />
                      <IconButton
                        size="small"
                        variant="ghost"
                        icon="chevron-right"
                        onClick={(e: MouseEvent) => {
                          e.stopPropagation()
                          setEditingMcp(name)
                        }}
                      />
                    </div>
                  </div>

                  {/* Error message */}
                  <Show when={error()}>
                    <div
                      style={{
                        "padding-left": "28px",
                        "padding-bottom": "4px",
                        "font-size": "11px",
                        color: "var(--vscode-errorForeground)",
                      }}
                    >
                      {error()}
                    </div>
                  </Show>

                  {/* Expandable detail */}
                  <Show when={open()}>
                    <div
                      style={{
                        "padding-left": "28px",
                        "padding-bottom": "8px",
                        "font-size": "12px",
                        color: "var(--text-weak-base, var(--vscode-descriptionForeground))",
                      }}
                    >
                      <Show when={mcp.command}>
                        <div style={{ "margin-bottom": "4px" }}>
                          <span style={{ "font-weight": "500" }}>
                            {language.t("settings.agentBehaviour.mcpDetail.command")}:{" "}
                          </span>
                          <span style={{ "font-family": "var(--vscode-editor-font-family, monospace)" }}>
                            {Array.isArray(mcp.command) ? mcp.command[0] : mcp.command}
                          </span>
                        </div>
                        <Show
                          when={
                            (Array.isArray(mcp.command) && mcp.command.length > 1) ||
                            (!Array.isArray(mcp.command) && mcp.args && mcp.args.length > 0)
                          }
                        >
                          <div style={{ "margin-bottom": "4px" }}>
                            <span style={{ "font-weight": "500" }}>
                              {language.t("settings.agentBehaviour.mcpDetail.args")}:{" "}
                            </span>
                            <span style={{ "font-family": "var(--vscode-editor-font-family, monospace)" }}>
                              {Array.isArray(mcp.command)
                                ? (mcp.command as string[]).slice(1).join(" ")
                                : (mcp.args ?? []).join(" ")}
                            </span>
                          </div>
                        </Show>
                      </Show>
                      <Show when={mcp.url}>
                        <div style={{ "margin-bottom": "4px" }}>
                          <span style={{ "font-weight": "500" }}>URL: </span>
                          <span style={{ "font-family": "var(--vscode-editor-font-family, monospace)" }}>
                            {mcp.url}
                          </span>
                        </div>
                      </Show>
                      <Show when={env().length > 0}>
                        <div style={{ "margin-bottom": "4px" }}>
                          <span style={{ "font-weight": "500" }}>
                            {language.t("settings.agentBehaviour.mcpDetail.env")}:
                          </span>
                        </div>
                        <For each={env()}>
                          {([key, val]) => (
                            <div
                              style={{
                                "padding-left": "8px",
                                "font-family": "var(--vscode-editor-font-family, monospace)",
                              }}
                            >
                              {key}={val}
                            </div>
                          )}
                        </For>
                      </Show>
                    </div>
                  </Show>
                </div>
              )
            }}
          </For>
        </Card>
      </Show>
    </div>
  )
}

export default McpServersTab
