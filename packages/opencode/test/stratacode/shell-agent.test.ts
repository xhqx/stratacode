import { test, expect, describe } from "bun:test"
import { Permission } from "../../src/permission"

// Mirrors the shell agent's bash permission config from stratacode/agent/index.ts.
// The shell agent uses the default bash allowlist (imported in agent/index.ts as `bash`).
// For this test we use "allow" since the shell agent gets full bash access.
const shellBash: Record<string, "allow" | "ask" | "deny"> = { "*": "allow" }

/**
 * Build the shell agent permission ruleset.
 * Mirrors the patchAgents() logic in stratacode/agent/index.ts:
 *   Permission.merge(defaults, shellConfig, user)
 *
 * defaults includes { bash: bashAllowlist, recall: "ask" }
 * shellConfig = { "*": "deny", bash: "allow", read: "allow", grep: "allow", glob: "allow", list: "allow" }
 */
function shellRuleset() {
  const defaults = Permission.fromConfig({ bash: shellBash, recall: "ask" })
  return Permission.merge(
    defaults,
    Permission.fromConfig({
      "*": "deny",
      bash: "allow",
      read: "allow",
      grep: "allow",
      glob: "allow",
      list: "allow",
    }),
  )
}

describe("Shell agent registration", () => {
  const ruleset = shellRuleset()

  test("bash tool is allowed", () => {
    const result = Permission.evaluate("bash", "npm run build", ruleset)
    expect(result.action).toBe("allow")
  })

  test("read tool is allowed", () => {
    const result = Permission.evaluate("read", "src/index.ts", ruleset)
    expect(result.action).toBe("allow")
  })

  test("grep tool is allowed", () => {
    const result = Permission.evaluate("grep", "pattern", ruleset)
    expect(result.action).toBe("allow")
  })

  test("glob tool is allowed", () => {
    const result = Permission.evaluate("glob", "**/*.ts", ruleset)
    expect(result.action).toBe("allow")
  })

  test("list tool is allowed", () => {
    const result = Permission.evaluate("list", "src/", ruleset)
    expect(result.action).toBe("allow")
  })
})

describe("Shell agent denied tools", () => {
  const ruleset = shellRuleset()

  test("edit tools are disabled", () => {
    const result = Permission.disabled(["edit", "write", "patch"], ruleset)
    expect(result.has("edit")).toBe(true)
    expect(result.has("write")).toBe(true)
    expect(result.has("patch")).toBe(true)
  })

  test("task tool is disabled", () => {
    const result = Permission.disabled(["task"], ruleset)
    expect(result.has("task")).toBe(true)
  })

  test("todowrite and todoread are disabled", () => {
    const result = Permission.disabled(["todowrite", "todoread"], ruleset)
    expect(result.has("todowrite")).toBe(true)
    expect(result.has("todoread")).toBe(true)
  })

  test("websearch is disabled", () => {
    const result = Permission.disabled(["websearch", "webfetch"], ruleset)
    expect(result.has("websearch")).toBe(true)
    expect(result.has("webfetch")).toBe(true)
  })
})
