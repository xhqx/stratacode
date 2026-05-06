import { expect, test, mock } from "bun:test"
import { BatchFeature } from "../../../src/stratacode/features/batch"

test("BatchFeature.onToggled syncs experimental.batch_tool to CLI", async () => {
  const update = mock()
  const ctx = {
    client: { global: { config: { update } } },
    post: mock(),
    directory: "/tmp",
  }
  const feature = new BatchFeature()
  await feature.onToggled(true, ctx as any)
  expect(update).toHaveBeenCalledWith({ config: { experimental: { batch_tool: true } } })
})
