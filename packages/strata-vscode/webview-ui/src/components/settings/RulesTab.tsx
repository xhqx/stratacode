import { Component, createSignal, For, Show, onCleanup } from "solid-js"
import { TextField } from "@stratacode/strata-ui/text-field"
import { Card } from "@stratacode/strata-ui/card"
import { Button } from "@stratacode/strata-ui/button"
import { IconButton } from "@stratacode/strata-ui/icon-button"
import { Switch } from "@stratacode/strata-ui/switch"

import { useConfig } from "../../context/config"
import { useLanguage } from "../../context/language"
import { useVSCode } from "../../context/vscode"
import SettingsRow from "./SettingsRow"

const RulesTab: Component = () => {
  const language = useLanguage()
  const { config, updateConfig } = useConfig()
  const vscode = useVSCode()

  const [newInstruction, setNewInstruction] = createSignal("")
  const [claudeCompat, setClaudeCompat] = createSignal(false)

  // Load the VS Code setting for Claude Code compatibility
  vscode.postMessage({ type: "requestClaudeCompatSetting" })
  const unsubClaudeCompat = vscode.onMessage((msg) => {
    if (msg.type === "claudeCompatSettingLoaded") {
      setClaudeCompat(msg.enabled)
    }
  })
  onCleanup(unsubClaudeCompat)

  const instructions = () => config().instructions ?? []

  const [editingIndex, setEditingIndex] = createSignal<number | null>(null)
  const [editValue, setEditValue] = createSignal("")
  const [editError, setEditError] = createSignal("")

  const addInstruction = () => {
    const value = newInstruction().trim()
    if (!value) {
      return
    }
    const current = [...instructions()]
    if (!current.includes(value)) {
      current.push(value)
      updateConfig({ instructions: current })
    }
    setNewInstruction("")
  }

  const removeInstruction = (index: number) => {
    const current = [...instructions()]
    current.splice(index, 1)
    updateConfig({ instructions: current })
    // If editing the removed item, cancel edit
    if (editingIndex() === index) setEditingIndex(null)
  }

  const saveEdit = () => {
    const idx = editingIndex()
    if (idx === null) return
    const val = editValue().trim()
    if (!val) {
      setEditError(language.t("settings.agentBehaviour.inlineEdit.empty"))
      return
    }
    const current = [...instructions()]
    // Check for duplicate at a different index
    if (current.some((p, i) => i !== idx && p === val)) {
      setEditError(language.t("settings.agentBehaviour.inlineEdit.duplicate"))
      return
    }
    current[idx] = val
    updateConfig({ instructions: current })
    setEditingIndex(null)
    setEditError("")
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
        {language.t("settings.agentBehaviour.rules.description")}
      </div>

      <Card>
        <div
          style={{
            "padding-bottom": "8px",
            "border-bottom": "1px solid var(--border-weak-base)",
          }}
        >
          <div style={{ "font-weight": "500" }}>{language.t("settings.agentBehaviour.instructionFiles")}</div>
          <div
            style={{
              "font-size": "12px",
              color: "var(--text-weak-base, var(--vscode-descriptionForeground))",
              "margin-top": "2px",
            }}
          >
            {language.t("settings.agentBehaviour.instructionFiles.description")}
          </div>
        </div>

        {/* Add new instruction path */}
        <div
          style={{
            display: "flex",
            gap: "8px",
            "align-items": "center",
            padding: "8px 0",
            "border-bottom": instructions().length > 0 ? "1px solid var(--border-weak-base)" : "none",
          }}
        >
          <div style={{ flex: 1 }}>
            <TextField
              value={newInstruction()}
              placeholder="e.g. ./INSTRUCTIONS.md"
              onChange={(val) => setNewInstruction(val)}
              onKeyDown={(e: KeyboardEvent) => {
                if (e.key === "Enter") addInstruction()
              }}
            />
          </div>
          <Button variant="secondary" onClick={addInstruction}>
            {language.t("common.add")}
          </Button>
        </div>

        {/* Instructions list */}
        <For each={instructions()}>
          {(path, index) => (
            <div
              style={{
                display: "flex",
                "align-items": "center",
                "justify-content": "space-between",
                padding: "6px 0",
                "border-bottom": index() < instructions().length - 1 ? "1px solid var(--border-weak-base)" : "none",
              }}
            >
              <Show
                when={editingIndex() === index()}
                fallback={
                  <>
                    <span
                      style={{
                        "font-family": "var(--vscode-editor-font-family, monospace)",
                        "font-size": "12px",
                        cursor: "default",
                      }}
                      onDblClick={() => {
                        setEditingIndex(index())
                        setEditValue(path)
                        setEditError("")
                      }}
                    >
                      {path}
                    </span>
                    <div style={{ display: "flex", "align-items": "center", gap: "4px" }}>
                      <IconButton
                        size="small"
                        variant="ghost"
                        icon="pencil-line"
                        onClick={() => vscode.postMessage({ type: "openFile", filePath: path })}
                      />
                      <IconButton
                        size="small"
                        variant="ghost"
                        icon="close"
                        onClick={() => removeInstruction(index())}
                      />
                    </div>
                  </>
                }
              >
                <div style={{ flex: 1, display: "flex", "flex-direction": "column", gap: "4px" }}>
                  <div style={{ display: "flex", gap: "8px", "align-items": "center" }}>
                    <div style={{ flex: 1 }}>
                      <TextField
                        value={editValue()}
                        onChange={(val) => {
                          setEditValue(val)
                          setEditError("")
                        }}
                        onKeyDown={(e: KeyboardEvent) => {
                          if (e.key === "Enter") saveEdit()
                          if (e.key === "Escape") setEditingIndex(null)
                        }}
                      />
                    </div>
                    <IconButton size="small" variant="ghost" icon="check" onClick={saveEdit} />
                    <IconButton size="small" variant="ghost" icon="close" onClick={() => setEditingIndex(null)} />
                  </div>
                  <Show when={editError()}>
                    <div style={{ "font-size": "11px", color: "var(--vscode-errorForeground)" }}>{editError()}</div>
                  </Show>
                </div>
              </Show>
            </div>
          )}
        </For>
      </Card>

      {/* Claude Code compatibility */}
      <h4 style={{ "margin-top": "16px", "margin-bottom": "8px" }}>
        {language.t("settings.agentBehaviour.claudeCompat.heading")}
      </h4>
      <Card>
        <SettingsRow
          title={language.t("settings.agentBehaviour.claudeCompat.title")}
          description={language.t("settings.agentBehaviour.claudeCompat.description")}
          last
        >
          <Switch
            checked={claudeCompat()}
            onChange={(checked: boolean) => {
              setClaudeCompat(checked)
              vscode.postMessage({ type: "updateSetting", key: "claudeCodeCompat", value: checked })
            }}
            hideLabel
          >
            {language.t("settings.agentBehaviour.claudeCompat.title")}
          </Switch>
        </SettingsRow>
      </Card>
    </div>
  )
}

export default RulesTab
