import { expect, test, mock } from "bun:test"
import { NotificationsFeature } from "../../../src/stratacode/features/notifications"

test("NotificationsFeature routes messages correctly", () => {
  const feature = new NotificationsFeature()
  const ctx = { post: mock() } as any

  feature.pushState = mock()

  expect(feature.handleMessage({ type: "requestNotificationSettings" }, ctx)).toBe(true)
  expect(feature.pushState).toHaveBeenCalledWith(ctx)

  expect(feature.handleMessage({ type: "other" }, ctx)).toBe(false)
})
