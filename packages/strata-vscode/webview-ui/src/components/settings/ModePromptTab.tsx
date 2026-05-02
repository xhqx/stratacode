import { Component } from "solid-js"
import { Card } from "@stratacode/strata-ui/card"
import MarkdownEditor from "./MarkdownEditor"
import type { TabContext } from "./ModeEditTabs"

export const PromptTab: Component<TabContext> = (props) => {
  return (
    <Card style={{ "margin-bottom": "12px" }}>
      <div data-slot="settings-row-label-title" style={{ "margin-bottom": "4px" }}>
        {props.native()
          ? props.t("settings.agentBehaviour.editMode.promptOverride")
          : props.t("settings.agentBehaviour.editMode.prompt")}
      </div>
      <div data-slot="settings-row-label-subtitle" style={{ "margin-bottom": "8px" }}>
        {props.t("settings.agentBehaviour.editMode.prompt.help")}
      </div>
      <MarkdownEditor
        value={props.cfg().prompt ?? ""}
        placeholder={props.t("settings.agentBehaviour.createMode.prompt.placeholder")}
        onChange={(val) => props.update({ prompt: val || undefined })}
      />
    </Card>
  )
}
