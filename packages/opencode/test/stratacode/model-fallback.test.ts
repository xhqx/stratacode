// stratacode_change - new file
import { describe, expect, test } from "bun:test"
import * as ModelFallback from "../../src/stratacode/model-fallback"
import { Provider } from "../../src/provider"
import { MessageV2 } from "../../src/session/message-v2"

// ─── helpers ─────────────────────────────────────────────────────────────────

function agent(overrides: Partial<{ fallback_models: string[] }> = {}) {
  return {
    name: "code",
    mode: "primary" as const,
    permission: [],
    options: {},
    ...overrides,
  }
}

function modelNotFound() {
  return new Provider.ModelNotFoundError({
    providerID: "anthropic" as any,
    modelID: "claude-sonnet-4-20250514" as any,
    suggestions: [],
  })
}

function apiError(status: number) {
  return new MessageV2.APIError({
    message: `Status ${status}`,
    statusCode: status,
    isRetryable: status >= 500,
  })
}

// ─── candidates() ────────────────────────────────────────────────────────────

describe("ModelFallback.candidates", () => {
  test("returns empty when agent is undefined", () => {
    expect(ModelFallback.candidates(undefined)).toEqual([])
  })

  test("returns empty when fallback_models is undefined", () => {
    expect(ModelFallback.candidates(agent())).toEqual([])
  })

  test("returns empty when fallback_models is empty array", () => {
    expect(ModelFallback.candidates(agent({ fallback_models: [] }))).toEqual([])
  })

  test("parses single fallback model", () => {
    const result = ModelFallback.candidates(agent({ fallback_models: ["openai/gpt-4o"] }))
    expect(result).toHaveLength(1)
    expect(String(result[0].providerID)).toBe("openai")
    expect(String(result[0].modelID)).toBe("gpt-4o")
  })

  test("parses multiple fallback models in order", () => {
    const result = ModelFallback.candidates(
      agent({
        fallback_models: ["openai/gpt-4o", "anthropic/claude-sonnet-4-20250514", "google/gemini-2.5-pro"],
      }),
    )
    expect(result).toHaveLength(3)
    expect(String(result[0].providerID)).toBe("openai")
    expect(String(result[0].modelID)).toBe("gpt-4o")
    expect(String(result[1].providerID)).toBe("anthropic")
    expect(String(result[1].modelID)).toBe("claude-sonnet-4-20250514")
    expect(String(result[2].providerID)).toBe("google")
    expect(String(result[2].modelID)).toBe("gemini-2.5-pro")
  })

  test("handles model IDs with slashes (e.g. google/models/gemini-pro)", () => {
    const result = ModelFallback.candidates(agent({ fallback_models: ["google/models/gemini-pro"] }))
    expect(result).toHaveLength(1)
    expect(String(result[0].providerID)).toBe("google")
    expect(String(result[0].modelID)).toBe("models/gemini-pro")
  })
})

// ─── shouldFallback() ────────────────────────────────────────────────────────

describe("ModelFallback.shouldFallback", () => {
  // --- positive cases ---

  test("returns true for ModelNotFoundError", () => {
    expect(ModelFallback.shouldFallback(modelNotFound())).toBe(true)
  })

  test("returns true for 429 Too Many Requests", () => {
    expect(ModelFallback.shouldFallback(apiError(429))).toBe(true)
  })

  test("returns true for 401 Unauthorized", () => {
    expect(ModelFallback.shouldFallback(apiError(401))).toBe(true)
  })

  test("returns true for 403 Forbidden", () => {
    expect(ModelFallback.shouldFallback(apiError(403))).toBe(true)
  })

  test("returns true for 404 Not Found", () => {
    expect(ModelFallback.shouldFallback(apiError(404))).toBe(true)
  })

  test("returns true for 400 Bad Request", () => {
    expect(ModelFallback.shouldFallback(apiError(400))).toBe(true)
  })

  test("returns true for 500 Internal Server Error", () => {
    expect(ModelFallback.shouldFallback(apiError(500))).toBe(true)
  })

  test("returns true for 502 Bad Gateway", () => {
    expect(ModelFallback.shouldFallback(apiError(502))).toBe(true)
  })

  test("returns true for 503 Service Unavailable", () => {
    expect(ModelFallback.shouldFallback(apiError(503))).toBe(true)
  })

  test("returns true for 504 Gateway Timeout", () => {
    expect(ModelFallback.shouldFallback(apiError(504))).toBe(true)
  })

  test("returns true for 599 (upper boundary)", () => {
    expect(ModelFallback.shouldFallback(apiError(599))).toBe(true)
  })

  // --- negative cases ---

  test("returns false for generic Error", () => {
    expect(ModelFallback.shouldFallback(new Error("random"))).toBe(false)
  })

  test("returns false for null", () => {
    expect(ModelFallback.shouldFallback(null)).toBe(false)
  })

  test("returns false for undefined", () => {
    expect(ModelFallback.shouldFallback(undefined)).toBe(false)
  })

  test("returns false for string", () => {
    expect(ModelFallback.shouldFallback("error")).toBe(false)
  })

  test("returns false for plain object without name", () => {
    expect(ModelFallback.shouldFallback({ message: "fail" })).toBe(false)
  })

  test("returns false for APIError without statusCode", () => {
    const err = new MessageV2.APIError({
      message: "unknown",
      isRetryable: false,
    })
    expect(ModelFallback.shouldFallback(err)).toBe(false)
  })

  test("returns false for non-4xx/5xx status codes", () => {
    // 200 OK
    expect(ModelFallback.shouldFallback(apiError(200))).toBe(false)
    // 301 redirect
    expect(ModelFallback.shouldFallback(apiError(301))).toBe(false)
    // 399 just below 400
    expect(ModelFallback.shouldFallback(apiError(399))).toBe(false)
    // 600 above range
    expect(ModelFallback.shouldFallback(apiError(600))).toBe(false)
  })

  // --- edge: object matching NamedError shape but wrong tag ---

  test("returns false for unrelated NamedError-shaped object", () => {
    const obj = { name: "SomeOtherError", data: {} }
    expect(ModelFallback.shouldFallback(obj)).toBe(false)
  })

  // --- edge: APIError-like object with name but wrong tag ---

  test("returns false for APIError with ContextOverflowError name", () => {
    const err = new MessageV2.ContextOverflowError({
      message: "context too long",
    })
    expect(ModelFallback.shouldFallback(err)).toBe(false)
  })
})
