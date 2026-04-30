import type { NamedError } from "@opencode-ai/shared/util/error"
import { Cause, Clock, Duration, Effect, Schedule } from "effect"
import { MessageV2 } from "./message-v2"
import { isStrataError } from "@/stratacode/strata-errors" // stratacode_change
import { SessionNetwork } from "./network" // stratacode_change
import { iife } from "@/util/iife"

export type Err = ReturnType<NamedError["toObject"]>

// This exported message is shared with the TUI upsell detector. Matching on a
// literal error string kind of sucks, but it is the simplest for now.
export const GO_UPSELL_MESSAGE = "Free usage exceeded, subscribe to Go https://opencode.ai/go"

export const RETRY_INITIAL_DELAY = 2000
export const RETRY_BACKOFF_FACTOR = 2
export const RETRY_MAX_DELAY_NO_HEADERS = 30_000 // 30 seconds
export const RETRY_MAX_DELAY = 2_147_483_647 // max 32-bit signed integer for setTimeout

function cap(ms: number) {
  return Math.min(ms, RETRY_MAX_DELAY)
}

export function delay(
  attempt: number,
  error?: MessageV2.APIError,
  baseDelay = RETRY_INITIAL_DELAY, // stratacode_change
  maxDelayCap = RETRY_MAX_DELAY_NO_HEADERS, // stratacode_change
) {
  if (error) {
    const headers = error.data.responseHeaders
    if (headers) {
      const retryAfterMs = headers["retry-after-ms"]
      if (retryAfterMs) {
        const parsedMs = Number.parseFloat(retryAfterMs)
        if (!Number.isNaN(parsedMs)) {
          return cap(parsedMs)
        }
      }

      const retryAfter = headers["retry-after"]
      if (retryAfter) {
        const parsedSeconds = Number.parseFloat(retryAfter)
        if (!Number.isNaN(parsedSeconds)) {
          // convert seconds to milliseconds
          return cap(Math.ceil(parsedSeconds * 1000))
        }
        // Try parsing as HTTP date format
        const parsed = Date.parse(retryAfter) - Date.now()
        if (!Number.isNaN(parsed) && parsed > 0) {
          return cap(Math.ceil(parsed))
        }
      }

      return cap(baseDelay * Math.pow(RETRY_BACKOFF_FACTOR, attempt - 1)) // stratacode_change
    }
  }

  return cap(Math.min(baseDelay * Math.pow(RETRY_BACKOFF_FACTOR, attempt - 1), maxDelayCap)) // stratacode_change
}

export function retryable(error: Err) {
  // context overflow errors should not be retried
  if (MessageV2.ContextOverflowError.isInstance(error)) return undefined
  if (MessageV2.APIError.isInstance(error)) {
    const status = error.data.statusCode
    // stratacode_change start - Current Strata errors require user action (login/signup), don't retry
    if (isStrataError(error)) return undefined
    // stratacode_change end

    // 5xx errors are transient server failures and should always be retried,
    // even when the provider SDK doesn't explicitly mark them as retryable.
    if (!error.data.isRetryable && !(status !== undefined && status >= 500)) return undefined

    // stratacode_change start - FreeUsageLimitError is not retryable: retrying the same
    // capped model is futile and the backoff loop cannot be broken by switching
    // models in the chat selector (the retry loop holds a stale model ref).
    if (error.data.responseBody?.includes("FreeUsageLimitError")) return undefined
    // stratacode_change end
    return error.data.message.includes("Overloaded") ? "Provider is overloaded" : error.data.message
  }

  // Check for rate limit patterns in plain text error messages
  const msg = error.data?.message
  if (typeof msg === "string") {
    const lower = msg.toLowerCase()
    if (
      lower.includes("rate increased too quickly") ||
      lower.includes("rate limit") ||
      lower.includes("too many requests")
    ) {
      return msg
    }
  }

  const json = iife(() => {
    try {
      if (typeof error.data?.message === "string") {
        const parsed = JSON.parse(error.data.message)
        return parsed
      }

      return JSON.parse(error.data.message)
    } catch {
      return undefined
    }
  })
  if (!json || typeof json !== "object") return undefined
  const code = typeof json.code === "string" ? json.code : ""

  if (json.type === "error" && json.error?.type === "too_many_requests") {
    return "Too Many Requests"
  }
  if (code.includes("exhausted") || code.includes("unavailable")) {
    return "Provider is overloaded"
  }
  if (json.type === "error" && typeof json.error?.code === "string" && json.error.code.includes("rate_limit")) {
    return "Rate Limited"
  }
  return undefined
}

export function policy(opts: {
  parse: (error: unknown) => Err
  set: (input: { attempt: number; message: string; next: number }) => Effect.Effect<void>
  // stratacode_change start
  limit?: number
  delay?: number
  max_delay?: number
  offline?: (input: { error: unknown; message: string }) => Effect.Effect<"retry" | "blocked" | "aborted">
  // stratacode_change end
}) {
  return Schedule.fromStepWithMetadata(
    Effect.succeed((meta: Schedule.InputMetadata<unknown>) => {
      // stratacode_change start — enforce retry limit
      if (opts.limit !== undefined && meta.attempt > opts.limit) {
        return Cause.done(meta.attempt)
      }
      // stratacode_change end

      const error = opts.parse(meta.input)
      const message = retryable(error)
      if (!message) return Cause.done(meta.attempt)
      return Effect.gen(function* () {
        // stratacode_change start — handle network disconnect via offline handler
        if (opts.offline && SessionNetwork.disconnected(meta.input)) {
          const result = yield* opts.offline({
            error: meta.input,
            message: SessionNetwork.message(meta.input),
          })
          if (result !== "retry") {
            return yield* Cause.done(meta.attempt)
          }
          yield* opts.set({ attempt: 0, message: "Reconnected", next: Date.now() })
          return [0, Duration.zero] as [number, Duration.Duration]
        }
        // stratacode_change end

        // stratacode_change start — use custom delay constants if provided
        const base = opts.delay !== undefined ? opts.delay * 1000 : undefined
        const maxCap = opts.max_delay !== undefined ? opts.max_delay * 1000 : undefined
        const wait = delay(meta.attempt, MessageV2.APIError.isInstance(error) ? error : undefined, base, maxCap)
        // stratacode_change end
        yield* opts.set({ attempt: meta.attempt, message, next: Date.now() + wait })
        return [meta.attempt, Duration.millis(wait)] as [number, Duration.Duration]
      })
    }),
  )
}

export * as SessionRetry from "./retry"
