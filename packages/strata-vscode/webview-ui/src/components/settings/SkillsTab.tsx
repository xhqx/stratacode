import { Component, createSignal, createEffect, For, Show } from "solid-js"
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
              <span
                style={{
                  "font-family": "var(--vscode-editor-font-family, monospace)",
                  "font-size": "12px",
                }}
              >
                {path}
              </span>
              <IconButton size="small" variant="ghost" icon="close" onClick={() => removeSkillPath(index())} />
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
              <span
                style={{
                  "font-family": "var(--vscode-editor-font-family, monospace)",
                  "font-size": "12px",
                }}
              >
                {url}
              </span>
              <IconButton size="small" variant="ghost" icon="close" onClick={() => removeSkillUrl(index())} />
            </div>
          )}
        </For>
      </Card>
    </div>
  )
}

export default SkillsTab
