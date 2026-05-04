import { Component, createSignal, createEffect, onCleanup } from "solid-js"
import { Card } from "@stratacode/strata-ui/card"
import { Switch } from "@stratacode/strata-ui/switch"
import SettingsRow from "./SettingsRow"
import { useVSCode } from "../../context/vscode"
import { useLanguage } from "../../context/language"
import type { ExtensionMessage } from "../../types/messages"

const KanbanTab: Component = () => {
  const vscode = useVSCode()
  const language = useLanguage()

  const [taskView, setTaskView] = createSignal(true)

  const unsubscribe = vscode.onMessage((message: ExtensionMessage) => {
    if (message.type === "planningSettingsLoaded") {
      setTaskView(message.settings.taskView)
    }
  })

  onCleanup(unsubscribe)

  createEffect(() => {
    vscode.postMessage({ type: "requestPlanningSettings" })
  })

  const updateSetting = (value: boolean) => {
    vscode.postMessage({ type: "updatePlanningSetting", key: "taskView", value })
  }

  return (
    <div>
      <Card>
        <SettingsRow
          title={language.t("settings.display.planningTaskView.title") || "Planning Task View (Kanban)"}
          description={
            language.t("settings.display.planningTaskView.description") ||
            "Show the planning task view (Kanban board) in the sidebar"
          }
          last
        >
          <Switch checked={taskView()} onChange={updateSetting} hideLabel>
            {language.t("settings.display.planningTaskView.title") || "Planning Task View (Kanban)"}
          </Switch>
        </SettingsRow>
      </Card>
    </div>
  )
}

export default KanbanTab
