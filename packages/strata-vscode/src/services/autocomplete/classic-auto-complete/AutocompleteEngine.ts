import * as vscode from "vscode"
import {
  extractPrefixSuffix,
  AutocompleteSuggestionContext,
  contextToAutocompleteInput,
  AutocompleteContextProvider,
  FillInAtCursorSuggestion,
  AutocompletePrompt,
  CostTrackingCallback,
  AutocompleteContext,
  LastSuggestionInfo,
} from "../types"
import { FimPromptBuilder } from "./FillInTheMiddle"
import { AutocompleteBackendClient } from "../AutocompleteBackendClient"
import { ContextRetrievalService } from "../continuedev/core/autocomplete/context/ContextRetrievalService"
import { VsCodeIde } from "../continuedev/core/vscode-test-harness/src/VSCodeIde"
import { RecentlyVisitedRangesService } from "../continuedev/core/vscode-test-harness/src/autocomplete/RecentlyVisitedRangesService"
import { RecentlyEditedTracker } from "../continuedev/core/vscode-test-harness/src/autocomplete/recentlyEdited"
import { postprocessAutocompleteSuggestion } from "./uselessSuggestionFilter"
import { shouldSkipAutocomplete } from "./contextualSkip"
import { FileIgnoreController } from "../shims/FileIgnoreController"
import { AutocompleteTelemetry } from "./AutocompleteTelemetry"
import { ErrorBackoff } from "./ErrorBackoff"
import { AutocompleteCache } from "./AutocompleteCache"
import { AutocompleteRequestScheduler } from "./AutocompleteRequestScheduler"

export class AutocompleteEngine {
  private cache = new AutocompleteCache()
  private scheduler = new AutocompleteRequestScheduler()
  
  private fimPromptBuilder: FimPromptBuilder
  private recentlyVisitedRangesService: RecentlyVisitedRangesService
  private recentlyEditedTracker: RecentlyEditedTracker
  private ignoreController: Promise<FileIgnoreController>
  
  private fimAbortController: AbortController | null = null
  public readonly backoff = new ErrorBackoff()
  
  public lastSuggestion: LastSuggestionInfo | null = null
  private fatalNotified = false

  constructor(
    context: vscode.ExtensionContext,
    private client: AutocompleteBackendClient,
    private costTrackingCallback: CostTrackingCallback,
    workspacePath: string,
    private telemetry: AutocompleteTelemetry | null,
    private onFatalError: ((status: number | null) => void) | null
  ) {
    this.ignoreController = (async () => {
      const controller = new FileIgnoreController(workspacePath)
      await controller.initialize()
      return controller
    })()

    const ide = new VsCodeIde(context)
    const contextService = new ContextRetrievalService(ide)
    const contextProvider: AutocompleteContextProvider = {
      ide,
      contextService,
      model: client,
      ignoreController: this.ignoreController,
    }
    this.fimPromptBuilder = new FimPromptBuilder(contextProvider)

    this.recentlyVisitedRangesService = new RecentlyVisitedRangesService(ide)
    this.recentlyEditedTracker = new RecentlyEditedTracker(ide)
  }

  public async getCompletion(document: vscode.TextDocument, position: vscode.Position): Promise<string | null> {
    const telemetryContext: AutocompleteContext = {
      languageId: document.languageId,
      modelId: this.client.getModelName(),
      provider: this.client.getProviderDisplayName(),
    }

    this.telemetry?.captureSuggestionRequested(telemetryContext)

    if (!this.checkClientValidity() || await this.isBlockedByBackoff()) {
      return null
    }

    if (!document?.uri?.fsPath || await this.isIgnored(document)) {
      return null
    }

    const { prefix, suffix } = extractPrefixSuffix(document, position)
    
    // 1. Check cache first
    const cachedMatch = this.cache.get(prefix, suffix)
    if (cachedMatch) {
      this.lastSuggestion = { ...telemetryContext, length: cachedMatch.text.length }
      this.telemetry?.captureCacheHit(cachedMatch.matchType, telemetryContext, cachedMatch.text.length)
      this.telemetry?.startVisibilityTracking(cachedMatch.fillInAtCursor, "cache", telemetryContext)
      return cachedMatch.text
    }

    this.telemetry?.cancelVisibilityTracking()

    // 2. Skip if inappropriate to trigger LLM
    if (shouldSkipAutocomplete(prefix, suffix, document.languageId)) {
      return null
    }

    // 3. Fetch from LLM via scheduler
    const { prompt, prefix: promptPrefix, suffix: promptSuffix } = await this.getPrompt(document, position)
    await this.scheduler.schedule(promptPrefix, promptSuffix, () => 
      this.fetchAndCacheSuggestion(prompt, promptPrefix, promptSuffix, document.languageId)
    )

    // 4. Return result from cache if LLM returned one
    const newCachedMatch = this.cache.get(prefix, suffix)
    if (newCachedMatch) {
      this.lastSuggestion = { ...telemetryContext, length: newCachedMatch.text.length }
      this.telemetry?.captureLlmSuggestionReturned(telemetryContext, newCachedMatch.text.length)
      this.telemetry?.startVisibilityTracking(newCachedMatch.fillInAtCursor, "llm", telemetryContext)
      return newCachedMatch.text
    } else {
      this.telemetry?.cancelVisibilityTracking()
    }

    return null
  }

  private async fetchAndCacheSuggestion(
    prompt: AutocompletePrompt,
    prefix: string,
    suffix: string,
    languageId: string
  ): Promise<void> {
    this.fimAbortController?.abort()
    const controller = new AbortController()
    this.fimAbortController = controller

    const startTime = performance.now()
    const telemetryContext: AutocompleteContext = {
      languageId,
      modelId: this.client.getModelName(),
      provider: this.client.getProviderDisplayName(),
    }

    if (!this.client.hasValidCredentials()) return

    try {
      const curriedProcess = (text: string) => this.processSuggestion(text, prefix, suffix, telemetryContext, languageId)
      
      const result = await this.fimPromptBuilder.getFromFIM(
        this.client,
        prompt,
        curriedProcess,
        controller.signal
      )

      const latencyMs = performance.now() - startTime
      this.telemetry?.captureLlmRequestCompleted(
        { latencyMs, cost: result.cost, inputTokens: result.inputTokens, outputTokens: result.outputTokens },
        telemetryContext
      )
      this.scheduler.recordLatency(latencyMs)
      this.costTrackingCallback(result.cost, result.inputTokens, result.outputTokens)
      
      this.backoff.success()
      this.fatalNotified = false
      
      this.cache.add(result.suggestion)
    } catch (error) {
      if (controller.signal.aborted) return

      const latencyMs = performance.now() - startTime
      this.telemetry?.captureLlmRequestFailed(
        { latencyMs, error: error instanceof Error ? error.message : String(error) },
        telemetryContext
      )

      const kind = this.backoff.failure(error)
      if (kind === "fatal" && !this.fatalNotified) {
        this.fatalNotified = true
        this.onFatalError?.(this.backoff.getFatalStatus())
      }
    }
  }

  private processSuggestion(
    suggestionText: string,
    prefix: string,
    suffix: string,
    telemetryContext: AutocompleteContext,
    languageId?: string
  ): FillInAtCursorSuggestion {
    if (!suggestionText) {
      this.telemetry?.captureSuggestionFiltered("empty_response", telemetryContext)
      return { text: "", prefix, suffix }
    }

    const processedText = postprocessAutocompleteSuggestion({
      suggestion: suggestionText,
      prefix,
      suffix,
      model: this.client.getModelName() || "",
      languageId,
    })

    if (processedText) {
      return { text: processedText, prefix, suffix }
    }

    this.telemetry?.captureSuggestionFiltered("filtered_by_postprocessing", telemetryContext)
    return { text: "", prefix, suffix }
  }

  private async getPrompt(
    document: vscode.TextDocument,
    position: vscode.Position
  ): Promise<{ prompt: AutocompletePrompt; prefix: string; suffix: string }> {
    const recentlyVisitedRanges = this.recentlyVisitedRangesService.getSnippets()
    const recentlyEditedRanges = await this.recentlyEditedTracker.getRecentlyEditedRanges()

    const context: AutocompleteSuggestionContext = {
      document,
      range: new vscode.Range(position, position),
      recentlyVisitedRanges,
      recentlyEditedRanges,
    }

    const autocompleteInput = contextToAutocompleteInput(context)
    const { prefix, suffix } = extractPrefixSuffix(document, position)
    const prompt = await this.fimPromptBuilder.getFimPrompts(autocompleteInput, this.client.getModelName() ?? "codestral")

    return { prompt, prefix, suffix }
  }

  private async isIgnored(document: vscode.TextDocument): Promise<boolean> {
    if (document.isUntitled) return false
    try {
      const controller = await Promise.race([
        this.ignoreController,
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 50)),
      ])
      if (!controller) return true
      return !controller.validateAccess(document.fileName)
    } catch {
      return true
    }
  }

  private checkClientValidity(): boolean {
    if (!this.client || !this.client.hasValidCredentials()) {
      return false
    }
    return true
  }

  private async isBlockedByBackoff(): Promise<boolean> {
    if (this.backoff.blocked()) {
      if (this.backoff.getFatalStatus() === 402 && this.backoff.shouldProbe()) {
        const funded = await this.client.hasBalance()
        if (funded) {
          this.backoff.reset()
          this.fatalNotified = false
        }
      }
      if (this.backoff.blocked()) return true
    }
    return false
  }

  public resetBackoff(): void {
    this.backoff.reset()
    this.fatalNotified = false
  }

  public dispose(): void {
    this.scheduler.dispose()
    this.cache.clear()
    this.fimAbortController?.abort()
    this.fimAbortController = null
    this.telemetry?.dispose()
    this.recentlyVisitedRangesService.dispose()
    this.recentlyEditedTracker.dispose()
    this.ignoreController.then(c => c?.dispose()).catch(() => {})
  }
}
