import { Logger } from "../stratacode/logger"
import { getErrorMessage } from "../strata-provider-utils"

/**
 * Execute an async operation and catch any errors, logging them and sending an error message to the webview.
 * Replaces boilerplate try/catch blocks that log and post { type: "error" }.
 * 
 * @param label A descriptive label for the operation (used in logs)
 * @param post A function to send messages to the webview
 * @param fn The async operation to execute
 * @returns The result of `fn`, or `undefined` if an error occurred.
 */
export async function withErrorBoundary<T>(
  label: string,
  post: (msg: unknown) => void,
  fn: () => Promise<T>,
  errorPayload?: Record<string, unknown>,
  onError?: (error: unknown, errorMessage: string) => void
): Promise<T | undefined> {
  try {
    return await fn()
  } catch (error) {
    Logger.error("StrataProvider", `${label} failed:`, error)
    const errorMessage = getErrorMessage(error) || `Failed to ${label}`
    post({ type: "error", message: errorMessage, ...errorPayload })
    if (onError) {
      onError(error, errorMessage)
    }
    return undefined
  }
}
