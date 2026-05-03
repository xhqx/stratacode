import { Component, createSignal, createEffect, For, Show } from "solid-js"
import { Switch } from "@stratacode/strata-ui/switch"
import SettingsRow from "./SettingsRow"
import { TextField } from "@stratacode/strata-ui/text-field"
import { Card } from "@stratacode/strata-ui/card"
import { Button } from "@stratacode/strata-ui/button"
import { IconButton } from "@stratacode/strata-ui/icon-button"
import { Dialog } from "@stratacode/strata-ui/dialog"
import { useDialog } from "@stratacode/strata-ui/context/dialog"

import { useConfig } from "../../context/config"
import { useSession } from "../../context/session"
import { useLanguage } from "../../context/language"
import { useVSCode } from "../../context/vscode"
import type { SkillInfo } from "../../types/messages"

const SkillsTab: Component = () => {
  const language = useLanguage()
  const { config, updateConfig } = useConfig()
  const session = useSession()
  const dialog = useDialog()
  const vscode = useVSCode()

  const [newSkillPath, setNewSkillPath] = createSignal("")
  const [newSkillUrl, setNewSkillUrl] = createSignal("")

  const browse = () => vscode.postMessage({ type: "openMarketplacePanel" })

  // Fetch skills when component mounts
  createEffect(() => {
    session.refreshSkills()
  })

  const skillPaths = () => config().skills?.paths ?? []
  const skillUrls = () => config().skills?.urls ?? []

  // Inline edit state — separate for paths and urls
  const [editingPathIndex, setEditingPathIndex] = createSignal<number | null>(null)
  const [editingUrlIndex, setEditingUrlIndex] = createSignal<number | null>(null)
  const [editValue, setEditValue] = createSignal("")
  const [editError, setEditError] = createSignal("")

  const addSkillPath = () => {
    const value = newSkillPath().trim()
    if (!value) {
      return
    }
    const current = [...skillPaths()]
    if (!current.includes(value)) {
      current.push(value)
      updateConfig({ skills: { ...config().skills, paths: current } })
    }
    setNewSkillPath("")
  }

  const removeSkillPath = (index: number) => {
    const current = [...skillPaths()]
    current.splice(index, 1)
    updateConfig({ skills: { ...config().skills, paths: current } })
  }

  const addSkillUrl = () => {
    const value = newSkillUrl().trim()
    if (!value) {
      return
    }
    const current = [...skillUrls()]
    if (!current.includes(value)) {
      current.push(value)
      updateConfig({ skills: { ...config().skills, urls: current } })
    }
    setNewSkillUrl("")
  }

  const removeSkillUrl = (index: number) => {
    const current = [...skillUrls()]
    current.splice(index, 1)
    updateConfig({ skills: { ...config().skills, urls: current } })
    if (editingUrlIndex() === index) setEditingUrlIndex(null)
  }

  const savePathEdit = () => {
    const idx = editingPathIndex()
    if (idx === null) return
    const val = editValue().trim()
    if (!val) {
      setEditError(language.t("settings.agentBehaviour.inlineEdit.empty"))
      return
    }
    const current = [...skillPaths()]
    if (current.some((p, i) => i !== idx && p === val)) {
      setEditError(language.t("settings.agentBehaviour.inlineEdit.duplicate"))
      return
    }
    current[idx] = val
    updateConfig({ skills: { ...config().skills, paths: current } })
    setEditingPathIndex(null)
    setEditError("")
  }

  const saveUrlEdit = () => {
    const idx = editingUrlIndex()
    if (idx === null) return
    const val = editValue().trim()
    if (!val) {
      setEditError(language.t("settings.agentBehaviour.inlineEdit.empty"))
      return
    }
    const current = [...skillUrls()]
    if (current.some((u, i) => i !== idx && u === val)) {
      setEditError(language.t("settings.agentBehaviour.inlineEdit.duplicate"))
      return
    }
    current[idx] = val
    updateConfig({ skills: { ...config().skills, urls: current } })
    setEditingUrlIndex(null)
    setEditError("")
  }

  const confirmRemoveSkill = (skill: SkillInfo) => {
    dialog.show(() => (
      <Dialog title={language.t("settings.agentBehaviour.removeSkill.title")} fit>
        <div class="dialog-confirm-body">
          <span>{language.t("settings.agentBehaviour.removeSkill.confirm", { name: skill.name })}</span>
          <div class="dialog-confirm-actions">
            <Button variant="ghost" size="large" onClick={() => dialog.close()}>
              {language.t("common.cancel")}
            </Button>
            <Button
              variant="primary"
              size="large"
              onClick={() => {
                session.removeSkill(skill.location)
                dialog.close()
              }}
            >
              {language.t("settings.agentBehaviour.removeSkill.button")}
            </Button>
          </div>
        </div>
      </Dialog>
    ))
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
        <Button variant="secondary" size="small" onClick={browse}>
          {language.t("settings.agentBehaviour.mcpBrowseMarketplace")}
        </Button>
      </div>
      {/* Discovered skills */}
      <h4 style={{ "margin-top": "0", "margin-bottom": "8px" }}>
        {language.t("settings.agentBehaviour.discoveredSkills")}
      </h4>
      <Show
        when={session.skills().length > 0}
        fallback={
          <Card style={{ "margin-bottom": "16px" }}>
            <div data-slot="settings-row-label-subtitle">{language.t("settings.agentBehaviour.noSkillsFound")}</div>
          </Card>
        }
      >
        <Card style={{ "margin-bottom": "16px" }}>
          <For each={session.skills()}>
            {(skill, index) => (
              <div
                style={{
                  display: "flex",
                  "align-items": "center",
                  "justify-content": "space-between",
                  padding: "8px 0",
                  "border-bottom": index() < session.skills().length - 1 ? "1px solid var(--border-weak-base)" : "none",
                }}
              >
                <div style={{ flex: 1, "min-width": 0 }}>
                  <div data-slot="settings-row-label-title" style={{ "margin-bottom": "0" }}>
                    {skill.name}
                  </div>
                  <div
                    data-slot="settings-row-label-subtitle"
                    style={{
                      "margin-top": "4px",
                      "font-family": "var(--vscode-editor-font-family, monospace)",
                    }}
                  >
                    <div>{skill.description}</div>
                    {skill.location !== "builtin" && <div>{skill.location}</div>}
                  </div>
                </div>
                {skill.location !== "builtin" && (
                  <IconButton size="small" variant="ghost" icon="close" onClick={() => confirmRemoveSkill(skill)} />
                )}
              </div>
            )}
          </For>
        </Card>
      </Show>

      {/* Skill paths */}
      <h4 style={{ "margin-top": "0", "margin-bottom": "8px" }}>{language.t("settings.agentBehaviour.skillPaths")}</h4>
      <Card style={{ "margin-bottom": "16px" }}>
        <div
          style={{
            display: "flex",
            gap: "8px",
            "align-items": "center",
            padding: "8px 0",
            "border-bottom": skillPaths().length > 0 ? "1px solid var(--border-weak-base)" : "none",
          }}
        >
          <div style={{ flex: 1 }}>
            <TextField
              value={newSkillPath()}
              placeholder="e.g. ./skills"
              onChange={(val) => setNewSkillPath(val)}
              onKeyDown={(e: KeyboardEvent) => {
                if (e.key === "Enter") addSkillPath()
              }}
            />
          </div>
          <Button variant="secondary" onClick={addSkillPath}>
            {language.t("common.add")}
          </Button>
        </div>
        <For each={skillPaths()}>
          {(path, index) => (
            <div
              style={{
                display: "flex",
                "align-items": "center",
                "justify-content": "space-between",
                padding: "6px 0",
                "border-bottom": index() < skillPaths().length - 1 ? "1px solid var(--border-weak-base)" : "none",
              }}
            >
              <Show
                when={editingPathIndex() === index()}
                fallback={
                  <>
                    <span
                      style={{
                        "font-family": "var(--vscode-editor-font-family, monospace)",
                        "font-size": "12px",
                        cursor: "default",
                      }}
                      onDblClick={() => {
                        setEditingPathIndex(index())
                        setEditValue(path)
                        setEditError("")
                      }}
                    >
                      {path}
                    </span>
                    <IconButton size="small" variant="ghost" icon="close" onClick={() => removeSkillPath(index())} />
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
                          if (e.key === "Enter") savePathEdit()
                          if (e.key === "Escape") setEditingPathIndex(null)
                        }}
                      />
                    </div>
                    <IconButton size="small" variant="ghost" icon="check" onClick={savePathEdit} />
                    <IconButton size="small" variant="ghost" icon="close" onClick={() => setEditingPathIndex(null)} />
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

      {/* Skill URLs */}
      <h4 style={{ "margin-top": "0", "margin-bottom": "8px" }}>{language.t("settings.agentBehaviour.skillUrls")}</h4>
      <Card>
        <div
          style={{
            display: "flex",
            gap: "8px",
            "align-items": "center",
            padding: "8px 0",
            "border-bottom": skillUrls().length > 0 ? "1px solid var(--border-weak-base)" : "none",
          }}
        >
          <div style={{ flex: 1 }}>
            <TextField
              value={newSkillUrl()}
              placeholder="e.g. https://example.com/skills"
              onChange={(val) => setNewSkillUrl(val)}
              onKeyDown={(e: KeyboardEvent) => {
                if (e.key === "Enter") addSkillUrl()
              }}
            />
          </div>
          <Button variant="secondary" onClick={addSkillUrl}>
            {language.t("common.add")}
          </Button>
        </div>
        <For each={skillUrls()}>
          {(url, index) => (
            <div
              style={{
                display: "flex",
                "align-items": "center",
                "justify-content": "space-between",
                padding: "6px 0",
                "border-bottom": index() < skillUrls().length - 1 ? "1px solid var(--border-weak-base)" : "none",
              }}
            >
              <Show
                when={editingUrlIndex() === index()}
                fallback={
                  <>
                    <span
                      style={{
                        "font-family": "var(--vscode-editor-font-family, monospace)",
                        "font-size": "12px",
                        cursor: "default",
                      }}
                      onDblClick={() => {
                        setEditingUrlIndex(index())
                        setEditValue(url)
                        setEditError("")
                      }}
                    >
                      {url}
                    </span>
                    <IconButton size="small" variant="ghost" icon="close" onClick={() => removeSkillUrl(index())} />
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
                          if (e.key === "Enter") saveUrlEdit()
                          if (e.key === "Escape") setEditingUrlIndex(null)
                        }}
                      />
                    </div>
                    <IconButton size="small" variant="ghost" icon="check" onClick={saveUrlEdit} />
                    <IconButton size="small" variant="ghost" icon="close" onClick={() => setEditingUrlIndex(null)} />
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

      {/* Tool Toggles and Settings */}
      <h4 style={{ "margin-top": "24px", "margin-bottom": "8px" }}>
        {language.t("settings.experimental.toolToggles")}
      </h4>
      <Card>
        <SettingsRow
          title={language.t("settings.experimental.batch.title")}
          description={language.t("settings.experimental.batch.description")}
          last={!config().tools || Object.keys(config().tools ?? {}).length === 0}
        >
          <Switch
            checked={config().experimental?.batch_tool ?? false}
            onChange={(checked) =>
              updateConfig({ experimental: { ...(config().experimental ?? {}), batch_tool: checked } })
            }
            hideLabel
          >
            {language.t("settings.experimental.batch.title")}
          </Switch>
        </SettingsRow>
        <Show when={config().tools && Object.keys(config().tools ?? {}).length > 0}>
          <For each={Object.entries(config().tools ?? {})}>
            {([name, enabled], index) => (
              <SettingsRow title={name} description="" last={index() >= Object.keys(config().tools ?? {}).length - 1}>
                <Switch
                  checked={enabled as boolean}
                  onChange={(checked) => updateConfig({ tools: { ...config().tools, [name]: checked } })}
                  hideLabel
                >
                  {name}
                </Switch>
              </SettingsRow>
            )}
          </For>
        </Show>
      </Card>
    </div>
  )
}

export default SkillsTab
