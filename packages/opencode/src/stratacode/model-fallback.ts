// stratacode_change - new file
import type { Agent } from "@/agent/agent"
import { Provider } from "@/provider"
import { MessageV2 } from "@/session/message-v2"

/**
 * Build ordered candidate list from an agent's fallback_models field.
 * Returns [] when no fallbacks are configured.
 */
export function candidates(agent: Agent.Info | undefined) {
  if (!agent?.fallback_models?.length) return []
  return agent.fallback_models.map(Provider.parseModel)
}

/**
 * Returns true if the error justifies trying the next fallback model.
 * Triggers on:
 *  - ModelNotFoundError (model doesn't exist)
 *  - APIError with 4xx or 5xx status (rate limit, auth, overloaded, etc.)
 */
export function shouldFallback(error: unknown): boolean {
  if (error == null || typeof error !== "object") return false
  if (Provider.ModelNotFoundError.isInstance(error)) return true
  if (MessageV2.APIError.isInstance(error)) {
    const status = error.data.statusCode
    return status !== undefined && status >= 400 && status < 600
  }
  return false
}
