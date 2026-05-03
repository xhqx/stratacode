// stratacode_change - new file
import { createSignal, onCleanup, onMount } from "solid-js"
import type { ExtensionMessage, WebviewMessage } from "../types/messages"

const FETCH_DEBOUNCE_MS = 500

interface VSCodeContext {
  postMessage: (message: WebviewMessage) => void
  onMessage: (handler: (message: ExtensionMessage) => void) => () => void
}

export interface TaskSuggestions {
  suggestions: () => string[]
  loading: () => boolean
  enabled: () => boolean
  refresh: () => void
}

let globalCounter = 0

/**
 * Hook that manages task suggestion chips below the chat input.
 *
 * - Fetches suggestions automatically when the chat panel opens (empty input).
 * - Re-fetches when the context map has been updated since the last fetch.
 * - Uses the requestId to guard against stale responses (request races).
 * - Respects the taskSuggestionsEnabled setting from autocomplete settings.
 */
export function useTaskSuggestions(vscode: VSCodeContext, hasActiveSession: () => boolean): TaskSuggestions {
  const [suggestions, setSuggestions] = createSignal<string[]>([])
  const [loading, setLoading] = createSignal(false)
  const [enabled, setEnabled] = createSignal(true)

  // Timestamp of the context map at last successful fetch.
  // Prevents redundant re-fetches if context hasn't changed.
  let lastContextMapUpdated = 0
  let currentRequestId = ""
  let timer: ReturnType<typeof setTimeout> | undefined

  const unsubscribe = vscode.onMessage((message) => {
    if (message.type === "taskSuggestionsResult") {
      if (message.requestId !== currentRequestId) return
      setLoading(false)
      setSuggestions(message.suggestions)
      lastContextMapUpdated = message.contextMapUpdated
      return
    }
    if (message.type === "autocompleteSettingsLoaded") {
      setEnabled(message.settings.taskSuggestionsEnabled ?? true)
    }
  })

  onCleanup(() => {
    unsubscribe()
    if (timer) clearTimeout(timer)
  })

  onMount(() => {
    // Request settings first, then schedule initial fetch
    vscode.postMessage({ type: "requestAutocompleteSettings" })
    scheduleInitialFetch()
  })

  function scheduleInitialFetch() {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      if (!enabled()) return
      if (!hasActiveSession()) return
      fetch()
    }, FETCH_DEBOUNCE_MS)
  }

  function fetch() {
    if (!enabled()) return
    globalCounter++
    currentRequestId = `task-suggestions-${globalCounter}`
    setLoading(true)
    vscode.postMessage({ type: "requestTaskSuggestions", requestId: currentRequestId })
  }

  function refresh() {
    // Force refresh regardless of cache state
    lastContextMapUpdated = 0
    fetch()
  }

  return {
    suggestions,
    loading,
    enabled,
    refresh,
  }
}
