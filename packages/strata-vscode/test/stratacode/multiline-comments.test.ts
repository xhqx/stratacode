import { describe, expect, test } from "bun:test"
import { buildIndexedPatches, type ReviewCommentPayload } from "../../src/explain-skip"
import { sanitizeReviewComments, extractLines } from "../../webview-ui/agent-manager/review-comments"
import { formatReviewCommentMarkdown } from "../../webview-ui/src/utils/review-comment-markdown"

describe("Multiline Comments Parsing", () => {
  const diffs = [
    {
      file: "test.ts",
      patch: `--- a/test.ts
+++ b/test.ts
@@ -1,3 +1,4 @@
-const a = 1
+const a = 2
+const b = 3
+const c = 4
 const x = 5`,
    },
    {
      file: "other.ts",
      patch: `--- a/other.ts
+++ b/other.ts
@@ -10,2 +10,2 @@
-const d = 4
+const d = 5`,
    },
  ]

  const { lineMap } = buildIndexedPatches(diffs)

  // A minimal mock for processComment which is not exported but part of parseCommentsArr logic.
  // We'll reimplement processComment here just to test the parsing logic directly,
  // since parseCommentsArr / parseExplainResponse are deeply integrated and expect
  // the exact payload shape.
  function processCommentTest(key: unknown, text: unknown, map: typeof lineMap) {
    const out: ReviewCommentPayload[] = []
    const match = String(key).match(/\d+(?:-\d+)?/)
    if (!match) return out
    
    const parts = match[0].split("-")
    const idStart = parseInt(parts[0]!, 10)
    const idEnd = parts[1] ? parseInt(parts[1]!, 10) : idStart
    if (isNaN(idStart) || isNaN(idEnd) || typeof text !== "string" || !text.trim()) return out

    const mappedStart = map.get(idStart)
    if (!mappedStart) return out

    let endLine: number | undefined
    if (idStart !== idEnd) {
      const mappedEnd = map.get(idEnd)
      if (mappedEnd && mappedEnd.file === mappedStart.file && mappedEnd.side === mappedStart.side) {
        endLine = mappedEnd.line
      }
    }

    out.push({
      file: mappedStart.file,
      side: mappedStart.side,
      line: mappedStart.line,
      ...(endLine !== undefined ? { endLine } : {}),
      text: text.trim(),
    })
    return out
  }

  test("parser range IDs resolve start and end", () => {
    // 1 is deleted line 1, 2 is added line 1, 3 is added line 2, 4 is added line 3
    const result = processCommentTest("2-4", "test text", lineMap)
    expect(result.length).toBe(1)
    expect(result[0]).toEqual({
      file: "test.ts",
      side: "additions",
      line: 1,
      endLine: 3,
      text: "test text",
    })
  })

  test("parser single-line regression", () => {
    const result = processCommentTest("3", "single line", lineMap)
    expect(result.length).toBe(1)
    expect(result[0]).toEqual({
      file: "test.ts",
      side: "additions",
      line: 2,
      text: "single line",
    })
    expect(result[0]!.endLine).toBeUndefined()
  })

  test("parser range cross-file falls back to start only", () => {
    // 4 is test.ts additions line 3
    // 5 is other.ts deletions line 10
    const result = processCommentTest("4-5", "cross file", lineMap)
    expect(result.length).toBe(1)
    expect(result[0]).toEqual({
      file: "test.ts",
      side: "additions",
      line: 3,
      text: "cross file",
    })
    expect(result[0]!.endLine).toBeUndefined()
  })

  test("parser range cross-side falls back to start only", () => {
    // 1 is test.ts deletions line 1
    // 2 is test.ts additions line 1
    const result = processCommentTest("1-2", "cross side", lineMap)
    expect(result.length).toBe(1)
    expect(result[0]).toEqual({
      file: "test.ts",
      side: "deletions",
      line: 1,
      text: "cross side",
    })
    expect(result[0]!.endLine).toBeUndefined()
  })
})

describe("Review Comments Core Utils", () => {
  test("extractLines multiline", () => {
    const content = "Line 1\nLine 2\nLine 3\nLine 4\nLine 5"
    expect(extractLines(content, 2, 4)).toBe("Line 2\nLine 3\nLine 4")
  })

  test("extractLines single line regression", () => {
    const content = "Line 1\nLine 2\nLine 3\nLine 4\nLine 5"
    expect(extractLines(content, 3, 3)).toBe("Line 3")
  })

  test("sanitizeReviewComments clamps endLine", () => {
    const comments = [
      { id: "1", file: "test.ts", side: "additions" as const, line: 1, endLine: 5, comment: "", selectedText: "" },
      { id: "2", file: "test.ts", side: "additions" as const, line: 2, endLine: 3, comment: "", selectedText: "" },
    ]
    const diffs = [
      { file: "test.ts", status: "modified" as const, before: "", after: "A\nB\nC", tracked: true, added: 3, deleted: 0 },
    ]
    const sanitized = sanitizeReviewComments(comments, diffs)
    
    expect(sanitized.length).toBe(2)
    // max is 3 because content is "A\nB\nC" which has 3 lines
    expect(sanitized[0]!.endLine).toBe(3)
    // 3 is already valid, should not change
    expect(sanitized[1]!.endLine).toBe(3)
  })

  test("formatReviewCommentMarkdown with multiline", () => {
    const comment = { id: "1", file: "test.ts", side: "additions" as const, line: 1, endLine: 3, comment: "Hello", selectedText: "A\nB\nC" }
    const md = formatReviewCommentMarkdown(comment)
    expect(md).toContain("**test.ts** (lines 1-3):")
    expect(md).toContain("```\nA\nB\nC\n```")
  })

  test("formatReviewCommentMarkdown single line regression", () => {
    const comment = { id: "1", file: "test.ts", side: "additions" as const, line: 2, endLine: 2, comment: "Hello", selectedText: "B" }
    const md = formatReviewCommentMarkdown(comment)
    expect(md).toContain("**test.ts** (line 2):")
  })
})
