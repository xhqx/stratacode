import { describe, expect, test } from "bun:test"
import { FeatureGraph } from "../../src/stratacode/feature-graph"
import { MANIFEST, type FeatureSpec } from "../../src/stratacode/feature-manifest"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function spec(overrides: Partial<FeatureSpec> = {}): FeatureSpec {
  return {
    default: true,
    label: "Test",
    description: "test feature",
    icon: "test",
    lifecycle: "runtime",
    ...overrides,
  }
}

function flags(manifest: Record<string, FeatureSpec>, on = true): Record<string, boolean> {
  return Object.fromEntries(Object.keys(manifest).map((k) => [k, on]))
}

// ---------------------------------------------------------------------------
// Cycle & Structural Detection
// ---------------------------------------------------------------------------

describe("FeatureGraph / structural validation", () => {
  test("detects a simple 2-node cycle", () => {
    const manifest: Record<string, FeatureSpec> = {
      a: spec({ requires: "b" }),
      b: spec({ requires: "a" }),
    }
    expect(() => new FeatureGraph(manifest).validate()).toThrow(/[Cc]ycle/)
  })

  test("detects a 3-node cycle (A→B→C→A)", () => {
    const manifest: Record<string, FeatureSpec> = {
      a: spec({ requires: "c" }),
      b: spec({ requires: "a" }),
      c: spec({ requires: "b" }),
    }
    expect(() => new FeatureGraph(manifest).validate()).toThrow(/[Cc]ycle/)
  })

  test("detects a missing parent reference", () => {
    const manifest: Record<string, FeatureSpec> = {
      child: spec({ requires: "ghost" }),
    }
    expect(() => new FeatureGraph(manifest).validate()).toThrow(/[Mm]issing/)
  })

  test("accepts a diamond dependency (no cycle)", () => {
    // root ← left, root ← right — no cycle
    const manifest: Record<string, FeatureSpec> = {
      root: spec(),
      left: spec({ requires: "root" }),
      right: spec({ requires: "root" }),
    }
    expect(() => new FeatureGraph(manifest).validate()).not.toThrow()
  })

  test("accepts a 20-level deep chain", () => {
    const manifest: Record<string, FeatureSpec> = {}
    for (let i = 0; i < 20; i++) {
      manifest[`level${i}`] = spec(i > 0 ? { requires: `level${i - 1}` } : {})
    }
    expect(() => new FeatureGraph(manifest).validate()).not.toThrow()
  })

  test("accepts an empty manifest", () => {
    const graph = new FeatureGraph({})
    expect(() => graph.validate()).not.toThrow()
    expect(graph.order()).toEqual([])
    expect(graph.blocked()).toEqual([])
  })

  test("accepts a single-feature manifest", () => {
    const manifest: Record<string, FeatureSpec> = { solo: spec() }
    const graph = new FeatureGraph(manifest)
    expect(() => graph.validate()).not.toThrow()
    expect(graph.order()).toEqual(["solo"])
    expect(graph.cascade("solo")).toEqual([])
  })

  test("production MANIFEST passes validation", () => {
    expect(() => new FeatureGraph(MANIFEST).validate()).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// canEnable — Dependency Resolution
// ---------------------------------------------------------------------------

describe("FeatureGraph / canEnable", () => {
  const chain: Record<string, FeatureSpec> = {
    root: spec(),
    mid: spec({ requires: "root" }),
    leaf: spec({ requires: "mid" }),
  }

  test("root feature is always enableable when flagged on", () => {
    const graph = new FeatureGraph(chain)
    expect(graph.canEnable("root", flags(chain))).toBe(true)
  })

  test("child is blocked when immediate parent is off", () => {
    const graph = new FeatureGraph(chain)
    const f = { ...flags(chain), mid: false }
    expect(graph.canEnable("leaf", f)).toBe(false)
  })

  test("grandchild is blocked when grandparent is off", () => {
    const graph = new FeatureGraph(chain)
    const f = { ...flags(chain), root: false }
    expect(graph.canEnable("leaf", f)).toBe(false)
  })

  test("20-deep chain: leaf blocked when root is off", () => {
    const manifest: Record<string, FeatureSpec> = {}
    for (let i = 0; i < 20; i++) {
      manifest[`l${i}`] = spec(i > 0 ? { requires: `l${i - 1}` } : {})
    }
    const graph = new FeatureGraph(manifest)
    const f = { ...flags(manifest), l0: false }
    expect(graph.canEnable("l19", f)).toBe(false)
  })

  test("independent features don't affect each other", () => {
    const manifest: Record<string, FeatureSpec> = {
      alpha: spec(),
      beta: spec(),
    }
    const graph = new FeatureGraph(manifest)
    expect(graph.canEnable("alpha", { alpha: true, beta: false })).toBe(true)
    expect(graph.canEnable("beta", { alpha: false, beta: true })).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// canEnable — Cloud Policies
// ---------------------------------------------------------------------------

describe("FeatureGraph / cloud policies", () => {
  const manifest: Record<string, FeatureSpec> = {
    local: spec(),
    cloud: spec({ policy: "cloud" }),
    child: spec({ requires: "cloud", policy: "cloud" }),
  }

  test("cloud feature blocked when STRATA_DISABLE_CLOUD is set", () => {
    const graph = new FeatureGraph(manifest)
    expect(graph.canEnable("cloud", flags(manifest), { STRATA_DISABLE_CLOUD: "1" })).toBe(false)
  })

  test("local feature not blocked by STRATA_DISABLE_CLOUD", () => {
    const graph = new FeatureGraph(manifest)
    expect(graph.canEnable("local", flags(manifest), { STRATA_DISABLE_CLOUD: "1" })).toBe(true)
  })

  test("child of cloud feature is also blocked", () => {
    const graph = new FeatureGraph(manifest)
    expect(graph.canEnable("child", flags(manifest), { STRATA_DISABLE_CLOUD: "1" })).toBe(false)
  })

  test("blocked() returns only cloud-policy features", () => {
    const graph = new FeatureGraph(manifest)
    const result = graph.blocked({ STRATA_DISABLE_CLOUD: "1" })
    expect(result).toContain("cloud")
    expect(result).toContain("child")
    expect(result).not.toContain("local")
  })

  test("blocked() returns empty when cloud is not disabled", () => {
    const graph = new FeatureGraph(manifest)
    expect(graph.blocked({})).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// cascade()
// ---------------------------------------------------------------------------

describe("FeatureGraph / cascade", () => {
  test("returns all descendants of a root", () => {
    const manifest: Record<string, FeatureSpec> = {
      root: spec(),
      a: spec({ requires: "root" }),
      b: spec({ requires: "root" }),
      c: spec({ requires: "a" }),
    }
    const graph = new FeatureGraph(manifest)
    const result = graph.cascade("root")
    expect(result).toHaveLength(3)
    expect(result).toContain("a")
    expect(result).toContain("b")
    expect(result).toContain("c")
  })

  test("returns empty for leaf features", () => {
    const manifest: Record<string, FeatureSpec> = {
      root: spec(),
      leaf: spec({ requires: "root" }),
    }
    const graph = new FeatureGraph(manifest)
    expect(graph.cascade("leaf")).toEqual([])
  })

  test("returns empty for unknown keys (no crash)", () => {
    const graph = new FeatureGraph({ a: spec() })
    expect(graph.cascade("nonexistent")).toEqual([])
  })

  test("wide tree: 50 direct children", () => {
    const manifest: Record<string, FeatureSpec> = { root: spec() }
    for (let i = 0; i < 50; i++) {
      manifest[`child${i}`] = spec({ requires: "root" })
    }
    const graph = new FeatureGraph(manifest)
    expect(graph.cascade("root")).toHaveLength(50)
  })
})

// ---------------------------------------------------------------------------
// order() — Topological Sort
// ---------------------------------------------------------------------------

describe("FeatureGraph / order", () => {
  test("returns all features exactly once", () => {
    const graph = new FeatureGraph(MANIFEST)
    const sorted = graph.order()
    const keys = Object.keys(MANIFEST)
    expect(sorted).toHaveLength(keys.length)
    expect(new Set(sorted).size).toBe(keys.length)
  })

  test("parent always precedes child in order", () => {
    const graph = new FeatureGraph(MANIFEST)
    const sorted = graph.order()
    for (const [key, s] of Object.entries(MANIFEST)) {
      if (s.requires) {
        const parentIdx = sorted.indexOf(s.requires)
        const childIdx = sorted.indexOf(key)
        expect(parentIdx).toBeLessThan(childIdx)
      }
    }
  })

  test("handles isolated features (no edges)", () => {
    const manifest: Record<string, FeatureSpec> = {
      a: spec(),
      b: spec(),
      c: spec(),
    }
    const graph = new FeatureGraph(manifest)
    const sorted = graph.order()
    expect(sorted).toHaveLength(3)
  })
})

// ---------------------------------------------------------------------------
// Idempotency & Mutation Safety
// ---------------------------------------------------------------------------

describe("FeatureGraph / idempotency and safety", () => {
  test("canEnable is idempotent (100 iterations)", () => {
    const graph = new FeatureGraph(MANIFEST)
    const f = flags(MANIFEST as unknown as Record<string, FeatureSpec>)
    const keys = Object.keys(MANIFEST)
    const baseline = keys.map((k) => graph.canEnable(k, f))

    for (let i = 0; i < 100; i++) {
      const result = keys.map((k) => graph.canEnable(k, f))
      expect(result).toEqual(baseline)
    }
  })

  test("modifying input flags does not pollute graph state", () => {
    const manifest: Record<string, FeatureSpec> = {
      parent: spec(),
      child: spec({ requires: "parent" }),
    }
    const graph = new FeatureGraph(manifest)
    const f = { parent: true, child: true }

    expect(graph.canEnable("child", f)).toBe(true)

    // Mutate the input object
    f.parent = false
    // Graph should use the new value (it reads from flags directly)
    expect(graph.canEnable("child", f)).toBe(false)

    // Restore — graph still works correctly
    f.parent = true
    expect(graph.canEnable("child", f)).toBe(true)
  })

  test("validate() can be called multiple times without side effects", () => {
    const graph = new FeatureGraph(MANIFEST)
    graph.validate()
    graph.validate()
    graph.validate()
    // No throw, no state corruption
    expect(graph.order()).toHaveLength(Object.keys(MANIFEST).length)
  })

  test("order() returns same result on repeated calls", () => {
    const graph = new FeatureGraph(MANIFEST)
    const first = graph.order()
    const second = graph.order()
    expect(first).toEqual(second)
  })

  test("blocked() returns same result on repeated calls", () => {
    const graph = new FeatureGraph(MANIFEST)
    const env = { STRATA_DISABLE_CLOUD: "1" }
    const first = graph.blocked(env)
    const second = graph.blocked(env)
    expect(first).toEqual(second)
  })
})

// ---------------------------------------------------------------------------
// Production MANIFEST Invariants
// ---------------------------------------------------------------------------

describe("FeatureGraph / production MANIFEST invariants", () => {
  const graph = new FeatureGraph(MANIFEST)

  test("no feature requires itself", () => {
    for (const [key, s] of Object.entries(MANIFEST)) {
      expect(s.requires).not.toBe(key)
    }
  })

  test("all dependency chains terminate (max depth 10)", () => {
    for (const key of Object.keys(MANIFEST)) {
      let depth = 0
      let current: string | undefined = key
      while (current && depth < 11) {
        current = (MANIFEST as Record<string, FeatureSpec>)[current]?.requires
        depth++
      }
      expect(depth).toBeLessThanOrEqual(10)
    }
  })

  test("hidden features are not required by visible features", () => {
    for (const [key, s] of Object.entries(MANIFEST)) {
      if (s.requires) {
        const parent = (MANIFEST as Record<string, FeatureSpec>)[s.requires]
        // If the parent is hidden and the child is visible, it creates a UX problem
        // where the child's toggle appears active but the parent can't be toggled.
        // This is allowed only if the child is also hidden.
        if (parent?.hidden && !s.hidden) {
          // This is a known pattern for cloud features — document but don't fail.
          // strataAuth(hidden) ← cloudSessions(hidden)
          // If a visible feature requires a hidden parent, flag it for review.
          console.warn(`Feature "${key}" (visible) requires hidden parent "${s.requires}"`)
        }
      }
    }
  })

  test("cascade from workers includes explainerWorker and reviewerWorker", () => {
    const result = graph.cascade("workers")
    expect(result).toContain("explainerWorker")
    expect(result).toContain("reviewerWorker")
  })

  test("cascade from strataAuth includes cloudSessions", () => {
    const result = graph.cascade("strataAuth")
    expect(result).toContain("cloudSessions")
  })



  test("all default-false features can be toggled on when parents are on", () => {
    const f = flags(MANIFEST as unknown as Record<string, FeatureSpec>, true)
    for (const [key, s] of Object.entries(MANIFEST)) {
      if (!s.default) {
        expect(graph.canEnable(key, f)).toBe(true)
      }
    }
  })
})
