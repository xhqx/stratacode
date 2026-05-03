import { describe, it, expect } from "bun:test"
import { AutocompleteCache } from "../AutocompleteCache"
import { FillInAtCursorSuggestion } from "../../../types"

describe("AutocompleteCache", () => {
  it("should store and retrieve suggestions", () => {
    const cache = new AutocompleteCache()
    
    const suggestion: FillInAtCursorSuggestion = {
      text: "console.log('test')",
      prefix: "const x = 1",
      suffix: "\nconst y = 2"
    }
    cache.add(suggestion)
    
    // Test that we can get the suggestion back
    const match = cache.get("const x = 1", "\nconst y = 2")
    expect(match).not.toBeNull()
    expect(match!.text).toBe("console.log('test')")
  })

  it("should match cached suggestion using current context", () => {
    const cache = new AutocompleteCache()
    const suggestion: FillInAtCursorSuggestion = {
      text: "console.log('test')",
      prefix: "const x = 1",
      suffix: "\nconst y = 2"
    }
    cache.add(suggestion)
    
    const match = cache.get("const x = 1", "\nconst y = 2")
    expect(match).not.toBeNull()
    expect(match!.text).toBe("console.log('test')")
    expect(match!.matchType).toBe("exact")
  })

  it("should not match if context changed", () => {
    const cache = new AutocompleteCache()
    const suggestion: FillInAtCursorSuggestion = {
      text: "console.log('test')",
      prefix: "const x = 1",
      suffix: "\nconst y = 2"
    }
    cache.add(suggestion)
    
    const match = cache.get("const z = 1", "\nconst y = 2")
    expect(match).toBeNull()
  })

  it("should clear cache", () => {
    const cache = new AutocompleteCache()
    const suggestion: FillInAtCursorSuggestion = {
      text: "console.log('test')",
      prefix: "const x = 1",
      suffix: "\nconst y = 2"
    }
    cache.add(suggestion)
    cache.clear()
    
    const match = cache.get("const x = 1", "\nconst y = 2")
    expect(match).toBeNull()
  })
})
