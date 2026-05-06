import { expect, test, mock } from "bun:test"
import { FormatterFeature } from "../../../src/stratacode/features/formatter"

test("FormatterFeature.onToggled syncs formatter to CLI", async () => {
  const update = mock()
  const ctx = {
    client: { global: { config: { update } } },
    post: mock(),
    directory: "/tmp",
  }
  const feature = new FormatterFeature()
  await feature.onToggled(true, ctx as any)
  expect(update).toHaveBeenCalledWith({ config: { formatter: {} } })

  await feature.onToggled(false, ctx as any)
  expect(update).toHaveBeenCalledWith({ config: { formatter: false } })
})
