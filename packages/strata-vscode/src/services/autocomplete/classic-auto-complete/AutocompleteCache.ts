import type { FillInAtCursorSuggestion } from "../types"
import { findMatchingSuggestion, applyFirstLineOnly, MatchingSuggestionWithFillIn } from "./inline-utils"

const MAX_SUGGESTIONS_HISTORY = 20

export class AutocompleteCache {
  private suggestionsHistory: FillInAtCursorSuggestion[] = []

  public add(suggestion: FillInAtCursorSuggestion): void {
    const isDuplicate = this.suggestionsHistory.some(
      (existing) =>
        existing.text === suggestion.text &&
        existing.prefix === suggestion.prefix &&
        existing.suffix === suggestion.suffix,
    )

    if (isDuplicate) return

    this.suggestionsHistory.push(suggestion)

    if (this.suggestionsHistory.length > MAX_SUGGESTIONS_HISTORY) {
      this.suggestionsHistory.shift()
    }
  }

  public get(prefix: string, suffix: string): MatchingSuggestionWithFillIn | null {
    const match = findMatchingSuggestion(prefix, suffix, this.suggestionsHistory)
    return applyFirstLineOnly(match, prefix)
  }

  public clear(): void {
    this.suggestionsHistory.length = 0
  }
}
