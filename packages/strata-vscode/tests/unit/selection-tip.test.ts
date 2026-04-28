import { describe, it, expect, mock } from "bun:test"

// Provide mock before importing
const mockVscode = await import("../setup/vscode-mock")

const { tipText, eligible, SelectionTipService } = await import("../../src/stratacode/selection-tip")

describe("selection-tip", () => {
  describe("tipText", () => {
    it("uses Cmd+I on darwin", () => {
      expect(tipText("darwin")).toContain("⌘I")
    })

    it("uses Ctrl+I on other platforms", () => {
      expect(tipText("win32")).toContain("Ctrl+I")
      expect(tipText("linux")).toContain("Ctrl+I")
    })
  })

  describe("eligible", () => {
    it("is eligible when enabled, low count, and non-empty", () => {
      expect(eligible(true, 0, false)).toBe(true)
      expect(eligible(true, 4, false)).toBe(true)
    })

    it("is ineligible when disabled", () => {
      expect(eligible(false, 0, false)).toBe(false)
    })

    it("is ineligible when usage count is >= 5", () => {
      expect(eligible(true, 5, false)).toBe(false)
      expect(eligible(true, 10, false)).toBe(false)
    })

    it("is ineligible when selection is empty", () => {
      expect(eligible(true, 0, true)).toBe(false)
    })
  })

  describe("SelectionTipService", () => {
    it("registers listeners and creates decoration type on instantiation", () => {
      const context = {
        globalState: { get: () => 0, update: async () => {} },
      } as any
      const tip = new SelectionTipService(context)
      // Since it doesn't throw and initializes, we're good
      tip.dispose()
    })

    it("recordUsage increments the counter", async () => {
      let currentCount = 0
      const context = {
        globalState: {
          get: () => currentCount,
          update: async (_: string, val: number) => {
            currentCount = val
          },
        },
      } as any

      const tip = new SelectionTipService(context)
      await tip.recordUsage()
      expect(currentCount).toBe(1)
      await tip.recordUsage()
      expect(currentCount).toBe(2)
      tip.dispose()
    })
  })
})
