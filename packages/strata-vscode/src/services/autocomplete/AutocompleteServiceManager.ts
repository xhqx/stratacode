import crypto from "crypto"
import * as vscode from "vscode"
import { t } from "./shims/i18n"
import { TelemetryProxy, TelemetryEventName } from "../telemetry"
import { AutocompleteBackendClient } from "./AutocompleteBackendClient"
import { AutocompleteCodeActionProvider } from "./AutocompleteCodeActionProvider"
import { AutocompleteInlineCompletionProvider } from "./classic-auto-complete/AutocompleteInlineCompletionProvider"
import { AutocompleteTelemetry } from "./classic-auto-complete/AutocompleteTelemetry"
import type { StrataConnectionService } from "../cli-backend"

import { AutocompleteSettingsManager } from "./AutocompleteSettingsManager"
import { AutocompleteSnoozeManager } from "./AutocompleteSnoozeManager"
import { AutocompleteStatusBarManager } from "./AutocompleteStatusBarManager"

export class AutocompleteServiceManager {
  private static _instance: AutocompleteServiceManager | null = null

  private readonly model: AutocompleteBackendClient
  private readonly context: vscode.ExtensionContext
  private readonly settingsManager: AutocompleteSettingsManager
  public readonly snoozeManager: AutocompleteSnoozeManager
  private readonly statusBarManager: AutocompleteStatusBarManager

  private taskId: string | null = null

  // VSCode Providers
  public readonly codeActionProvider: AutocompleteCodeActionProvider
  public readonly inlineCompletionProvider: AutocompleteInlineCompletionProvider
  private inlineCompletionProviderDisposable: vscode.Disposable | null = null

  private unsubscribeState: (() => void) | null = null
  private unsubscribeEvent: (() => void) | null = null
  private settingsDisposable: vscode.Disposable | null = null

  constructor(context: vscode.ExtensionContext, connectionService: StrataConnectionService) {
    if (AutocompleteServiceManager._instance) {
      throw new Error(
        "AutocompleteServiceManager is a singleton. Use AutocompleteServiceManager.getInstance() instead.",
      )
    }

    this.context = context
    AutocompleteServiceManager._instance = this

    this.settingsManager = AutocompleteSettingsManager.getInstance()
    this.snoozeManager = new AutocompleteSnoozeManager(this.settingsManager)

    // Register Internal Components
    this.model = new AutocompleteBackendClient(connectionService)

    this.statusBarManager = new AutocompleteStatusBarManager(this.settingsManager, this.model)

    const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? ""

    // Register the providers
    this.codeActionProvider = new AutocompleteCodeActionProvider()
    this.inlineCompletionProvider = new AutocompleteInlineCompletionProvider(
      this.context,
      this.model,
      this.updateCostTracking.bind(this),
      () => this.settingsManager.getSettings(),
      workspacePath,
      new AutocompleteTelemetry(),
      (status) => this.handleFatalAutocompleteError(status),
    )

    // Reload when CLI backend connection state changes
    this.unsubscribeState = connectionService.onStateChange(() => {
      this.inlineCompletionProvider.resetBackoff()
      void this.load()
    })

    // Reset error backoff when auth state changes
    this.unsubscribeEvent = connectionService.onEventFiltered(
      (event) => event.type === "global.disposed",
      () => this.inlineCompletionProvider.resetBackoff(),
    )

    // Watch for VS Code settings changes and reload
    this.settingsDisposable = this.settingsManager.onDidChangeConfiguration(() => {
      void this.load()
    })

    // Listen for snooze state changes
    this.snoozeManager.onSnoozeStateChanged(() => {
      void this.ensureInlineCompletionProviderRegistration()
      this.statusBarManager.update(this.snoozeManager.isSnoozed())
    })

    void this.load()
  }

  public static getInstance(): AutocompleteServiceManager | null {
    return AutocompleteServiceManager._instance
  }

  public async load() {
    const settings = this.settingsManager.getSettings()

    // stratacode_change start
    if (!settings.enabled) {
      if (this.inlineCompletionProviderDisposable) {
        this.inlineCompletionProviderDisposable.dispose()
        this.inlineCompletionProviderDisposable = null
      }
      vscode.commands.executeCommand("setContext", "stratacode.autocomplete.enabled", false)
      return
    }
    // stratacode_change end

    if (settings.model) {
      this.model.setModel(settings.model)
    }

    await this.updateGlobalContext()
    this.statusBarManager.update(this.snoozeManager.isSnoozed())
    await this.ensureInlineCompletionProviderRegistration()
  }

  private async ensureInlineCompletionProviderRegistration() {
    const settings = this.settingsManager.getSettings()
    const shouldBeRegistered = settings.enableAutoTrigger && !this.snoozeManager.isSnoozed()
    const isRegistered = this.inlineCompletionProviderDisposable !== null

    if (shouldBeRegistered === isRegistered) {
      return
    }

    if (!shouldBeRegistered) {
      this.inlineCompletionProviderDisposable!.dispose()
      this.inlineCompletionProviderDisposable = null
      return
    }

    this.inlineCompletionProviderDisposable = vscode.languages.registerInlineCompletionItemProvider(
      { scheme: "file" },
      this.inlineCompletionProvider,
    )
  }

  public async disable() {
    await this.settingsManager.updateSettings({
      enableAutoTrigger: false,
      enableSmartInlineTaskKeybinding: false,
    })

    TelemetryProxy.capture(TelemetryEventName.GHOST_SERVICE_DISABLED)
    await this.load()
  }

  public async codeSuggestion() {
    const editor = vscode.window.activeTextEditor
    if (!editor) {
      return
    }

    this.taskId = crypto.randomUUID()
    TelemetryProxy.capture(TelemetryEventName.INLINE_ASSIST_AUTO_TASK, {
      taskId: this.taskId,
    })

    const document = editor.document
    const position = editor.selection.active
    const context: vscode.InlineCompletionContext = {
      triggerKind: vscode.InlineCompletionTriggerKind.Invoke,
      selectedCompletionInfo: undefined,
    }
    const tokenSource = new vscode.CancellationTokenSource()

    const completions = await this.inlineCompletionProvider.provideInlineCompletionItems_Internal(
      document,
      position,
      context,
      tokenSource.token,
    )
    tokenSource.dispose()

    if (completions && (Array.isArray(completions) ? completions.length > 0 : completions.items.length > 0)) {
      const items = Array.isArray(completions) ? completions : completions.items
      const firstCompletion = items[0]

      if (firstCompletion?.insertText) {
        const insertText =
          typeof firstCompletion.insertText === "string" ? firstCompletion.insertText : firstCompletion.insertText.value

        await editor.edit((editBuilder) => {
          editBuilder.insert(position, insertText)
        })
      }
    }
  }

  private async updateGlobalContext() {
    const settings = this.settingsManager.getSettings()
    await vscode.commands.executeCommand(
      "setContext",
      "stratacode.autocomplete.enableSmartInlineTaskKeybinding",
      settings.enableSmartInlineTaskKeybinding,
    )
  }

  private handleFatalAutocompleteError(status: number | null): void {
    const msg =
      status === 402
        ? t("stratacode:autocomplete.creditsExhausted.message")
        : t("stratacode:autocomplete.authError.message")

    if (status === 402) {
      vscode.window.showWarningMessage(msg, t("stratacode:autocomplete.creditsExhausted.addCredits")).then((choice) => {
        if (choice === t("stratacode:autocomplete.creditsExhausted.addCredits")) {
          vscode.env.openExternal(vscode.Uri.parse("https://app.strata.ai/credits"))
        }
      })
    } else {
      vscode.window.showWarningMessage(msg)
    }
  }

  private updateCostTracking(cost: number, _inputTokens: number, _outputTokens: number): void {
    this.statusBarManager.recordCompletion(cost)
  }

  public async showIncompatibilityExtensionPopup() {
    const message = t("stratacode:autocomplete.incompatibilityExtensionPopup.message")
    const disableCopilot = t("stratacode:autocomplete.incompatibilityExtensionPopup.disableCopilot")
    const disableInlineAssist = t("stratacode:autocomplete.incompatibilityExtensionPopup.disableInlineAssist")
    const response = await vscode.window.showErrorMessage(message, disableCopilot, disableInlineAssist)

    if (response === disableCopilot) {
      await vscode.commands.executeCommand("github.copilot.completions.disable")
    } else if (response === disableInlineAssist) {
      await vscode.commands.executeCommand("strata-code.new.autocomplete.disable")
    }
  }

  public dispose(): void {
    this.statusBarManager.dispose()
    this.snoozeManager.dispose()

    this.unsubscribeState?.()
    this.unsubscribeState = null
    this.unsubscribeEvent?.()
    this.unsubscribeEvent = null
    this.settingsDisposable?.dispose()
    this.settingsDisposable = null

    if (this.inlineCompletionProviderDisposable) {
      this.inlineCompletionProviderDisposable.dispose()
      this.inlineCompletionProviderDisposable = null
    }

    this.inlineCompletionProvider.dispose()

    AutocompleteServiceManager._instance = null
  }

  /**
   * Reset the singleton instance (for testing purposes only)
   * @internal
   */
  public static _resetInstance(): void {
    AutocompleteServiceManager._instance = null
  }
}
