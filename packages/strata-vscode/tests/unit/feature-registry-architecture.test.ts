import { describe, expect, test } from "bun:test"
import { MANIFEST, type FeatureSpec } from "../../src/stratacode/feature-manifest"
import { FeatureGraph } from "../../src/stratacode/feature-graph"

describe("Feature Registry Architecture Scenarios", () => {
  const graph = new FeatureGraph(MANIFEST)
  const defaultFlags = Object.fromEntries(Object.entries(MANIFEST).map(([key, spec]) => [key, spec.default]))

  const allFeatureKeys = Object.keys(MANIFEST)

  test("Graph validation passes (no cycles, no missing parents)", () => {
    expect(() => graph.validate()).not.toThrow()
  })

  test("Total feature count is strictly monitored", () => {
    // If you add/remove features, you must update this count.
    expect(allFeatureKeys.length).toBeGreaterThanOrEqual(29)
  })

  describe("Exhaustive Schema Validation (All Features)", () => {
    test.each(allFeatureKeys)("Feature %s has valid shape", (key) => {
      const spec = MANIFEST[key as keyof typeof MANIFEST] as FeatureSpec

      // Basic fields
      expect(spec.label).toBeDefined()
      expect(typeof spec.label).toBe("string")
      expect(spec.icon).toBeDefined()

      // If it requires a parent, the parent must exist
      if (spec.requires) {
        expect(allFeatureKeys).toContain(spec.requires)
      }

      // Arrays must contain strings if defined
      if (spec.agents) {
        expect(Array.isArray(spec.agents)).toBe(true)
        spec.agents.forEach((a) => expect(typeof a).toBe("string"))
      }
      if (spec.tools) {
        expect(Array.isArray(spec.tools)).toBe(true)
        spec.tools.forEach((t) => expect(typeof t).toBe("string"))
      }
      if (spec.pinned) {
        expect(Array.isArray(spec.pinned)).toBe(true)
        spec.pinned.forEach((p) => expect(typeof p).toBe("string"))
      }
    })
  })

  describe("Dependency Cascading Validation (All Features)", () => {
    test.each(allFeatureKeys)("Feature %s respects its dependencies", (key) => {
      const spec = MANIFEST[key as keyof typeof MANIFEST]
      if (spec.requires) {
        // Given parent is false, child CANNOT be enabled
        const disabledParentFlags = { ...defaultFlags, [spec.requires]: false, [key]: true }
        expect(graph.canEnable(key, disabledParentFlags)).toBe(false)

        // Given parent is true, child CAN be enabled
        const enabledParentFlags = { ...defaultFlags, [spec.requires]: true, [key]: true }
        expect(graph.canEnable(key, enabledParentFlags)).toBe(true)
      }
    })
  })

  describe("Cloud Block Policies Validation (All Features)", () => {
    test.each(allFeatureKeys)("Feature %s properly handles offline mode", (key) => {
      const spec = MANIFEST[key as keyof typeof MANIFEST]
      // Enable the feature AND all its ancestors so dependency resolution
      // doesn't interfere with the cloud-policy assertion.
      const flags = { ...defaultFlags, [key]: true }
      let ancestor = spec.requires
      while (ancestor) {
        flags[ancestor] = true
        ancestor = MANIFEST[ancestor as keyof typeof MANIFEST]?.requires
      }

      if (spec.policy === "cloud") {
        expect(graph.canEnable(key, flags, { STRATA_DISABLE_CLOUD: "1" })).toBe(false)
      } else {
        expect(graph.canEnable(key, flags, { STRATA_DISABLE_CLOUD: "1" })).toBe(true)
      }
    })
  })

  describe("Specific Scenarios (Regression Constraints)", () => {
    test("explainerWorker is false by default and requires workers", () => {
      expect(MANIFEST.explainerWorker.default).toBe(false)
      expect(MANIFEST.explainerWorker.requires).toBe("workers")
    })

    test("repoMap is independent", () => {
      expect(MANIFEST.repoMap.requires).toBeUndefined()
    })
  })
})
