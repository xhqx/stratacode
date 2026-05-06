import { expect, test, mock } from "bun:test"
import { TimelineFeature } from "../../../src/stratacode/features/timeline"

test("TimelineFeature routes messages correctly", () => {
  const feature = new TimelineFeature()
  const ctx = { post: mock() } as any

  feature.pushState = mock()

  expect(feature.handleMessage({ type: "requestTimelineSetting" }, ctx)).toBe(true)
  expect(feature.pushState).toHaveBeenCalledWith(ctx)

  expect(feature.handleMessage({ type: "other" }, ctx)).toBe(false)
})
