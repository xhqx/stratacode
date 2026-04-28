import { describe, it, expect } from "vitest"
import { filterVisibleAgents } from "../strata-provider-utils"
import type { Agent } from "@stratacode/sdk/v2"

describe("filterVisibleAgents", () => {
  it("filters out hidden and subagent modes, and picks the first visible as default", () => {
    const agents = [
      { name: "sub", mode: "subagent", hidden: false },
      { name: "hidden_agent", mode: "primary", hidden: true },
      { name: "code", mode: "primary", hidden: false },
      { name: "ask", mode: "primary", hidden: false },
    ] as Agent[]

    const result = filterVisibleAgents(agents)

    expect(result.visible.map((a) => a.name)).toEqual(["code", "ask"])
    expect(result.defaultAgent).toBe("code")
  })

  it("includes force-shown hidden agents in visible list but excludes them from defaultAgent strict list", () => {
    const agents = [
      { name: "hidden_agent", mode: "primary", hidden: true },
      { name: "commit", mode: "primary", hidden: true },
      { name: "autocomplete", mode: "primary", hidden: true },
      { name: "code", mode: "primary", hidden: false },
    ] as Agent[]

    const shown = new Set(["commit", "autocomplete"])
    const result = filterVisibleAgents(agents, shown)

    expect(result.visible.map((a) => a.name)).toEqual(["commit", "autocomplete", "code"])
    // defaultAgent should still be 'code', not 'commit' which was force-shown
    expect(result.defaultAgent).toBe("code")
  })

  it("handles empty strict list by falling back to 'code'", () => {
    const agents = [
      { name: "hidden_agent", mode: "primary", hidden: true },
      { name: "commit", mode: "primary", hidden: true },
    ] as Agent[]

    const shown = new Set(["commit"])
    const result = filterVisibleAgents(agents, shown)

    expect(result.visible.map((a) => a.name)).toEqual(["commit"])
    expect(result.defaultAgent).toBe("code")
  })
})
