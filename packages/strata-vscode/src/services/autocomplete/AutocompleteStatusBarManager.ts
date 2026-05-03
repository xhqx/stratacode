import { AutocompleteStatusBar } from "./AutocompleteStatusBar"
import { AutocompleteSettingsManager } from "./AutocompleteSettingsManager"
import { AutocompleteBackendClient } from "./AutocompleteBackendClient"

export class AutocompleteStatusBarManager {
  private statusBar: AutocompleteStatusBar
  private sessionCost: number = 0
  private completionCount: number = 0
  private sessionStartTime: number = Date.now()

  constructor(
    private settingsManager: AutocompleteSettingsManager,
    private client: AutocompleteBackendClient
  ) {
    this.statusBar = new AutocompleteStatusBar({
      enabled: false,
      model: "loading...",
      provider: "loading...",
      totalSessionCost: 0,
      completionCount: 0,
      sessionStartTime: this.sessionStartTime,
    })
    this.update()
  }

  public recordCompletion(cost: number): void {
    this.completionCount++
    this.sessionCost += cost
    this.update()
  }

  public update(isSnoozed: boolean = false): void {
    const settings = this.settingsManager.getSettings()
    
    this.statusBar.update({
      enabled: settings.enableAutoTrigger,
      snoozed: isSnoozed,
      model: this.client.getModelName(),
      provider: this.client.getProviderDisplayName(),
      profileName: this.client.profileName,
      hasNoUsableProvider: !this.client.hasValidCredentials(),
      totalSessionCost: this.sessionCost,
      completionCount: this.completionCount,
      sessionStartTime: this.sessionStartTime,
    })
  }

  public dispose(): void {
    this.statusBar.dispose()
  }
}
