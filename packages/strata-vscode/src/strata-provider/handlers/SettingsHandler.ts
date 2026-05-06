import * as vscode from "vscode"
import { openConfig } from "../open-config"
import type { MessageHandler, ProviderContext } from "../message-handlers"

export class SettingsHandler implements MessageHandler {
  readonly types = [
    "openExternal",
    "openSettingsPanel",
    "openVSCodeSettings",
    "openConfigFile",
    "openMarketplacePanel",
    "showInformationMessage",
    "showErrorMessage",
    "executePluginContribution",
  ] as const

  async handle(message: Record<string, any>, ctx: ProviderContext): Promise<boolean> {
    switch (message.type) {
      case "openExternal":
        if (typeof message.url === "string") {
          ctx.openExternal(message.url)
        }
        return true

      case "openSettingsPanel":
        vscode.commands.executeCommand("strata-code.new.settingsButtonClicked", message.tab)
        return true

      case "openVSCodeSettings":
        vscode.commands.executeCommand("workbench.action.openSettings", message.query)
        return true

      case "openConfigFile":
        await openConfig(message.scope, message.labels, ctx.getProjectDirectory(ctx.currentSession ?? undefined))
        return true

      case "openMarketplacePanel":
        vscode.commands.executeCommand("strata-code.new.marketplaceButtonClicked", ctx.projectDirectory)
        return true

      case "showInformationMessage":
        if (typeof message.message === "string") {
          vscode.window.showInformationMessage(message.message)
        }
        return true

      case "showErrorMessage":
        if (typeof message.message === "string") {
          vscode.window.showErrorMessage(message.message)
        }
        return true

      case "executePluginContribution":
        ctx.executePluginContribution(message.id)
        return true

      default:
        return false
    }
  }
}
