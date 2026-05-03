import { describe, expect, it } from "bun:test"
import { parseExplainResponse, shouldPreSkip } from "../../src/explain-skip"

describe("parseExplainResponse", () => {
  it("should parse valid JSON", () => {
    const raw = `
{
  "summary": "This is a summary",
  "comments": [
    { "file": "src/index.ts", "side": "additions", "line": 42, "text": "Fix this" },
    { "file": "src/utils.ts", "line": 10, "text": "Missing side defaults to additions" }
  ]
}`
    const parsed = parseExplainResponse(raw)
    expect(parsed.summary).toBe("This is a summary")
    expect(parsed.comments.length).toBe(2)
    expect(parsed.comments[0].file).toBe("src/index.ts")
    expect(parsed.comments[0].side).toBe("additions")
    expect(parsed.comments[0].line).toBe(42)
    expect(parsed.comments[0].text).toBe("Fix this")

    expect(parsed.comments[1].side).toBe("additions") // default
    expect(parsed.comments[1].line).toBe(10)
  })

  it("should extract JSON from markdown fences", () => {
    const raw = `
Here is my review:

\`\`\`json
{
  "summary": "Summary text",
  "comments": [
    { "file": "test.ts", "line": 1, "text": "comment" }
  ]
}
\`\`\`

Hope this helps!
`
    const parsed = parseExplainResponse(raw)
    expect(parsed.summary).toBe("Summary text")
    expect(parsed.comments.length).toBe(1)
    expect(parsed.comments[0].file).toBe("test.ts")
  })

  it("should handle missing or invalid fields safely", () => {
    const raw = `
{
  "comments": [
    { "file": "", "line": 1, "text": "empty file" },
    { "file": "test.ts", "line": "not a number", "text": "bad line" },
    { "file": "test.ts", "line": 1, "text": "" },
    { "file": "test.ts", "side": "invalid", "line": 1, "text": "bad side" },
    { "file": "test.ts", "line": 0, "text": "line 0" }
  ]
}`
    const parsed = parseExplainResponse(raw)
    expect(parsed.summary).toBe("")
    expect(parsed.comments.length).toBe(2)

    // bad side defaults to additions
    expect(parsed.comments[0].side).toBe("additions")
    expect(parsed.comments[0].text).toBe("bad side")

    // line 0 clamped to 1
    expect(parsed.comments[1].line).toBe(1)
    expect(parsed.comments[1].text).toBe("line 0")
  })

  it("should return fallback on invalid JSON", () => {
    const parsed = parseExplainResponse("this is not json")
    expect(parsed.summary).toBe("")
    expect(parsed.comments).toEqual([])
  })
})

describe("shouldPreSkip", () => {
  it("should skip empty diffs", () => {
    const patch = `--- a/file.ts
+++ b/file.ts`
    expect(shouldPreSkip(patch, "low")).toBe(true)
  })

  it("should skip pure whitespace changes", () => {
    const patch = `--- a/file.ts
+++ b/file.ts
-  const x = 1
+  const x = 1  `
    expect(shouldPreSkip(patch, "low")).toBe(true)
  })

  it("should respect effort thresholds", () => {
    const patch = `--- a/file.ts
+++ b/file.ts
-const a = 1
+const a = 2
-const b = 1
+const b = 2`

    // 4 substantive lines changed
    expect(shouldPreSkip(patch, "low")).toBe(true) // low threshold is 5
    expect(shouldPreSkip(patch, "medium")).toBe(false) // medium threshold is 2
    expect(shouldPreSkip(patch, "high")).toBe(false) // high never pre-skips
  })
})
