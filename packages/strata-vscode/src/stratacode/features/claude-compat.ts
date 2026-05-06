import * as vscode from "vscode"
import type { Feature, FeatureContext } from "../feature"

export class ClaudeCompatFeature implements Feature {
  readonly id = "claudeCodeCompat" as const
  readonly configKeys = ["strata-code.new.claudeCodeCompat"] as const
  readonly messageTypes = ["requestClaudeCompatSetting"] as const

  async onToggled(): Promise<void> {}

  onConfigChanged(e: vscode.ConfigurationChangeEvent, ctx: FeatureContext): void {
    if (e.affectsConfiguration("strata-code.new.claudeCodeCompat")) {
      this.pushState(ctx)
    }
  }

  handleMessage(message: any, ctx: FeatureContext): boolean {
    if (message.type === "requestClaudeCompatSetting") {
      this.pushState(ctx)
      return true
    }
    return false
  }

  pushState(ctx: FeatureContext): void {
    const config = vscode.workspace.getConfiguration("strata-code.new")
    ctx.post({
      type: "claudeCompatSettingLoaded",
      enabled: config.get<boolean>("claudeCodeCompat", false),
    })
  }

  dispose(): void {}
}
