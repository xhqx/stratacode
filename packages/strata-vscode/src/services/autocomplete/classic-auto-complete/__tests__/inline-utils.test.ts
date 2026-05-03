import { describe, it, expect } from "bun:test"
import {
  findMatchingSuggestion,
  countLines,
  shouldShowOnlyFirstLine,
  getFirstLine,
  applyFirstLineOnly,
  MatchingSuggestionWithFillIn
} from "../inline-utils"
import { FillInAtCursorSuggestion } from "../../../types"

describe("inline-utils", () => {
  describe("findMatchingSuggestion", () => {
    it("should return empty string when matching a failed lookup", () => {
      const suggestions: FillInAtCursorSuggestion[] = [
        { text: "", prefix: "const x = 1", suffix: "\nconst y = 2" }
      ]
      const result = findMatchingSuggestion("const x = 1", "\nconst y = 2", suggestions)
      expect(result).not.toBeNull()
      expect(result!.text).toBe("")
      expect(result!.matchType).toBe("exact")
    })

    it("should return suggestion text when prefix and suffix match exactly", () => {
      const suggestions: FillInAtCursorSuggestion[] = [
        { text: "console.log('Hello, World!');", prefix: "const x = 1", suffix: "\nconst y = 2" }
      ]
      const result = findMatchingSuggestion("const x = 1", "\nconst y = 2", suggestions)
      expect(result).not.toBeNull()
      expect(result!.text).toBe("console.log('Hello, World!');")
      expect(result!.matchType).toBe("exact")
    })
  })

  describe("countLines", () => {
    it("should count lines correctly", () => {
      expect(countLines("")).toBe(0)
      expect(countLines("single line")).toBe(1)
      expect(countLines("line 1\nline 2")).toBe(2)
    })
  })

  describe("shouldShowOnlyFirstLine", () => {
    it("should return false if completion starts with newline", () => {
      expect(shouldShowOnlyFirstLine("const x = ", "\n  1")).toBe(false)
    })

    it("should return true if current line has content before cursor", () => {
      expect(shouldShowOnlyFirstLine("function test() {\n  const x = ", "1\n}")).toBe(true)
    })
  })

  describe("getFirstLine", () => {
    it("should extract first line", () => {
      expect(getFirstLine("line 1\nline 2")).toBe("line 1")
    })
  })

  describe("applyFirstLineOnly", () => {
    it("should apply first line when shouldShowOnlyFirstLine is true", () => {
      const match: MatchingSuggestionWithFillIn = {
        text: "1\n}",
        matchType: "exact",
        fillInAtCursor: { text: "1\n}", prefix: "const x = ", suffix: "" }
      }
      const result = applyFirstLineOnly(match, "const x = ")
      expect(result!.text).toBe("1")
    })
  })
})
