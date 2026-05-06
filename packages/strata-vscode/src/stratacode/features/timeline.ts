import * as vscode from "vscode"
import type { Feature, FeatureContext } from "../feature"
import { isEnabled } from "../feature-gate"

export class TimelineFeature implements Feature {
  readonly id = "taskTimeline" as const
  readonly configKeys = ["strata-code.new.features"] as const // Watch the whole features block for simplicity
  readonly messageTypes = ["requestTimelineSetting"] as const

  async onToggled(): Promise<void> {}

  onConfigChanged(e: vscode.ConfigurationChangeEvent, ctx: FeatureContext): void {
    // If the features block changes, we might need to push the timeline setting.
    // In practice, this feature's setting is handled by the feature registry directly,
    // but the webview needs `timelineSettingLoaded`.
    if (e.affectsConfiguration("strata-code.new.features")) {
      this.pushState(ctx)
    }
  }

  handleMessage(message: any, ctx: FeatureContext): boolean {
    if (message.type === "requestTimelineSetting") {
      this.pushState(ctx)
      return true
    }
    return false
  }

  pushState(ctx: FeatureContext): void {
    ctx.post({
      type: "timelineSettingLoaded",
      visible: isEnabled("taskTimeline"),
    })
  }

  dispose(): void {}
}
