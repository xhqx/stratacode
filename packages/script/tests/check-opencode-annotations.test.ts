import { describe, expect, test } from "bun:test"
import path from "node:path"

const SOURCE_EXTS = new Set([".ts", ".tsx", ".js", ".jsx"])

function isExempt(file: string) {
  const norm = file.replaceAll("\\", "/").toLowerCase()
  return norm.split("/").some((part) => part.includes("stratacode"))
}

function isSource(file: string) {
  return SOURCE_EXTS.has(path.extname(file))
}

const MARKER_PREFIX = /(?:\/\/|\{?\s*\/\*)\s*stratacode_change\b/

function hasMarker(line: string) {
  return MARKER_PREFIX.test(line)
}

function coveredLines(text: string): Set<number> {
  const lines = text.split(/\r?\n/)
  const covered = new Set<number>()

  const first = lines.find((x) => x.trim() !== "")
  if (first?.match(/(?:\/\/|\{?\s*\/\*)\s*stratacode_change\s*-\s*new\s*file\b/)) {
    for (let i = 1; i <= lines.length; i++) covered.add(i)
    return covered
  }

  let block = false
  for (let i = 0; i < lines.length; i++) {
    const n = i + 1
    const line = lines[i] ?? ""

    if (line.match(/(?:\/\/|\{?\s*\/\*)\s*stratacode_change\s+start\b/)) {
      block = true
      covered.add(n)
      continue
    }

    if (line.match(/(?:\/\/|\{?\s*\/\*)\s*stratacode_change\s+end\b/)) {
      covered.add(n)
      block = false
      continue
    }

    if (block) {
      covered.add(n)
      continue
    }

    if (hasMarker(line)) covered.add(n)
  }

  return covered
}

function checkLine(line: string, covered: Set<number>, n: number): boolean {
  const trim = line.trim()
  if (!trim) return true
  if (hasMarker(trim)) return true
  return covered.has(n)
}

// ─── hasMarker tests ──────────────────────────────────────────────────────────

describe("hasMarker", () => {
  const cases: Array<[string, boolean]> = [
    // JS-style inline
    ["// stratacode_change", true],
    ["  // stratacode_change", true],
    ["const x = 1 // stratacode_change", true],
    ["// stratacode_change start", true],
    ["// stratacode_change end", true],
    ["// stratacode_change - new file", true],
    ["//   stratacode_change", true],
    ["// stratacode_change  ", true],

    // JSX-style inline
    ["{/* stratacode_change */}", true],
    ["  {/* stratacode_change */}", true],
    ["{/* stratacode_change start */}", true],
    ["{/* stratacode_change end */}", true],
    ["{/* stratacode_change - new file */}", true],
    ["{/* stratacode_change - StrataNews added */}", true],
    ["{/*   stratacode_change */}", true],
    ["{/* stratacode_change  */}", true],

    // bare /* */ style
    ["/* stratacode_change */", true],
    ["  /* stratacode_change */", true],
    ["/* stratacode_change start */", true],
    ["/* stratacode_change end */", true],

    // Non-markers
    ["const x = 1", false],
    ["<text fg={color}>{label}</text>", false],
    ["// some other comment", false],
    ["{/* just a comment */}", false],
    ["/* something else */", false],
    // typo variants — should NOT match (missing word boundary)
    ["// stratacode_changes", false],
    ["// stratacode_changelog", false],
    ["/* stratacode_change_log */", false],
    ["{/* stratacode_changes */}", false],
    ["// stratacode_changeable", false],
    ["", false],
    ["  ", false],
  ]

  test.each(cases)("input %j → %j", (input, expected) => {
    expect(hasMarker(input)).toBe(expected)
  })
})

// ─── isExempt tests ───────────────────────────────────────────────────────────

describe("isExempt", () => {
  const cases: Array<[string, boolean]> = [
    // exempt — "stratacode" in path
    ["packages/opencode/src/stratacode/foo.ts", true],
    ["packages/opencode/test/stratacode/bar.test.ts", true],
    ["packages/opencode/src/some/stratacode/deep/path.ts", true],
    ["packages/opencode/src/stratacode/deep/nested/file.tsx", true],
    // exempt — "stratacode" in filename
    ["packages/opencode/src/foo/stratacode.ts", true],
    ["packages/opencode/src/bar/stratacode.test.ts", true],
    ["packages/opencode/src/file.stratacode.ts", true],
    // exempt — case-insensitive
    ["packages/opencode/src/StrataCode/foo.ts", true],
    ["packages/opencode/src/STRATACODE/bar.ts", true],
    // NOT exempt
    ["packages/opencode/src/index.ts", false],
    ["packages/opencode/src/cli/cmd/tui/routes/home.tsx", false],
    ["packages/opencode/src/cli/cmd/tui/routes/session/index.tsx", false],
    ["packages/opencode/src/tool/registry.ts", false],
    ["packages/opencode/src/config/config.ts", false],
    ["packages/opencode/src/indexing/search-service.ts", false],
    // stratacode_change is not the same as stratacode
    ["packages/opencode/src/check-opencode-annotations.ts", false],
  ]

  test.each(cases)("%j → exempt=%j", (file, expected) => {
    expect(isExempt(file)).toBe(expected)
  })
})

// ─── isSource tests ───────────────────────────────────────────────────────────

describe("isSource", () => {
  const cases: Array<[string, boolean]> = [
    ["foo.ts", true],
    ["foo.tsx", true],
    ["foo/bar.tsx", true],
    ["foo.js", true],
    ["foo.jsx", true],
    [".json", false],
    [".md", false],
    [".txt", false],
    ["Makefile", false],
    ["foo.go", false],
    ["foo.rs", false],
  ]

  test.each(cases)("%j → isSource=%j", (file, expected) => {
    expect(isSource(file)).toBe(expected)
  })
})

// ─── coveredLines tests ───────────────────────────────────────────────────────

describe("coveredLines", () => {
  test("empty file", () => {
    const covered = coveredLines("")
    expect(covered.size).toBe(0)
  })

  test("file with only whitespace", () => {
    const covered = coveredLines("   \n\n  \n")
    expect(covered.size).toBe(0)
  })

  test("whole-file JS annotation", () => {
    const covered = coveredLines("// stratacode_change - new file\nexport const x = 1\nexport const y = 2")
    expect(covered).toEqual(new Set([1, 2, 3]))
  })

  test("whole-file JSX annotation", () => {
    const covered = coveredLines("{/* stratacode_change - new file */}\nexport const x = 1\nexport const y = 2")
    expect(covered).toEqual(new Set([1, 2, 3]))
  })

  test("JS block markers", () => {
    const text = [
      "const a = 1",
      "// stratacode_change start",
      "const b = 2",
      "const c = 3",
      "// stratacode_change end",
      "const d = 4",
    ].join("\n")
    const covered = coveredLines(text)
    expect(covered).toEqual(new Set([2, 3, 4, 5])) // block markers + content
  })

  test("JSX block markers", () => {
    const text = [
      "const a = 1",
      "{/* stratacode_change start */}",
      "const b = 2",
      "const c = 3",
      "{/* stratacode_change end */}",
      "const d = 4",
    ].join("\n")
    const covered = coveredLines(text)
    expect(covered).toEqual(new Set([2, 3, 4, 5]))
  })

  test("mixed JS and JSX block markers (nested)", () => {
    const text = [
      "// stratacode_change start",
      "{/* stratacode_change start */}",
      "const b = 2",
      "{/* stratacode_change end */}",
      "// stratacode_change end",
    ].join("\n")
    const covered = coveredLines(text)
    expect(covered).toEqual(new Set([1, 2, 3, 4, 5]))
  })

  test("bare /* */ block markers", () => {
    const text = ["/* stratacode_change start */", "const b = 2", "/* stratacode_change end */"].join("\n")
    const covered = coveredLines(text)
    expect(covered).toEqual(new Set([1, 2, 3]))
  })

  test("inline JS marker covers only that line", () => {
    const text = ["const a = 1", "const b = 2 // stratacode_change", "const c = 3"].join("\n")
    const covered = coveredLines(text)
    expect(covered).toEqual(new Set([2]))
  })

  test("inline JSX marker covers only that line", () => {
    const text = ["const a = 1", "{/* stratacode_change */}", "const c = 3"].join("\n")
    const covered = coveredLines(text)
    expect(covered).toEqual(new Set([2]))
  })

  test("inline JS marker with code on same line", () => {
    const text = "const url = Flag.STRATA_MODELS_URL || 'https://models.dev' // stratacode_change\n"
    const covered = coveredLines(text)
    expect(covered).toEqual(new Set([1]))
  })

  test("JSX block marker with descriptive suffix", () => {
    const text = [
      "{/* stratacode_change start - Strata-specific error display */}",
      "<ErrorDisplay />",
      "{/* stratacode_change end */}",
    ].join("\n")
    const covered = coveredLines(text)
    expect(covered).toEqual(new Set([1, 2, 3]))
  })

  test("multiple independent blocks", () => {
    const text = [
      "// stratacode_change start",
      "const a = 1",
      "// stratacode_change end",
      "const b = 2",
      "{/* stratacode_change start */}",
      "const c = 3",
      "{/* stratacode_change end */}",
      "const d = 4",
    ].join("\n")
    const covered = coveredLines(text)
    expect(covered).toEqual(new Set([1, 2, 3, 5, 6, 7]))
  })

  test("marker line with extra text after marker is still covered", () => {
    const text = [
      "const a = 1",
      "// stratacode_change start - this is strata specific",
      "const b = 2",
      "// stratacode_change end",
    ].join("\n")
    const covered = coveredLines(text)
    expect(covered).toEqual(new Set([2, 3, 4]))
  })

  test("nested block — inner block ends, outer continues", () => {
    const text = [
      "// stratacode_change start",
      "{/* stratacode_change start */}",
      "const b = 2",
      "{/* stratacode_change end */}",
      "const c = 3",
      "// stratacode_change end",
    ].join("\n")
    const covered = coveredLines(text)
    // Line 1: start, block=true
    // Line 2: inner start, block=true (covered by block)
    // Line 3: covered by block
    // Line 4: inner end, block=false, covered by end marker
    // Line 5: NOT covered (block is false, no inline marker)
    // Line 6: outer end, block already false, covered by end marker
    expect(covered).toEqual(new Set([1, 2, 3, 4, 6]))
  })

  test("whitespace before marker is handled", () => {
    const text = ["  {/* stratacode_change start */}", "    const b = 2", "  {/* stratacode_change end */}"].join("\n")
    const covered = coveredLines(text)
    expect(covered).toEqual(new Set([1, 2, 3]))
  })
})

// ─── checkLine integration tests ──────────────────────────────────────────────
// Simulates what the main loop does for each added line

describe("checkLine (main loop simulation)", () => {
  function check(text: string, addedLines: number[]): string[] {
    const covered = coveredLines(text)
    const lines = text.split(/\r?\n/)
    const violations: string[] = []
    for (const n of addedLines) {
      const line = lines[n - 1] ?? ""
      const trim = line.trim()
      if (!trim) continue
      if (hasMarker(trim)) continue
      if (!covered.has(n)) violations.push(`line ${n}: ${trim}`)
    }
    return violations
  }

  test("covered line reports no violation", () => {
    const text = ["// stratacode_change start", "const strata = 1", "// stratacode_change end"].join("\n")
    expect(check(text, [2])).toEqual([])
  })

  test("uncovered line reports violation", () => {
    const text = ["const uncovered = 1", "const also_uncovered = 2"].join("\n")
    expect(check(text, [1, 2])).toEqual(["line 1: const uncovered = 1", "line 2: const also_uncovered = 2"])
  })

  test("empty lines are skipped", () => {
    const text = ["const x = 1", "", "  ", "", "const y = 2"].join("\n")
    expect(check(text, [1, 2, 3, 4, 5])).toEqual(["line 1: const x = 1", "line 5: const y = 2"])
  })

  test("marker lines are skipped even if uncovered", () => {
    // This shouldn't normally happen, but the loop should skip it
    const text = ["{/* stratacode_change */}", "{/* stratacode_change start */}"].join("\n")
    expect(check(text, [1, 2])).toEqual([])
  })

  test("real-world TSX home.tsx pattern", () => {
    const text = [
      '<box width="100%" maxWidth={75}>',
      "  {/* stratacode_change start */}",
      "  <Show when={indexingOn()}>",
      "    <text fg={indexingColor()}>{indexingLabel()}</text>",
      "  </Show>",
      "  {/* stratacode_change end */}",
      "</box>",
    ].join("\n")
    // Only the first and last lines (opening/closing box) should be uncovered
    expect(check(text, [1, 7])).toEqual([`line 1: <box width="100%" maxWidth={75}>`, `line 7: </box>`])
    // Middle lines are covered
    expect(check(text, [2, 3, 4, 5, 6])).toEqual([])
  })

  test("real-world TSX session index.tsx pattern", () => {
    const text = [
      "const foo = 1",
      "{/* stratacode_change start */}",
      '<Match when={props.part.tool === "semantic_search"}>',
      "<SemanticSearch {...toolprops} />",
      "</Match>",
      "{/* stratacode_change end */}",
      "const bar = 2",
    ].join("\n")
    // Lines 1 and 7 are uncovered (not in any block)
    expect(check(text, [1, 7])).toEqual(["line 1: const foo = 1", "line 7: const bar = 2"])
    // Lines 2-6 are covered
    expect(check(text, [2, 3, 4, 5, 6])).toEqual([])
  })

  test("real-world TSX sidebar.tsx pattern", () => {
    const text = [
      "<box>",
      "                {/* stratacode_change start */}",
      "                <SessionTree />",
      "                {/* stratacode_change end */}",
      "</box>",
      "          {/* stratacode_change start */}",
      "          <div>other content</div>",
      "          {/* stratacode_change end */}",
    ].join("\n")
    expect(check(text, [1, 5])).toEqual(["line 1: <box>", "line 5: </box>"])
    expect(check(text, [2, 3, 4, 6, 7, 8])).toEqual([])
  })

  test("real-world TSX permission.tsx inline pattern", () => {
    const text = [
      "{/* stratacode_change */}",
      "<PermissionDeniedCard />",
      "{/* stratacode_change */}",
      "<AnotherStrataComponent />",
    ].join("\n")
    expect(check(text, [2, 4])).toEqual(["line 2: <PermissionDeniedCard />", "line 4: <AnotherStrataComponent />"])
    expect(check(text, [1, 3])).toEqual([])
  })

  test("JS-style session/index.tsx pattern (from existing codebase)", () => {
    const text = ["const foo = 1", "<Toast />", "{/* stratacode_change */}", "<Footer />", "</box>"].join("\n")
    // Line 2 (<Toast />) is NOT covered — it's between <Toast /> and the marker
    expect(check(text, [2, 4])).toEqual(["line 2: <Toast />", "line 4: <Footer />"])
    expect(check(text, [3])).toEqual([])
  })

  test("whole-file annotated file — no violations even for unmarked lines", () => {
    const text = [
      "// stratacode_change - new file",
      "export const strataFeature = true",
      "export const alsoStrata = 123",
      "export const notMarked = 'oops'",
    ].join("\n")
    expect(check(text, [2, 3, 4])).toEqual([])
  })
})

// ─── Regex edge cases ─────────────────────────────────────────────────────────

describe("MARKER_PREFIX regex edge cases", () => {
  test("handles { followed immediately by /*", () => {
    expect(hasMarker("{/* stratacode_change */}")).toBe(true)
  })

  test("handles { followed by whitespace then /*", () => {
    expect(hasMarker("{ /* stratacode_change */}")).toBe(true)
  })

  test("handles just /* with no brace", () => {
    expect(hasMarker("/* stratacode_change */")).toBe(true)
  })

  test("handles // with no spaces", () => {
    expect(hasMarker("//stratacode_change")).toBe(true)
  })

  test("handles // with lots of spaces", () => {
    expect(hasMarker("//    stratacode_change")).toBe(true)
  })

  test("does not match {/* without stratacode_change", () => {
    expect(hasMarker("{/* some other comment */}")).toBe(false)
  })

  test("does not match /* without stratacode_change", () => {
    expect(hasMarker("/* just a comment */")).toBe(false)
  })

  test("does not match stratacode_changes (word boundary)", () => {
    expect(hasMarker("// stratacode_changes")).toBe(false)
    expect(hasMarker("// stratacode_changelog")).toBe(false)
    expect(hasMarker("{/* stratacode_changes */}")).toBe(false)
    expect(hasMarker("// stratacode_changeable")).toBe(false)
  })
})

// ─── isExempt — Windows paths ─────────────────────────────────────────────────

describe("isExempt — Windows backslash paths", () => {
  test("Windows paths with backslashes", () => {
    expect(isExempt("packages\\opencode\\src\\stratacode\\foo.ts")).toBe(true)
    expect(isExempt("packages\\opencode\\test\\stratacode\\bar.test.ts")).toBe(true)
    expect(isExempt("packages\\opencode\\src\\index.ts")).toBe(false)
  })
})

// ─── coveredLines — additional patterns ───────────────────────────────────────

describe("coveredLines — additional patterns", () => {
  test("block with descriptive suffix is still recognized", () => {
    const text = [
      "{/* stratacode_change start - Strata-specific indexing display */}",
      "<IndexingStatus />",
      "{/* stratacode_change end */}",
    ].join("\n")
    const covered = coveredLines(text)
    expect(covered).toEqual(new Set([1, 2, 3]))
  })

  test("empty file content", () => {
    const covered = coveredLines("// stratacode_change start\n  \n// stratacode_change end")
    expect(covered).toEqual(new Set([1, 2, 3]))
  })

  test("multiple separate JS inline markers", () => {
    const text = [
      "const a = 1 // stratacode_change",
      "const b = 2",
      "const c = 3 // stratacode_change",
      "const d = 4",
    ].join("\n")
    const covered = coveredLines(text)
    expect(covered).toEqual(new Set([1, 3]))
  })

  test("consecutive block markers (no content)", () => {
    const text = ["// stratacode_change start", "// stratacode_change end"].join("\n")
    const covered = coveredLines(text)
    expect(covered).toEqual(new Set([1, 2]))
  })

  test("block immediately followed by another start", () => {
    const text = [
      "// stratacode_change start",
      "const a = 1",
      "// stratacode_change end",
      "{/* stratacode_change start */}",
      "const b = 2",
      "{/* stratacode_change end */}",
    ].join("\n")
    const covered = coveredLines(text)
    expect(covered).toEqual(new Set([1, 2, 3, 4, 5, 6]))
  })

  test("trailing empty line after block end is not covered", () => {
    const text = "// stratacode_change start\nconst a = 1\n// stratacode_change end\n\n"
    const covered = coveredLines(text)
    // Block ends at line 3; trailing empty line 4 is outside the block
    expect(covered).toEqual(new Set([1, 2, 3]))
  })
})

// ─── checkLine — additional patterns ─────────────────────────────────────────

describe("checkLine — additional patterns", () => {
  function check(text: string, addedLines: number[]): string[] {
    const covered = coveredLines(text)
    const lines = text.split(/\r?\n/)
    const violations: string[] = []
    for (const n of addedLines) {
      const line = lines[n - 1] ?? ""
      const trim = line.trim()
      if (!trim) continue
      if (hasMarker(trim)) continue
      if (!covered.has(n)) violations.push(`line ${n}: ${trim}`)
    }
    return violations
  }

  test("real-world dialog-status.tsx pattern — multiple inline blocks", () => {
    // Based on actual file: packages/opencode/src/cli/cmd/tui/component/dialog-status.tsx
    const text = [
      "{/* stratacode_change start */}",
      "<StrataDialog>",
      "{/* stratacode_change end */}",
      "const normal = 1",
      "  {/* stratacode_change start */}",
      "  <StrataDialog />",
      "  {/* stratacode_change end */}",
    ].join("\n")
    // Lines 4 is uncovered
    expect(check(text, [4])).toEqual(["line 4: const normal = 1"])
    // Lines 1-3 and 5-7 are covered
    expect(check(text, [1, 2, 3, 5, 6, 7])).toEqual([])
  })

  test("real-world TUI routes — line between marker and code should be uncovered", () => {
    // A common mistake: putting code on a different line from the marker
    const text = ["{/* stratacode_change start */}", "", "<StrataIndexing />", "", "{/* stratacode_change end */}"].join("\n")
    // Empty lines (2, 4) are skipped
    expect(check(text, [3])).toEqual([])
    // All non-empty lines (1, 3, 5) are covered
    expect(check(text, [1, 3, 5])).toEqual([])
  })

  test("end marker on same line as content is covered", () => {
    const text = "const a = 1\n{/* stratacode_change end */} // block already closed, still covered\n"
    const covered = coveredLines(text)
    expect(covered).toEqual(new Set([2]))
  })

  test("end marker closes block correctly", () => {
    const text = [
      "// stratacode_change start",
      "const a = 1",
      "// stratacode_change end",
      "const b = 2", // uncovered
    ].join("\n")
    expect(check(text, [1, 2, 3, 4])).toEqual(["line 4: const b = 2"])
  })
})
