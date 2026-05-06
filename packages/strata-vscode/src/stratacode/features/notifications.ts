import * as vscode from "vscode"
import type { Feature, FeatureContext } from "../feature"

export class NotificationsFeature implements Feature {
  readonly id = "notifications" as const
  readonly configKeys = ["strata-code.new.notifications", "strata-code.new.sounds"] as const
  readonly messageTypes = ["requestNotificationSettings"] as const

  async onToggled(): Promise<void> {
    // "notifications" feature is not a simple toggle in the feature registry,
    // or if it is, there is no top-level "features.notifications" toggle mapping.
    // If it is toggled via settings UI, it updates specific keys directly.
  }

  onConfigChanged(e: vscode.ConfigurationChangeEvent, ctx: FeatureContext): void {
    if (e.affectsConfiguration("strata-code.new.notifications") || e.affectsConfiguration("strata-code.new.sounds")) {
      this.pushState(ctx)
    }
  }

  handleMessage(message: any, ctx: FeatureContext): boolean {
    if (message.type === "requestNotificationSettings") {
      this.pushState(ctx)
      return true
    }
    return false
  }

  pushState(ctx: FeatureContext): void {
    const notifications = vscode.workspace.getConfiguration("strata-code.new.notifications")
    const sounds = vscode.workspace.getConfiguration("strata-code.new.sounds")
    ctx.post({
      type: "notificationSettingsLoaded",
      settings: {
        notifyAgent: notifications.get<boolean>("agent", true),
        notifyPermissions: notifications.get<boolean>("permissions", true),
        notifyErrors: notifications.get<boolean>("errors", true),
        soundAgent: sounds.get<string>("agent", "default"),
        soundPermissions: sounds.get<string>("permissions", "default"),
        soundErrors: sounds.get<string>("errors", "default"),
      },
    })
  }

  dispose(): void {}
}
