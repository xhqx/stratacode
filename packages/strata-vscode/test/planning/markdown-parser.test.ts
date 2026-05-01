import { describe, it, expect } from "bun:test"
import { parsePage, updateCheckbox, slugify, generateId } from "../../src/planning/markdown-parser"

const FIXTURE_FILE = "/workspace/.strata/plans/auth/index.md"

describe("parsePage", () => {
  it("parses a single unchecked task with title only", () => {
    const content = `# Auth\n\n## Tasks\n\n- [ ] Migrate to OAuth`
    const page = parsePage(content, FIXTURE_FILE)

    expect(page.title).toBe("Auth")
    expect(page.tasks).toHaveLength(1)
    expect(page.tasks[0]!.checked).toBe(false)
    expect(page.tasks[0]!.inProgress).toBe(false)
    expect(page.tasks[0]!.title).toBe("Migrate to OAuth")
    expect(page.tasks[0]!.line).toBe(5)
    expect(page.tasks[0]!.description).toBe("")
    expect(page.tasks[0]!.group).toBe("Tasks")
  })

  it("parses a checked task", () => {
    const content = `# Done\n\n- [x] Audit auth flow`
    const page = parsePage(content, FIXTURE_FILE)

    expect(page.tasks).toHaveLength(1)
    expect(page.tasks[0]!.checked).toBe(true)
    expect(page.tasks[0]!.inProgress).toBe(false)
    expect(page.tasks[0]!.title).toBe("Audit auth flow")
  })

  it("parses an in-progress [/] task", () => {
    const content = `# WIP\n\n- [/] Working on refactor`
    const page = parsePage(content, FIXTURE_FILE)

    expect(page.tasks).toHaveLength(1)
    expect(page.tasks[0]!.checked).toBe(false)
    expect(page.tasks[0]!.inProgress).toBe(true)
    expect(page.tasks[0]!.title).toBe("Working on refactor")
  })

  it("parses strata metadata comment", () => {
    const content = [
      "# Auth",
      "",
      "- [ ] Add rate limiting",
      "  <!-- strata: agent=coder priority=2 id=rate-limit depends=auth-oauth,auth-base -->",
    ].join("\n")

    const page = parsePage(content, FIXTURE_FILE)
    const task = page.tasks[0]!

    expect(task.id).toBe("rate-limit")
    expect(task.meta.agent).toBe("coder")
    expect(task.meta.priority).toBe(2)
    expect(task.meta.depends).toEqual(["auth-oauth", "auth-base"])
  })

  it("parses multi-line description as prompt", () => {
    const content = [
      "# Auth",
      "",
      "- [ ] Migrate to OAuth 2.0",
      "  <!-- strata: agent=architect -->",
      "  Replace the legacy session-cookie auth.",
      "  Ensure backward compatibility.",
    ].join("\n")

    const page = parsePage(content, FIXTURE_FILE)
    const task = page.tasks[0]!

    expect(task.description).toBe("Replace the legacy session-cookie auth.\nEnsure backward compatibility.")
    expect(task.meta.agent).toBe("architect")
  })

  it("parses multiple tasks under different headings", () => {
    const content = [
      "# Project Plan",
      "",
      "## Auth",
      "",
      "- [ ] Task A",
      "- [x] Task B",
      "",
      "## Performance",
      "",
      "- [ ] Task C",
    ].join("\n")

    const page = parsePage(content, FIXTURE_FILE)

    expect(page.tasks).toHaveLength(3)
    expect(page.tasks[0]!.group).toBe("Auth")
    expect(page.tasks[0]!.title).toBe("Task A")
    expect(page.tasks[1]!.group).toBe("Auth")
    expect(page.tasks[1]!.checked).toBe(true)
    expect(page.tasks[2]!.group).toBe("Performance")
    expect(page.tasks[2]!.title).toBe("Task C")
  })

  it("extracts cross-page links", () => {
    const content = [
      "# Auth",
      "",
      "> Related: [Performance](../performance/index.md), [CI](../infra/ci.md)",
      "",
      "See also [oauth details](./oauth.md) and [external](https://example.com).",
    ].join("\n")

    const page = parsePage(content, FIXTURE_FILE)

    expect(page.links).toContain("../performance/index.md")
    expect(page.links).toContain("../infra/ci.md")
    expect(page.links).toContain("./oauth.md")
    // External http links should NOT be included
    expect(page.links).not.toContain("https://example.com")
  })

  it("generates stable ID when no explicit id in comment", () => {
    const content = `# Auth\n\n- [ ] Migrate to OAuth`
    const page = parsePage(content, FIXTURE_FILE)

    const expected = generateId("Migrate to OAuth", FIXTURE_FILE)
    expect(page.tasks[0]!.id).toBe(expected)
  })

  it("handles empty file gracefully", () => {
    const page = parsePage("", FIXTURE_FILE)

    expect(page.title).toBe("")
    expect(page.tasks).toHaveLength(0)
    expect(page.links).toHaveLength(0)
  })

  it("handles file with no tasks", () => {
    const content = [
      "# Notes",
      "",
      "Just some notes here, no tasks.",
      "",
      "## More notes",
      "",
      "Still no tasks.",
    ].join("\n")

    const page = parsePage(content, FIXTURE_FILE)
    expect(page.tasks).toHaveLength(0)
  })

  it("handles malformed strata comment gracefully", () => {
    const content = [
      "# Auth",
      "",
      "- [ ] Task with bad comment",
      "  <!-- strata: broken -->",
    ].join("\n")

    const page = parsePage(content, FIXTURE_FILE)

    expect(page.tasks).toHaveLength(1)
    expect(page.tasks[0]!.meta).toEqual({})
  })

  it("parses task with provider and model metadata", () => {
    const content = [
      "# Auth",
      "",
      "- [ ] Complex task",
      '  <!-- strata: provider=anthropic model="claude-sonnet-4-20250514" priority=1 -->',
    ].join("\n")

    const page = parsePage(content, FIXTURE_FILE)
    const task = page.tasks[0]!

    expect(task.meta.provider).toBe("anthropic")
    expect(task.meta.model).toBe("claude-sonnet-4-20250514")
    expect(task.meta.priority).toBe(1)
  })

  it("uses asterisk and plus list markers", () => {
    const content = [
      "# Mix",
      "",
      "* [ ] Asterisk task",
      "+ [x] Plus task",
    ].join("\n")

    const page = parsePage(content, FIXTURE_FILE)

    expect(page.tasks).toHaveLength(2)
    expect(page.tasks[0]!.title).toBe("Asterisk task")
    expect(page.tasks[1]!.title).toBe("Plus task")
    expect(page.tasks[1]!.checked).toBe(true)
  })

  it("stops task description at next checkbox", () => {
    const content = [
      "# Tasks",
      "",
      "- [ ] First task",
      "  Description of first.",
      "- [ ] Second task",
      "  Description of second.",
    ].join("\n")

    const page = parsePage(content, FIXTURE_FILE)

    expect(page.tasks).toHaveLength(2)
    expect(page.tasks[0]!.description).toBe("Description of first.")
    expect(page.tasks[1]!.description).toBe("Description of second.")
  })
})

describe("updateCheckbox", () => {
  const content = [
    "# Plan",
    "",
    "- [ ] Unchecked task",
    "- [x] Checked task",
    "- [/] In progress task",
  ].join("\n")

  it("flips [ ] to [x]", () => {
    const result = updateCheckbox(content, 3, "x")
    const lines = result.split("\n")
    expect(lines[2]).toBe("- [x] Unchecked task")
  })

  it("flips [x] to [ ]", () => {
    const result = updateCheckbox(content, 4, " ")
    const lines = result.split("\n")
    expect(lines[3]).toBe("- [ ] Checked task")
  })

  it("flips [ ] to [/]", () => {
    const result = updateCheckbox(content, 3, "/")
    const lines = result.split("\n")
    expect(lines[2]).toBe("- [/] Unchecked task")
  })

  it("does not corrupt other lines", () => {
    const result = updateCheckbox(content, 3, "x")
    const lines = result.split("\n")
    expect(lines[0]).toBe("# Plan")
    expect(lines[1]).toBe("")
    expect(lines[3]).toBe("- [x] Checked task")
    expect(lines[4]).toBe("- [/] In progress task")
  })

  it("returns unchanged content for invalid line number", () => {
    expect(updateCheckbox(content, 0, "x")).toBe(content)
    expect(updateCheckbox(content, 99, "x")).toBe(content)
  })

  it("returns unchanged content for non-checkbox line", () => {
    expect(updateCheckbox(content, 1, "x")).toBe(content) // "# Plan"
  })
})

describe("slugify", () => {
  it("converts to lowercase with dashes", () => {
    expect(slugify("Migrate to OAuth 2.0")).toBe("migrate-to-oauth-20")
  })

  it("strips special characters", () => {
    expect(slugify("Fix bug (critical!)")).toBe("fix-bug-critical")
  })

  it("collapses multiple dashes", () => {
    expect(slugify("a - - b")).toBe("a-b")
  })

  it("handles empty string", () => {
    expect(slugify("")).toBe("")
  })
})

describe("generateId", () => {
  it("produces stable output for same inputs", () => {
    const a = generateId("Test Task", "/path/to/file.md")
    const b = generateId("Test Task", "/path/to/file.md")
    expect(a).toBe(b)
  })

  it("produces different output for different files", () => {
    const a = generateId("Test Task", "/a.md")
    const b = generateId("Test Task", "/b.md")
    expect(a).not.toBe(b)
  })

  it("produces different output for different titles", () => {
    const a = generateId("Task A", "/file.md")
    const b = generateId("Task B", "/file.md")
    expect(a).not.toBe(b)
  })
})
