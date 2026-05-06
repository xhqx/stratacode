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

/** Build a synthetic manifest with `count` features and optional chain depth. */
function synthetic(count: number, depth = 0): Record<string, FeatureSpec> {
  const manifest: Record<string, FeatureSpec> = {}

  if (depth > 0) {
    // Build `count / depth` chains of `depth` nodes each
    const chains = Math.ceil(count / depth)
    let idx = 0
    for (let c = 0; c < chains && idx < count; c++) {
      for (let d = 0; d < depth && idx < count; d++) {
        const key = `f${idx}`
        manifest[key] = spec(d > 0 ? { requires: `f${idx - 1}` } : {})
        idx++
      }
    }
    return manifest
  }

  // Flat: no dependencies
  for (let i = 0; i < count; i++) {
    manifest[`f${i}`] = spec()
  }
  return manifest
}

/** Build a wide tree: one root with `width` direct children. */
function wide(width: number): Record<string, FeatureSpec> {
  const manifest: Record<string, FeatureSpec> = { root: spec() }
  for (let i = 0; i < width; i++) {
    manifest[`child${i}`] = spec({ requires: "root" })
  }
  return manifest
}

/** Build a mixed manifest: some chains, some cloud, some flat. */
function mixed(count: number): Record<string, FeatureSpec> {
  const manifest: Record<string, FeatureSpec> = {}
  for (let i = 0; i < count; i++) {
    const cloud = i % 5 === 0
    const parent = i > 0 && i % 3 === 0 ? `f${i - 1}` : undefined
    manifest[`f${i}`] = spec({
      ...(cloud ? { policy: "cloud" as const } : {}),
      ...(parent ? { requires: parent } : {}),
    })
  }
  return manifest
}

function elapsed(fn: () => void): number {
  const start = performance.now()
  fn()
  return performance.now() - start
}

// ---------------------------------------------------------------------------
// validate() — performance
// ---------------------------------------------------------------------------

describe("FeatureGraph / performance — validate()", () => {
  test("production MANIFEST validates in < 5ms", () => {
    const ms = elapsed(() => {
      const graph = new FeatureGraph(MANIFEST)
      graph.validate()
    })
    expect(ms).toBeLessThan(5)
  })

  test("500 flat features validate in < 20ms", () => {
    const manifest = synthetic(500)
    const ms = elapsed(() => {
      const graph = new FeatureGraph(manifest)
      graph.validate()
    })
    expect(ms).toBeLessThan(20)
  })

  test("1000 features with 10-deep chains validate in < 50ms", () => {
    const manifest = synthetic(1000, 10)
    const ms = elapsed(() => {
      const graph = new FeatureGraph(manifest)
      graph.validate()
    })
    expect(ms).toBeLessThan(50)
  })
})

// ---------------------------------------------------------------------------
// canEnable() — performance
// ---------------------------------------------------------------------------

describe("FeatureGraph / performance — canEnable()", () => {
  test("10k canEnable calls on production MANIFEST in < 50ms", () => {
    const graph = new FeatureGraph(MANIFEST)
    const f = flags(MANIFEST as unknown as Record<string, FeatureSpec>)
    const keys = Object.keys(MANIFEST)

    const ms = elapsed(() => {
      for (let i = 0; i < 10_000; i++) {
        graph.canEnable(keys[i % keys.length]!, f)
      }
    })
    expect(ms).toBeLessThan(50)
  })

  test("10k canEnable on 500-feature graph with 10-deep chains in < 250ms", () => {
    // Note: canEnable→blockedSet scans the full manifest each call (O(n)).
    // 10k calls × 500 features = 5M iterations. Threshold is generous to avoid flakes.
    const manifest = synthetic(500, 10)
    const graph = new FeatureGraph(manifest)
    graph.validate()
    const f = flags(manifest)
    const keys = Object.keys(manifest)

    const ms = elapsed(() => {
      for (let i = 0; i < 10_000; i++) {
        graph.canEnable(keys[i % keys.length]!, f)
      }
    })
    expect(ms).toBeLessThan(250)
  })

  test("canEnable with cloud env on 500-feature graph (10k calls) in < 300ms", () => {
    // blockedSet is rebuilt per call — same O(n) overhead as above plus set lookup.
    const manifest = mixed(500)
    const graph = new FeatureGraph(manifest)
    graph.validate()
    const f = flags(manifest)
    const keys = Object.keys(manifest)
    const env = { STRATA_DISABLE_CLOUD: "1" }

    const ms = elapsed(() => {
      for (let i = 0; i < 10_000; i++) {
        graph.canEnable(keys[i % keys.length]!, f, env)
      }
    })
    expect(ms).toBeLessThan(300)
  })
})

// ---------------------------------------------------------------------------
// cascade() — performance
// ---------------------------------------------------------------------------

describe("FeatureGraph / performance — cascade()", () => {
  test("cascade from root of 200-child wide tree in < 5ms", () => {
    const manifest = wide(200)
    const graph = new FeatureGraph(manifest)

    const ms = elapsed(() => {
      const result = graph.cascade("root")
      expect(result).toHaveLength(200)
    })
    expect(ms).toBeLessThan(5)
  })

  test("cascade from root of 20-deep chain in < 5ms", () => {
    const manifest: Record<string, FeatureSpec> = {}
    for (let i = 0; i < 20; i++) {
      manifest[`l${i}`] = spec(i > 0 ? { requires: `l${i - 1}` } : {})
    }
    const graph = new FeatureGraph(manifest)

    const ms = elapsed(() => {
      const result = graph.cascade("l0")
      expect(result).toHaveLength(19)
    })
    expect(ms).toBeLessThan(5)
  })

  test("1000 cascade calls on production MANIFEST in < 50ms", () => {
    const graph = new FeatureGraph(MANIFEST)
    const keys = Object.keys(MANIFEST)

    const ms = elapsed(() => {
      for (let i = 0; i < 1000; i++) {
        graph.cascade(keys[i % keys.length]!)
      }
    })
    expect(ms).toBeLessThan(50)
  })
})

// ---------------------------------------------------------------------------
// order() — performance
// ---------------------------------------------------------------------------

describe("FeatureGraph / performance — order()", () => {
  test("order on production MANIFEST in < 5ms", () => {
    const graph = new FeatureGraph(MANIFEST)
    const ms = elapsed(() => {
      graph.order()
    })
    expect(ms).toBeLessThan(5)
  })

  test("order on 1000-feature graph in < 20ms", () => {
    const manifest = synthetic(1000, 10)
    const graph = new FeatureGraph(manifest)
    graph.validate()

    const ms = elapsed(() => {
      const sorted = graph.order()
      expect(sorted).toHaveLength(1000)
    })
    expect(ms).toBeLessThan(20)
  })
})

// ---------------------------------------------------------------------------
// blocked() — performance
// ---------------------------------------------------------------------------

describe("FeatureGraph / performance — blocked()", () => {
  test("blocked on 500-feature graph (50% cloud) in < 5ms", () => {
    const manifest: Record<string, FeatureSpec> = {}
    for (let i = 0; i < 500; i++) {
      manifest[`f${i}`] = spec(i % 2 === 0 ? { policy: "cloud" as const } : {})
    }
    const graph = new FeatureGraph(manifest)

    const ms = elapsed(() => {
      const result = graph.blocked({ STRATA_DISABLE_CLOUD: "1" })
      expect(result).toHaveLength(250)
    })
    expect(ms).toBeLessThan(5)
  })

  test("10k blocked calls on production MANIFEST in < 50ms", () => {
    const graph = new FeatureGraph(MANIFEST)
    const env = { STRATA_DISABLE_CLOUD: "1" }

    const ms = elapsed(() => {
      for (let i = 0; i < 10_000; i++) {
        graph.blocked(env)
      }
    })
    expect(ms).toBeLessThan(50)
  })
})

// ---------------------------------------------------------------------------
// Construction throughput
// ---------------------------------------------------------------------------

describe("FeatureGraph / performance — construction", () => {
  test("constructing 1000 graphs from production MANIFEST in < 100ms", () => {
    const ms = elapsed(() => {
      for (let i = 0; i < 1000; i++) {
        new FeatureGraph(MANIFEST)
      }
    })
    expect(ms).toBeLessThan(100)
  })

  test("constructing graph from 1000-feature manifest in < 20ms", () => {
    const manifest = synthetic(1000, 5)
    const ms = elapsed(() => {
      new FeatureGraph(manifest)
    })
    expect(ms).toBeLessThan(20)
  })
})

// ---------------------------------------------------------------------------
// End-to-end readAll simulation
// ---------------------------------------------------------------------------

describe("FeatureGraph / performance — readAll simulation", () => {
  test("10k full readAll cycles on production MANIFEST in < 500ms", () => {
    // Each readAll cycle calls canEnable once per feature, each rebuilding blockedSet.
    // 10k cycles × 30 features × O(30) blockedSet = ~9M ops. Threshold 2× measured.
    const graph = new FeatureGraph(MANIFEST)
    const f = flags(MANIFEST as unknown as Record<string, FeatureSpec>)
    const keys = Object.keys(MANIFEST)

    const ms = elapsed(() => {
      for (let cycle = 0; cycle < 10_000; cycle++) {
        const result: Record<string, boolean> = {}
        for (const key of keys) {
          result[key] = graph.canEnable(key, f) && f[key]!
        }
      }
    })
    expect(ms).toBeLessThan(500)
  })

  test("readAll with mixed cloud env (10k cycles, 100 features) in < 5000ms", () => {
    // 10k × 100 features × O(100) blockedSet = 100M ops. This stress-tests
    // the quadratic blockedSet rebuild. The threshold is generous; if this
    // regresses significantly, caching blockedSet per env snapshot would help.
    const manifest = mixed(100)
    const graph = new FeatureGraph(manifest)
    graph.validate()
    const f = flags(manifest)
    const keys = Object.keys(manifest)
    const env = { STRATA_DISABLE_CLOUD: "1" }

    const ms = elapsed(() => {
      for (let cycle = 0; cycle < 10_000; cycle++) {
        const result: Record<string, boolean> = {}
        for (const key of keys) {
          result[key] = graph.canEnable(key, f, env) && f[key]!
        }
      }
    })
    expect(ms).toBeLessThan(5000)
  })
})
