import { describe, it, expect } from "vitest"
import { filterVisibleAgents } from "../strata-provider-utils"
import type { Agent } from "@stratacode/sdk/v2"

describe("filterVisibleAgents", () => {
  it("filters out hidden and subagent modes, and picks the first visible as default", () => {
    const agents = [
      { name: "sub", mode: "subagent", hidden: false },
      { name: "hidden_agent", mode: "primary", hidden: true },
      { name: "ask", mode: "primary", hidden: false },
      { name: "plan", mode: "primary", hidden: false },
    ] as Agent[]

    const result = filterVisibleAgents(agents)

    expect(result.visible.map((a) => a.name)).toEqual(["ask", "plan"])
    expect(result.defaultAgent).toBe("ask")
  })

  it("falls back to 'ask' when no visible agents exist", () => {
    const agents = [
      { name: "hidden_agent", mode: "primary", hidden: true },
      { name: "code", mode: "primary", hidden: true },
    ] as Agent[]

    const result = filterVisibleAgents(agents)

    expect(result.visible).toEqual([])
    expect(result.defaultAgent).toBe("ask")
  })
})
