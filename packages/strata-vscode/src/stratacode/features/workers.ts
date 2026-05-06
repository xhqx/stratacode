import * as vscode from "vscode"
import type { Feature, FeatureContext } from "../feature"

export class WorkersFeature implements Feature {
  readonly id = "workers" as const
  readonly configKeys = [] as const
  readonly messageTypes = [] as const

  async onToggled(enabled: boolean, ctx: FeatureContext): Promise<void> {
    await vscode.workspace
      .getConfiguration("strata-code.new")
      .update("workers.enabled", enabled, vscode.ConfigurationTarget.Global)
  }

  onConfigChanged(): void {}
  handleMessage(): boolean {
    return false
  }
  pushState(): void {}
  dispose(): void {}
}

export class ExplainerWorkerFeature implements Feature {
  readonly id = "explainerWorker" as const
  readonly configKeys = [] as const
  readonly messageTypes = [] as const

  async onToggled(enabled: boolean, ctx: FeatureContext): Promise<void> {
    if (!enabled) {
      await vscode.workspace
        .getConfiguration("strata-code.new")
        .update("workers.autoExplain", false, vscode.ConfigurationTarget.Global)
    }
  }

  onConfigChanged(): void {}
  handleMessage(): boolean {
    return false
  }
  pushState(): void {}
  dispose(): void {}
}

export class PromptAutocompleteFeature implements Feature {
  readonly id = "promptAutocomplete" as const
  readonly configKeys = [] as const
  readonly messageTypes = [] as const

  async onToggled(enabled: boolean, ctx: FeatureContext): Promise<void> {
    await vscode.workspace
      .getConfiguration("strata-code.new")
      .update("enableChatAutocomplete", enabled, vscode.ConfigurationTarget.Global)
  }

  onConfigChanged(): void {}
  handleMessage(): boolean {
    return false
  }
  pushState(): void {}
  dispose(): void {}
}
