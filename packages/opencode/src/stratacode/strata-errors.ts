import type { NamedError } from "@opencode-ai/shared/util/error"

export const STRATA_ERROR_CODES = {
  PAID_MODEL_AUTH_REQUIRED: "PAID_MODEL_AUTH_REQUIRED",
  PROMOTION_MODEL_LIMIT_REACHED: "PROMOTION_MODEL_LIMIT_REACHED",
} as const

export type StrataErrorCode = (typeof STRATA_ERROR_CODES)[keyof typeof STRATA_ERROR_CODES]

const STRATA_ERROR_CODE_VALUES = Object.values(STRATA_ERROR_CODES) as string[]

/**
 * Check if an error is a Strata-specific error (has a known Strata error code in responseBody).
 * Currently all Strata errors are non-retryable, but this may change in the future.
 */
export function isStrataError(error: ReturnType<NamedError["toObject"]>): boolean {
  return parseStrataErrorCode(error) !== undefined
}

/**
 * Get a user-friendly title for a Strata error code.
 */
export function strataErrorTitle(code: StrataErrorCode): string {
  switch (code) {
    case STRATA_ERROR_CODES.PAID_MODEL_AUTH_REQUIRED:
      return "You need to sign in to use this model"
    case STRATA_ERROR_CODES.PROMOTION_MODEL_LIMIT_REACHED:
      return "You need to sign up to keep going"
  }
}

/**
 * Get a user-friendly description for a Strata error code.
 */
export function strataErrorDescription(code: StrataErrorCode): string {
  switch (code) {
    case STRATA_ERROR_CODES.PAID_MODEL_AUTH_REQUIRED:
      return "Sign in or create an account to access over 500 models, use credits at cost, or bring your own key."
    case STRATA_ERROR_CODES.PROMOTION_MODEL_LIMIT_REACHED:
      return "Sign up for free to continue and explore 500 other models. Takes 2 minutes, no credit card required. Or come back later."
  }
}

/**
 * Show a warning toast with the appropriate Strata error title/description.
 * Caller should check isStrataError() first.
 */
export function showStrataErrorToast(
  error: ReturnType<NamedError["toObject"]>,
  toast: { show: (opts: { variant: "warning"; title: string; message: string; duration: number }) => void },
): void {
  const code = parseStrataErrorCode(error)
  if (!code) return
  toast.show({
    variant: "warning",
    title: strataErrorTitle(code),
    message: strataErrorDescription(code),
    duration: 5000,
  })
}

/**
 * Extract the specific Strata error code from an APIError's responseBody.
 * Returns the code string if found, undefined otherwise.
 *
 * Note: We check error.name === "APIError" directly instead of using
 * MessageV2.APIError.isInstance() to avoid a circular dependency
 * (message-v2.ts re-exports from this file).
 */
export function parseStrataErrorCode(error: ReturnType<NamedError["toObject"]>): StrataErrorCode | undefined {
  if (error.name !== "APIError") return undefined
  const responseBody = error.data?.responseBody
  if (typeof responseBody !== "string") return undefined
  try {
    const body = JSON.parse(responseBody)
    // Backend sends: { error: { code: "PAID_MODEL_AUTH_REQUIRED" } }
    // or: { code: "PROMOTION_MODEL_LIMIT_REACHED" }
    const code = body?.error?.code ?? body?.code
    if (typeof code === "string" && STRATA_ERROR_CODE_VALUES.includes(code)) {
      return code as StrataErrorCode
    }
  } catch {}
  return undefined
}
