import { expect, test, mock } from "bun:test"
import { BrowserFeature } from "../../../src/stratacode/features/browser"

test("BrowserFeature routes messages correctly", () => {
  const feature = new BrowserFeature()
  const ctx = { post: mock() } as any

  // We mock pushState to avoid vscode API calls in simple test
  feature.pushState = mock()

  expect(feature.handleMessage({ type: "requestBrowserSettings" }, ctx)).toBe(true)
  expect(feature.pushState).toHaveBeenCalledWith(ctx)

  expect(feature.handleMessage({ type: "other" }, ctx)).toBe(false)
})
