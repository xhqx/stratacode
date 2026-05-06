import { Component, createEffect, createMemo, createSignal, For, Show, on, onCleanup } from "solid-js"
import { Card } from "@stratacode/strata-ui/card"
import { Button } from "@stratacode/strata-ui/button"
import { IconButton } from "@stratacode/strata-ui/icon-button"
import { Dialog } from "@stratacode/strata-ui/dialog"
import { useDialog } from "@stratacode/strata-ui/context/dialog"

import { useConfig } from "../../context/config"
import { useLanguage } from "../../context/language"
import { useVSCode } from "../../context/vscode"
import type { ExtensionMessage } from "../../types/messages"
import AcpProviderEditView from "./AcpProviderEditView"
import PredefinedProviderCard from "./PredefinedProviderCard"

const AcpProvidersTab: Component = () => {
  const language = useLanguage()
  const { config, updateConfig, acpProviders } = useConfig()
  const dialog = useDialog()
  const vscode = useVSCode()

  const [editingAcp, setEditingAcp] = createSignal<string>("")
  const [creatingAcp, setCreatingAcp] = createSignal(false)
  const [expanded, setExpanded] = createSignal<Record<string, boolean>>({})

  const [testing, setTesting] = createSignal<Record<string, boolean>>({})
  const [result, setResult] = createSignal<
    Record<string, { success: boolean; error?: string; models?: { id: string; name: string }[] }>
  >({})

  const unsub = vscode.onMessage((msg: ExtensionMessage) => {
    if (msg.type !== "acpTestResult") return
    setTesting((prev) => ({ ...prev, [msg.key]: false }))
    setResult((prev) => ({
      ...prev,
      [msg.key]: {
        success: msg.success,
        error: msg.error,
        models: msg.models,
      },
    }))
  })
  onCleanup(unsub)

  // Auto-connect every custom provider on mount / when the list changes
  const probe = (name: string, force = false) => {
    if (!force && (testing()[name] || result()[name])) return
    setTesting((prev) => ({ ...prev, [name]: true }))
    setResult((prev) => {
      const next = { ...prev }
      delete next[name]
      return next
    })
    vscode.postMessage({ type: "testAcpConnection", key: name })
  }

  const acpEntries = createMemo(() => Object.entries(config().acp_providers ?? {}))
  const custom = createMemo(() => acpEntries().filter(([name]) => !(name in (acpProviders() ?? {}))))

  // Fingerprint each custom provider's config to detect changes
  const fingerprints = createMemo(() => {
    const map: Record<string, string> = {}
    for (const [name, cfg] of custom()) {
      map[name] = JSON.stringify({ command: cfg.command, env: cfg.env, url: cfg.url, cwd: cfg.cwd })
    }
    return map
  })

  // Track previous fingerprints to detect drift
  let prev: Record<string, string> = {}
  createEffect(
    on(fingerprints, (current) => {
      for (const [name, fp] of Object.entries(current)) {
        const old = prev[name]
        if (old === undefined) {
          // New provider — initial probe
          probe(name)
        } else if (old !== fp) {
          // Config changed — force re-probe
          probe(name, true)
        }
      }
      prev = { ...current }
    }),
  )

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
                  const existing = config().acp_providers ?? {}
                  const newConfig = { ...existing }
                  delete newConfig[name]
                  updateConfig({ acp_providers: newConfig })
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


  const patch = (name: string, next: Record<string, unknown>) => {
    const existing = config().acp_providers ?? {}
    const current = existing[name] ?? {}
    const predefinedMeta = acpProviders()[name]
    updateConfig({
      acp_providers: {
        ...existing,
        [name]: {
          ...current,
          ...next,
          predefined: true,
          model: (next.model as string | undefined) ?? current.model ?? predefinedMeta?.defaultModel,
        },
      },
    })
  }

  const toggle = (name: string) => {
    setExpanded((prev) => ({ ...prev, [name]: !prev[name] }))
  }

  const statusColor = (name: string) => {
    if (testing()[name]) return "var(--vscode-editorWarning-foreground, #ff9800)"
    const res = result()[name]
    if (res?.success) return "var(--vscode-testing-iconPassed, #4caf50)"
    if (res && !res.success) return "var(--vscode-testing-iconFailed, #f44336)"
    return "var(--vscode-disabledForeground, #888)"
  }

  const statusLabel = (name: string) => {
    if (testing()[name]) return "connecting…"
    const res = result()[name]
    if (res?.success) return "connected"
    if (res && !res.success) return "failed"
    return ""
  }

  return (
    <div>
      <Show when={creatingAcp()}>
        <AcpProviderEditView
          name=""
          mode="create"
          taken={Object.keys(config().acp_providers ?? {})}
          onBack={() => setCreatingAcp(false)}
          onRemove={() => setCreatingAcp(false)}
        />
      </Show>

      <Show when={!creatingAcp() && editingAcp()}>
        <AcpProviderEditView
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
          <Show when={Object.keys(acpProviders() ?? {}).length > 0}>
            <div style={{ "margin-bottom": "12px" }}>
              <div style={{ "font-size": "12px", "font-weight": "600", "margin-bottom": "8px" }}>
                {language.t("settings.agentBehaviour.acpPredefined.title")}
              </div>
              <For each={Object.entries(acpProviders())}>
                {([name, item]) => (
                  <PredefinedProviderCard
                    name={name}
                    item={item as any}
                    cfg={config().acp_providers?.[name] ?? { predefined: true, model: (item as any).defaultModel }}
                    onToggle={(enabled) => patch(name, { enabled })}
                    onModel={(model) => patch(name, { model, enabled: true })}
                    onEnv={(key, value) =>
                      patch(name, {
                        enabled: true,
                        env: { ...(config().acp_providers?.[name]?.env ?? {}), [key]: value },
                      })
                    }
                  />
                )}
              </For>
            </div>
          </Show>

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
          <div style={{ "font-size": "12px", "font-weight": "600", "margin-bottom": "8px" }}>
            {language.t("settings.agentBehaviour.acpCustom.title")}
          </div>
          <Show
            when={custom().length > 0}
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
              <For each={custom()}>
                {([name, acp], index) => {
                  const open = () => expanded()[name] ?? false
                  const env = () => Object.entries(acp.env ?? {})
                  const error = () => {
                    const res = result()[name]
                    if (res && !res.success) return res.error
                    return undefined
                  }
                  const models = () => result()[name]?.models ?? []
                  return (
                    <div
                        style={{
                          "border-bottom":
                          index() < custom().length - 1 ? "1px solid var(--border-weak-base)" : "none",
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

                          {/* Models list (on successful connection) */}
                          <Show when={models().length > 0}>
                            <div style={{ "margin-top": "8px" }}>
                              <span style={{ "font-weight": "500" }}>Models:</span>
                              <div
                                style={{
                                  "margin-top": "4px",
                                  display: "grid",
                                  gap: "2px",
                                  "padding-left": "8px",
                                  "font-family": "var(--vscode-editor-font-family, monospace)",
                                  "font-size": "11px",
                                }}
                              >
                                <For each={models()}>
                                  {(m) => <div>{m.name}</div>}
                                </For>
                              </div>
                            </div>
                          </Show>

                          {/* Retry button — shown only when auto-connect failed */}
                          <Show when={!testing()[name] && result()[name] && !result()[name]!.success}>
                            <div style={{ "margin-top": "8px", display: "flex", "align-items": "center", gap: "8px" }}>
                              <Button
                                variant="secondary"
                                size="small"
                                onClick={(e: MouseEvent) => {
                                  e.stopPropagation()
                                  setTesting((prev) => ({ ...prev, [name]: true }))
                                  setResult((prev) => {
                                    const next = { ...prev }
                                    delete next[name]
                                    return next
                                  })
                                  vscode.postMessage({ type: "testAcpConnection", key: name })
                                }}
                              >
                                Retry Connection
                              </Button>
                            </div>
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

export default AcpProvidersTab
