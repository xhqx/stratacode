import * as vscode from "vscode"
import { AutocompleteServiceSettings } from "../AutocompleteSettingsManager"
import { AutocompleteBackendClient } from "../AutocompleteBackendClient"
import { AutocompleteTelemetry } from "./AutocompleteTelemetry"
import { AutocompleteEngine } from "./AutocompleteEngine"
import { CostTrackingCallback } from "../types"

export const INLINE_COMPLETION_ACCEPTED_COMMAND = "stratacode.autocomplete.inline-completion.accepted"

export function stringToInlineCompletions(text: string, position: vscode.Position): vscode.InlineCompletionItem[] {
  if (text === "") {
    return []
  }

  const item = new vscode.InlineCompletionItem(text, new vscode.Range(position, position), {
    command: INLINE_COMPLETION_ACCEPTED_COMMAND,
    title: "Autocomplete Accepted",
  })
  return [item]
}

export class AutocompleteInlineCompletionProvider implements vscode.InlineCompletionItemProvider {
  private engine: AutocompleteEngine
  private getSettings: () => AutocompleteServiceSettings
  private acceptedCommand: vscode.Disposable | null = null

  constructor(
    context: vscode.ExtensionContext,
    client: AutocompleteBackendClient,
    costTrackingCallback: CostTrackingCallback,
    getSettings: () => AutocompleteServiceSettings,
    workspacePath: string,
    telemetry: AutocompleteTelemetry | null = null,
    onFatalError?: (status: number | null) => void,
  ) {
    this.getSettings = getSettings
    this.engine = new AutocompleteEngine(
      context,
      client,
      costTrackingCallback,
      workspacePath,
      telemetry,
      onFatalError ?? null,
    )

    this.acceptedCommand = vscode.commands.registerCommand(INLINE_COMPLETION_ACCEPTED_COMMAND, () => {
      telemetry?.captureAcceptSuggestion(this.engine.lastSuggestion?.length)
      vscode.commands.executeCommand("setContext", "strata-code.new.autocomplete.hasSuggestions", false)
    })
  }

  public resetBackoff(): void {
    this.engine.resetBackoff()
  }

  public dispose(): void {
    this.engine.dispose()
    if (this.acceptedCommand) {
      this.acceptedCommand.dispose()
      this.acceptedCommand = null
    }
  }

  public async provideInlineCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    _context: vscode.InlineCompletionContext,
    _token: vscode.CancellationToken,
  ): Promise<vscode.InlineCompletionItem[] | vscode.InlineCompletionList> {
    const settings = this.getSettings()
    const isAutoTriggerEnabled = settings?.enableAutoTrigger ?? false

    if (!isAutoTriggerEnabled) {
      return []
    }

    return this.provideInlineCompletionItems_Internal(document, position, _context, _token)
  }

  public async provideInlineCompletionItems_Internal(
    document: vscode.TextDocument,
    position: vscode.Position,
    _context: vscode.InlineCompletionContext,
    _token: vscode.CancellationToken,
  ): Promise<vscode.InlineCompletionItem[] | vscode.InlineCompletionList> {
    vscode.commands.executeCommand("setContext", "strata-code.new.autocomplete.hasSuggestions", false)

    try {
      const completionText = await this.engine.getCompletion(document, position)

      if (completionText) {
        vscode.commands.executeCommand("setContext", "strata-code.new.autocomplete.hasSuggestions", true)
        return stringToInlineCompletions(completionText, position)
      }
      return []
    } catch (err) {
      console.debug("[Strata] autocomplete: inline completion failed:", err)
      return []
    }
  }
}
