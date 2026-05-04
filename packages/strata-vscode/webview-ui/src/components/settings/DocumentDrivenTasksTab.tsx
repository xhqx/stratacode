import { Component, createSignal, createEffect, onCleanup } from "solid-js"
import { Card } from "@stratacode/strata-ui/card"
import { Switch } from "@stratacode/strata-ui/switch"
import SettingsRow from "./SettingsRow"
import { useVSCode } from "../../context/vscode"
import { useLanguage } from "../../context/language"
import type { ExtensionMessage } from "../../types/messages"

const DocumentDrivenTasksTab: Component = () => {
  const vscode = useVSCode()
  const language = useLanguage()

  const [documentDriven, setDocumentDriven] = createSignal(true)

  const unsubscribe = vscode.onMessage((message: ExtensionMessage) => {
    if (message.type === "planningSettingsLoaded") {
      setDocumentDriven(message.settings.documentDrivenTasks)
    }
  })

  onCleanup(unsubscribe)

  createEffect(() => {
    vscode.postMessage({ type: "requestPlanningSettings" })
  })

  const updateSetting = (value: boolean) => {
    vscode.postMessage({ type: "updatePlanningSetting", key: "documentDrivenTasks", value })
  }

  return (
    <div>
      <Card>
        <SettingsRow
          title={language.t("settings.display.documentDrivenTasks.title") || "Document-Driven Tasks"}
          description={
            language.t("settings.display.documentDrivenTasks.description") ||
            "Automatically sync tasks with markdown plan files."
          }
          last
        >
          <Switch
            checked={documentDriven()}
            onChange={updateSetting}
            hideLabel
          >
            {language.t("settings.display.documentDrivenTasks.title") || "Document-Driven Tasks"}
          </Switch>
        </SettingsRow>
      </Card>
    </div>
  )
}

export default DocumentDrivenTasksTab
