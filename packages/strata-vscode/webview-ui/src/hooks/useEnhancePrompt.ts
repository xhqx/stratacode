import { createSignal, onCleanup } from "solid-js"
import type { ExtensionMessage, WebviewMessage } from "../types/messages"
import type { EnhancePromptResultMessage, EnhancePromptErrorMessage } from "../types/messages"

interface Vscode {
  postMessage(message: WebviewMessage): void
  onMessage(handler: (message: ExtensionMessage) => void): () => void
}

/**
 * Hook to manage prompt enhancement lifecycle: request-ID safety,
 * enhancing state, undo, and auto-send/save callbacks.
 */
export function useEnhancePrompt(vscode: Vscode, prefix: string) {
  const [enhancing, setEnhancing] = createSignal(false)
  let counter = 0
  let pretext: string | null = null
  let callback: ((text: string) => void) | null = null

  const rid = () => `enhance-${prefix}-${counter}`

  const unsubscribe = vscode.onMessage((message) => {
    if (message.type === "enhancePromptResult") {
      const result = message as EnhancePromptResultMessage
      if (result.requestId !== rid()) return
      setEnhancing(false)
      const cb = callback
      callback = null
      cb?.(result.text)
    }
    if (message.type === "enhancePromptError") {
      const result = message as EnhancePromptErrorMessage
      if (result.requestId !== rid()) return
      setEnhancing(false)
      callback = null
    }
  })

  onCleanup(unsubscribe)

  /** Start enhancing. Optionally provide a callback that fires when the result arrives. */
  const enhance = (text: string, cb?: (text: string) => void) => {
    if (!text.trim() || enhancing()) return
    pretext = text
    counter++
    callback = cb ?? null
    setEnhancing(true)
    vscode.postMessage({ type: "enhancePrompt", text: text.trim(), requestId: rid() })
  }

  /** Restore pre-enhance text. Returns null if nothing to undo. */
  const undo = (): string | null => {
    const prev = pretext
    pretext = null
    return prev
  }

  return { enhancing, enhance, undo }
}
