import { Component, Show, createSignal } from "solid-js"
import { TextField } from "@stratacode/strata-ui/text-field"
import { Card } from "@stratacode/strata-ui/card"
import { Button } from "@stratacode/strata-ui/button"
import { IconButton } from "@stratacode/strata-ui/icon-button"
import { Switch } from "@stratacode/strata-ui/switch"

import { useConfig } from "../../../context/config"
import { useLanguage } from "../../../context/language"
import type { CommandConfig } from "../../../types/messages/config"
import SettingsRow from "../SettingsRow"

interface Props {
  name: string
  mode: "edit" | "create"
  /** Names already taken — for uniqueness validation in create mode. */
  taken: string[]
  onBack: () => void
}

const WorkflowEditView: Component<Props> = (props) => {
  const language = useLanguage()
  const { config, updateConfig } = useConfig()

  const creating = () => props.mode === "create"

  // Resolve existing data for edit mode
  const existing = () => config().command?.[props.name]

  const [name, setName] = createSignal(creating() ? "" : props.name)
  const [template, setTemplate] = createSignal(existing()?.template ?? "")
  const [description, setDescription] = createSignal(existing()?.description ?? "")
  const [agent, setAgent] = createSignal(existing()?.agent ?? "")
  const [model, setModel] = createSignal(existing()?.model ?? "")
  const [subtask, setSubtask] = createSignal(existing()?.subtask ?? false)
  const [nameError, setNameError] = createSignal("")
  const [templateError, setTemplateError] = createSignal("")

  const validate = (): boolean => {
    let valid = true

    if (creating()) {
      const slug = name().trim()
      if (!slug) {
        setNameError(language.t("settings.agentBehaviour.workflow.name.required"))
        valid = false
      } else if (!/^[a-z][a-z0-9-]*$/.test(slug)) {
        setNameError(language.t("settings.agentBehaviour.workflow.name.invalid"))
        valid = false
      } else if (props.taken.includes(slug)) {
        setNameError(language.t("settings.agentBehaviour.workflow.name.taken"))
        valid = false
      } else {
        setNameError("")
      }
    }

    if (!template().trim()) {
      setTemplateError(language.t("settings.agentBehaviour.workflow.template.required"))
      valid = false
    } else {
      setTemplateError("")
    }

    return valid
  }

  const submit = () => {
    if (!validate()) return

    const slug = creating() ? name().trim() : props.name
    const cmds = config().command ?? {}
    const entry: CommandConfig = {
      template: template().trim(),
      description: description().trim() || undefined,
      agent: agent().trim() || undefined,
      model: model().trim() || undefined,
      subtask: subtask() || undefined,
    }
    updateConfig({ command: { ...cmds, [slug]: entry } })
    props.onBack()
  }

  return (
    <div>
      <div style={{ display: "flex", "align-items": "center", "margin-bottom": "16px" }}>
        <IconButton size="small" variant="ghost" icon="arrow-left" onClick={props.onBack} />
        <span style={{ "font-weight": "600", "font-size": "14px", "margin-left": "8px" }}>
          {creating()
            ? language.t("settings.agentBehaviour.createWorkflow")
            : `${language.t("settings.agentBehaviour.editWorkflow")} — /${props.name}`}
        </span>
      </div>

      {/* Name (create mode only) */}
      <Show when={creating()}>
        <Card data-variant="wide-input" style={{ "margin-bottom": "12px" }}>
          <SettingsRow
            title={language.t("settings.agentBehaviour.workflow.name")}
            description={language.t("settings.agentBehaviour.workflow.name.description")}
            last
          >
            <TextField
              value={name()}
              placeholder={language.t("settings.agentBehaviour.workflow.name.placeholder")}
              onChange={(val) => {
                setName(val)
                setNameError("")
              }}
            />
            <Show when={nameError()}>
              <div style={{ "font-size": "11px", color: "var(--vscode-errorForeground)", "margin-top": "4px" }}>
                {nameError()}
              </div>
            </Show>
          </SettingsRow>
        </Card>
      </Show>

      {/* Template (required) */}
      <Card style={{ "margin-bottom": "12px" }}>
        <div data-slot="settings-row-label-title" style={{ "margin-bottom": "4px" }}>
          {language.t("settings.agentBehaviour.workflow.template")}
        </div>
        <TextField
          value={template()}
          placeholder={language.t("settings.agentBehaviour.workflow.template.placeholder")}
          multiline
          onChange={(val) => {
            setTemplate(val)
            setTemplateError("")
          }}
        />
        <Show when={templateError()}>
          <div style={{ "font-size": "11px", color: "var(--vscode-errorForeground)", "margin-top": "4px" }}>
            {templateError()}
          </div>
        </Show>
      </Card>

      {/* Description */}
      <Card style={{ "margin-bottom": "12px" }}>
        <div data-slot="settings-row-label-title" style={{ "margin-bottom": "4px" }}>
          {language.t("settings.agentBehaviour.workflow.description")}
        </div>
        <TextField
          value={description()}
          placeholder={language.t("settings.agentBehaviour.workflow.description.placeholder")}
          onChange={(val) => setDescription(val)}
        />
      </Card>

      {/* Agent override */}
      <Card style={{ "margin-bottom": "12px" }}>
        <div data-slot="settings-row-label-title" style={{ "margin-bottom": "4px" }}>
          {language.t("settings.agentBehaviour.workflow.agent")}
        </div>
        <TextField
          value={agent()}
          placeholder={language.t("settings.agentBehaviour.workflow.agent.placeholder")}
          onChange={(val) => setAgent(val)}
        />
      </Card>

      {/* Model override */}
      <Card style={{ "margin-bottom": "12px" }}>
        <div data-slot="settings-row-label-title" style={{ "margin-bottom": "4px" }}>
          {language.t("settings.agentBehaviour.workflow.model")}
        </div>
        <TextField
          value={model()}
          placeholder={language.t("settings.agentBehaviour.workflow.model.placeholder")}
          onChange={(val) => setModel(val)}
        />
      </Card>

      {/* Subtask toggle */}
      <Card style={{ "margin-bottom": "12px" }}>
        <SettingsRow
          title={language.t("settings.agentBehaviour.workflow.subtask")}
          description={language.t("settings.agentBehaviour.workflow.subtask.description")}
          last
        >
          <Switch checked={subtask()} onChange={(val) => setSubtask(val)} hideLabel>
            {language.t("settings.agentBehaviour.workflow.subtask")}
          </Switch>
        </SettingsRow>
      </Card>

      <div style={{ display: "flex", gap: "8px", "justify-content": "flex-end" }}>
        <Button variant="ghost" onClick={props.onBack}>
          {language.t("settings.agentBehaviour.workflow.cancel")}
        </Button>
        <Button variant="primary" onClick={submit}>
          {creating()
            ? language.t("settings.agentBehaviour.workflow.create")
            : language.t("settings.agentBehaviour.workflow.save")}
        </Button>
      </div>
    </div>
  )
}

export default WorkflowEditView
