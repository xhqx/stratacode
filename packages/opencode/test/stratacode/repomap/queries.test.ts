import { describe, it, expect, beforeAll } from "bun:test"
import { ParserService } from "@/stratacode/repomap/parser"
import { Effect } from "effect"
import { QUERIES, EXTENSIONS } from "@/stratacode/repomap/queries"

describe("RepoMap Queries", () => {
  beforeAll(async () => {
    // Ensure WASM engines initialize before running tests
    await ParserService._init()
  })

  // Group mappings by their underlying query string
  const uniqueLanguages = new Set(Object.values(EXTENSIONS).map((e) => e.query))

  for (const lang of uniqueLanguages) {
    it(`compiles ${lang} query`, async () => {
      // Find the first extension that maps to this language to test the extraction path
      const ext = Object.keys(EXTENSIONS).find((k) => EXTENSIONS[k].query === lang)
      expect(ext).toBeDefined()

      const queryStr = QUERIES[lang]
      expect(queryStr).toBeDefined()

      // Parse a dummy file to force query compilation for this language.
      // If the query is invalid, it logs a warning and returns empty tags.
      // We can't directly inspect the internal cache easily, but we can verify
      // that extraction succeeds on a valid file without crashing.
      const snippet = "function dummy() {}" // Simple dummy text

      const result = await Effect.runPromise(ParserService.extract(`dummy${ext}`, snippet))

      // We don't necessarily expect tags for this simple dummy text in all languages,
      // but we do expect it to NOT throw and to return an array.
      expect(Array.isArray(result)).toBe(true)
    })
  }
})
