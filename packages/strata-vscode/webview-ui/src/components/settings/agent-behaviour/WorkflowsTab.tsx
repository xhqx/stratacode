import { Component, createMemo, createSignal, For, Show } from "solid-js"
import { Card } from "@stratacode/strata-ui/card"
import { Button } from "@stratacode/strata-ui/button"
import { IconButton } from "@stratacode/strata-ui/icon-button"
import { Dialog } from "@stratacode/strata-ui/dialog"
import { useDialog } from "@stratacode/strata-ui/context/dialog"

import { useConfig } from "../../../context/config"
import { useLanguage } from "../../../context/language"
import WorkflowEditView from "./WorkflowEditView"

const WorkflowsTab: Component = () => {
  const language = useLanguage()
  const { config, updateConfig } = useConfig()
  const dialog = useDialog()

  const cmds = createMemo(() => Object.entries(config().command ?? {}))
  const [expanded, setExpanded] = createSignal<Record<string, boolean>>({})
  const [editingCmd, setEditingCmd] = createSignal("")
  const [creatingCmd, setCreatingCmd] = createSignal(false)

  const toggle = (name: string) => {
    setExpanded((prev) => ({ ...prev, [name]: !prev[name] }))
  }

  const confirmRemove = (name: string) => {
    dialog.show(() => (
      <Dialog title={language.t("settings.agentBehaviour.removeWorkflow.title")} fit>
        <div class="dialog-confirm-body">
          <span>{language.t("settings.agentBehaviour.removeWorkflow.confirm", { name })}</span>
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
                  const existing = { ...(config().command ?? {}) }
                  delete existing[name]
                  updateConfig({ command: existing })
                }, 150)
              }}
            >
              {language.t("settings.agentBehaviour.removeWorkflow.button")}
            </Button>
          </div>
        </div>
      </Dialog>
    ))
  }

  // --- Sub-views ---
  if (creatingCmd()) {
    return (
      <WorkflowEditView
        name=""
        mode="create"
        taken={Object.keys(config().command ?? {})}
        onBack={() => setCreatingCmd(false)}
      />
    )
  }

  if (editingCmd()) {
    return (
      <WorkflowEditView
        name={editingCmd()}
        mode="edit"
        taken={Object.keys(config().command ?? {}).filter((n) => n !== editingCmd())}
        onBack={() => setEditingCmd("")}
      />
    )
  }

  return (
    <div>
      {/* Description */}
      <div
        style={{
          "font-size": "12px",
          color: "var(--text-weak-base, var(--vscode-descriptionForeground))",
          "margin-bottom": "12px",
          "line-height": "1.5",
        }}
      >
        {language.t("settings.agentBehaviour.workflows.description")}
      </div>

      {/* Toolbar */}
      <div
        style={{
          display: "flex",
          "align-items": "center",
          "justify-content": "flex-end",
          "margin-bottom": "8px",
        }}
      >
        <Button variant="secondary" size="small" onClick={() => setCreatingCmd(true)}>
          {language.t("settings.agentBehaviour.addWorkflow")}
        </Button>
      </div>

      <Show
        when={cmds().length > 0}
        fallback={
          <Card>
            <div
              style={{
                "font-size": "12px",
                color: "var(--text-weak-base, var(--vscode-descriptionForeground))",
              }}
            >
              {language.t("settings.agentBehaviour.workflows.empty")}
            </div>
          </Card>
        }
      >
        <Card>
          <For each={cmds()}>
            {([name, cmd], index) => {
              const open = () => expanded()[name] ?? false
              return (
                <div
                  style={{
                    "border-bottom": index() < cmds().length - 1 ? "1px solid var(--border-weak-base)" : "none",
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
                      <span
                        style={{
                          "font-weight": "500",
                          "font-family": "var(--vscode-editor-font-family, monospace)",
                        }}
                      >
                        /{name}
                      </span>
                      <Show when={cmd.description}>
                        <span
                          style={{
                            "font-size": "12px",
                            color: "var(--text-weak-base, var(--vscode-descriptionForeground))",
                            overflow: "hidden",
                            "text-overflow": "ellipsis",
                            "white-space": "nowrap",
                          }}
                        >
                          {cmd.description}
                        </span>
                      </Show>
                    </div>
                    <div style={{ display: "flex", gap: "4px", "align-items": "center" }}>
                      <IconButton
                        size="small"
                        variant="ghost"
                        icon="pencil-line"
                        onClick={(e: MouseEvent) => {
                          e.stopPropagation()
                          setEditingCmd(name)
                        }}
                      />
                      <IconButton
                        size="small"
                        variant="ghost"
                        icon="close"
                        onClick={(e: MouseEvent) => {
                          e.stopPropagation()
                          confirmRemove(name)
                        }}
                      />
                    </div>
                  </div>

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
                      <Show when={cmd.description}>
                        <div style={{ "margin-bottom": "4px" }}>
                          <span style={{ "font-weight": "500" }}>
                            {language.t("settings.agentBehaviour.workflows.detail.description")}:{" "}
                          </span>
                          {cmd.description}
                        </div>
                      </Show>
                      <Show when={cmd.template}>
                        <div>
                          <span style={{ "font-weight": "500" }}>
                            {language.t("settings.agentBehaviour.workflows.detail.template")}:{" "}
                          </span>
                          <div
                            style={{
                              "margin-top": "4px",
                              "font-family": "var(--vscode-editor-font-family, monospace)",
                              "font-size": "11px",
                              "white-space": "pre-wrap",
                              "word-break": "break-word",
                            }}
                          >
                            {cmd.template}
                          </div>
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
    </div>
  )
}

export default WorkflowsTab
