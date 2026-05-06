import * as vscode from "vscode"
import type { Feature, FeatureContext } from "../feature"

export class BrowserFeature implements Feature {
  readonly id = "browserAutomation" as const
  readonly configKeys = ["strata-code.new.browserAutomation"] as const
  readonly messageTypes = ["requestBrowserSettings"] as const

  async onToggled(enabled: boolean, ctx: FeatureContext): Promise<void> {
    await vscode.workspace
      .getConfiguration("strata-code.new.browserAutomation")
      .update("enabled", enabled, vscode.ConfigurationTarget.Global)
  }

  onConfigChanged(e: vscode.ConfigurationChangeEvent, ctx: FeatureContext): void {
    if (e.affectsConfiguration("strata-code.new.browserAutomation")) {
      this.pushState(ctx)
    }
  }

  handleMessage(message: any, ctx: FeatureContext): boolean {
    if (message.type === "requestBrowserSettings") {
      this.pushState(ctx)
      return true
    }
    return false
  }

  pushState(ctx: FeatureContext): void {
    const config = vscode.workspace.getConfiguration("strata-code.new.browserAutomation")
    ctx.post({
      type: "browserSettingsLoaded",
      settings: {
        enabled: config.get<boolean>("enabled", false),
        useSystemChrome: config.get<boolean>("useSystemChrome", true),
        headless: config.get<boolean>("headless", false),
      },
    })
  }

  dispose(): void {}
}
