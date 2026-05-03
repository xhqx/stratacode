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
import AcpEditView from "./AcpEditView"

const AcpAgentsTab: Component = () => {
  const language = useLanguage()
  const { config, updateConfig } = useConfig()
  const session = useSession()
  const dialog = useDialog()
  const vscode = useVSCode()

  const [editingAcp, setEditingAcp] = createSignal<string>("")
  const [creatingAcp, setCreatingAcp] = createSignal(false)
  const [expanded, setExpanded] = createSignal<Record<string, boolean>>({})

  const browse = () => vscode.postMessage({ type: "openMarketplacePanel" })

  const confirmRemoveAcp = (name: string) => {
    dialog.show(() => (
      <Dialog title={language.t("settings.agentBehaviour.removeAcp.title")} fit>
        <div class="dialog-confirm-body">
          <span>{language.t("settings.agentBehaviour.removeAcp.confirm", { name })}</span>
          <div class="dialog-confirm-actions">
            <Button variant="ghost" size="large" onClick={() => dialog.close()}>
              {language.t("common.cancel")}
            </Button>
            <Button
              variant="primary"
              size="large"
              onClick={() => {
                dialog.close()
                setTimeout(() => {
                  const existing = config().acp_agents ?? {}
                  const newConfig = { ...existing }
                  delete newConfig[name]
                  updateConfig({ acp_agents: newConfig })
                }, 150)
              }}
            >
              {language.t("settings.agentBehaviour.removeAcp.button")}
            </Button>
          </div>
        </div>
      </Dialog>
    ))
  }

  const acpEntries = createMemo(() => Object.entries(config().acp_agents ?? {}))

  const toggle = (name: string) => {
    setExpanded((prev) => ({ ...prev, [name]: !prev[name] }))
  }

  const statusColor = (name: string) => "var(--vscode-disabledForeground, #888)"
  const statusLabel = (name: string) => ""
  const isConnected = (name: string) => false

  return (
    <div>
      <Show when={creatingAcp()}>
        <AcpEditView
          name=""
          mode="create"
          taken={Object.keys(config().acp_agents ?? {})}
          onBack={() => setCreatingAcp(false)}
          onRemove={() => setCreatingAcp(false)}
        />
      </Show>

      <Show when={!creatingAcp() && editingAcp()}>
        <AcpEditView
          name={editingAcp()}
          onBack={() => setEditingAcp("")}
          onRemove={(name) => {
            confirmRemoveAcp(name)
            setEditingAcp("")
          }}
        />
      </Show>

      <Show when={!creatingAcp() && !editingAcp()}>
        <>
          <div
            style={{
              display: "flex",
              "align-items": "center",
              "justify-content": "flex-end",
              "margin-bottom": "8px",
            }}
          >
            <Button variant="secondary" size="small" onClick={() => setCreatingAcp(true)}>
              {language.t("settings.agentBehaviour.addAcpAgent")}
            </Button>
            <Button variant="secondary" size="small" onClick={browse}>
              {language.t("settings.agentBehaviour.acpBrowseMarketplace")}
            </Button>
          </div>
          <Show
            when={acpEntries().length > 0}
            fallback={
              <Card>
                <div
                  style={{
                    "font-size": "12px",
                    color: "var(--text-weak-base, var(--vscode-descriptionForeground))",
                  }}
                >
                  {language.t("settings.agentBehaviour.acpEmpty")}
                </div>
              </Card>
            }
          >
            <Card>
              <For each={acpEntries()}>
                {([name, acp], index) => {
                  const open = () => expanded()[name] ?? false
                  const env = () => Object.entries(acp.env ?? {})
                  const error = () => undefined
                  return (
                    <div
                      style={{
                        "border-bottom":
                          index() < acpEntries().length - 1 ? "1px solid var(--border-weak-base)" : "none",
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
                            {statusLabel(name) || (acp.url ? "remote" : "stdio")}
                          </span>
                        </div>
                        <div style={{ display: "flex", gap: "4px", "align-items": "center" }}>
                          <IconButton
                            size="small"
                            variant="ghost"
                            icon="close"
                            onClick={(e: MouseEvent) => {
                              e.stopPropagation()
                              confirmRemoveAcp(name)
                            }}
                          />
                          <IconButton
                            size="small"
                            variant="ghost"
                            icon="chevron-right"
                            onClick={(e: MouseEvent) => {
                              e.stopPropagation()
                              setEditingAcp(name)
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
                          <Show when={acp.command}>
                            <div style={{ "margin-bottom": "4px" }}>
                              <span style={{ "font-weight": "500" }}>
                                {language.t("settings.agentBehaviour.acpDetail.command")}:{" "}
                              </span>
                              <span style={{ "font-family": "var(--vscode-editor-font-family, monospace)" }}>
                                {Array.isArray(acp.command) ? acp.command[0] : acp.command}
                              </span>
                            </div>
                            <Show when={Array.isArray(acp.command) && acp.command.length > 1}>
                              <div style={{ "margin-bottom": "4px" }}>
                                <span style={{ "font-weight": "500" }}>
                                  {language.t("settings.agentBehaviour.acpDetail.args")}:{" "}
                                </span>
                                <span style={{ "font-family": "var(--vscode-editor-font-family, monospace)" }}>
                                  {Array.isArray(acp.command) ? (acp.command as string[]).slice(1).join(" ") : ""}
                                </span>
                              </div>
                            </Show>
                          </Show>
                          <Show when={acp.url}>
                            <div style={{ "margin-bottom": "4px" }}>
                              <span style={{ "font-weight": "500" }}>URL: </span>
                              <span style={{ "font-family": "var(--vscode-editor-font-family, monospace)" }}>
                                {acp.url}
                              </span>
                            </div>
                          </Show>
                          <Show when={env().length > 0}>
                            <div style={{ "margin-bottom": "4px" }}>
                              <span style={{ "font-weight": "500" }}>
                                {language.t("settings.agentBehaviour.acpDetail.env")}:
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
        </>
      </Show>
    </div>
  )
}

export default AcpAgentsTab
