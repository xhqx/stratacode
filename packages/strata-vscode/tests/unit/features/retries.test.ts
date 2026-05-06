import { expect, test, mock } from "bun:test"
import { RetriesFeature } from "../../../src/stratacode/features/retries"

test("RetriesFeature.onToggled syncs retry.enabled to CLI", async () => {
  const update = mock()
  const ctx = {
    client: { global: { config: { update } } },
    post: mock(),
    directory: "/tmp",
  }
  const feature = new RetriesFeature()
  await feature.onToggled(true, ctx as any)
  expect(update).toHaveBeenCalledWith({ config: { retry: { enabled: true } } })

  await feature.onToggled(false, ctx as any)
  expect(update).toHaveBeenCalledWith({ config: { retry: { enabled: false } } })
})
