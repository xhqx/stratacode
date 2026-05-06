import { expect, test, mock } from "bun:test"
import { ClaudeCompatFeature } from "../../../src/stratacode/features/claude-compat"

test("ClaudeCompatFeature routes messages correctly", () => {
  const feature = new ClaudeCompatFeature()
  const ctx = { post: mock() } as any

  feature.pushState = mock()

  expect(feature.handleMessage({ type: "requestClaudeCompatSetting" }, ctx)).toBe(true)
  expect(feature.pushState).toHaveBeenCalledWith(ctx)

  expect(feature.handleMessage({ type: "other" }, ctx)).toBe(false)
})
