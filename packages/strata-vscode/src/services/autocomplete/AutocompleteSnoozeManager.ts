import { AutocompleteSettingsManager } from "./AutocompleteSettingsManager"

type SnoozeStateListener = (isSnoozed: boolean) => void

export class AutocompleteSnoozeManager {
  private snoozeTimer: NodeJS.Timeout | null = null
  private settingsManager: AutocompleteSettingsManager
  private listeners: Set<SnoozeStateListener> = new Set()

  constructor(settingsManager: AutocompleteSettingsManager) {
    this.settingsManager = settingsManager
    this.setupSnoozeTimerIfNeeded()
  }

  public onSnoozeStateChanged(listener: SnoozeStateListener): void {
    this.listeners.add(listener)
  }

  public isSnoozed(): boolean {
    const snoozeUntil = this.settingsManager.getSettings().snoozeUntil
    if (!snoozeUntil) return false
    return Date.now() < snoozeUntil
  }

  public getSnoozeRemainingSeconds(): number {
    const snoozeUntil = this.settingsManager.getSettings().snoozeUntil
    if (!snoozeUntil) return 0
    return Math.max(0, Math.ceil((snoozeUntil - Date.now()) / 1000))
  }

  public async snooze(seconds: number): Promise<void> {
    this.clearTimer()

    const snoozeUntil = Date.now() + seconds * 1000
    await this.settingsManager.updateSetting("snoozeUntil", snoozeUntil)

    this.snoozeTimer = setTimeout(() => {
      void this.unsnooze()
    }, seconds * 1000)

    this.notifyListeners()
  }

  public async unsnooze(): Promise<void> {
    this.clearTimer()
    await this.settingsManager.updateSetting("snoozeUntil", undefined)
    this.notifyListeners()
  }

  private setupSnoozeTimerIfNeeded(): void {
    this.clearTimer()

    const remainingMs = this.getSnoozeRemainingMs()
    if (remainingMs <= 0) return

    this.snoozeTimer = setTimeout(() => {
      void this.unsnooze()
    }, remainingMs)
  }

  private getSnoozeRemainingMs(): number {
    const snoozeUntil = this.settingsManager.getSettings().snoozeUntil
    if (!snoozeUntil) return 0
    return Math.max(0, snoozeUntil - Date.now())
  }

  private clearTimer(): void {
    if (this.snoozeTimer) {
      clearTimeout(this.snoozeTimer)
      this.snoozeTimer = null
    }
  }

  private notifyListeners(): void {
    const snoozed = this.isSnoozed()
    for (const listener of this.listeners) {
      listener(snoozed)
    }
  }

  public dispose(): void {
    this.clearTimer()
    this.listeners.clear()
  }
}
