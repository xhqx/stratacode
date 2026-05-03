import { Component, createSignal, createEffect, onCleanup } from "solid-js"
import { Card } from "@stratacode/strata-ui/card"
import { Switch } from "@stratacode/strata-ui/switch"
import SettingsRow from "./SettingsRow"
import { useVSCode } from "../../context/vscode"
import { useLanguage } from "../../context/language"
import type { ExtensionMessage } from "../../types/messages"

const PlanningTab: Component = () => {
  const vscode = useVSCode()
  const language = useLanguage()

  const [taskView, setTaskView] = createSignal(true)
  const [documentDriven, setDocumentDriven] = createSignal(true)

  const unsubscribe = vscode.onMessage((message: ExtensionMessage) => {
    if (message.type === "planningSettingsLoaded") {
      setTaskView(message.settings.taskView)
      setDocumentDriven(message.settings.documentDrivenTasks)
    }
  })

  onCleanup(unsubscribe)

  createEffect(() => {
    vscode.postMessage({ type: "requestPlanningSettings" })
  })

  const updateSetting = (key: "taskView" | "documentDrivenTasks", value: boolean) => {
    vscode.postMessage({ type: "updatePlanningSetting", key, value })
  }

  return (
    <div>
      <Card style={{ "margin-bottom": "12px" }}>
        <SettingsRow
          title={language.t("settings.plan.taskView.title") || "Planning Task View"}
          description={language.t("settings.plan.taskView.description") || "Show the Kanban task board in the sidebar."}
        >
          <Switch checked={taskView()} onChange={(val) => updateSetting("taskView", val)} hideLabel>
            {language.t("settings.plan.taskView.title") || "Planning Task View"}
          </Switch>
        </SettingsRow>

        <SettingsRow
          title={language.t("settings.plan.documentDriven.title") || "Document Driven Tasks"}
          description={
            language.t("settings.plan.documentDriven.description") ||
            "Automatically sync tasks with markdown plan files."
          }
          last
        >
          <Switch
            checked={documentDriven()}
            onChange={(val) => updateSetting("documentDrivenTasks", val)}
            hideLabel
          >
            {language.t("settings.plan.documentDriven.title") || "Document Driven Tasks"}
          </Switch>
        </SettingsRow>
      </Card>
    </div>
  )
}

export default PlanningTab
