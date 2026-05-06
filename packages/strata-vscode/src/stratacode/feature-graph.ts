// stratacode_change - new file
import type { FeatureSpec } from "./feature-manifest"

export class FeatureGraph {
  private childrenMap = new Map<string, Set<string>>()
  private parentMap = new Map<string, string>()

  constructor(private manifest: Record<string, FeatureSpec>) {
    // Build edges
    for (const [key, spec] of Object.entries(manifest)) {
      if (!this.childrenMap.has(key)) {
        this.childrenMap.set(key, new Set())
      }
      if (spec.requires) {
        this.parentMap.set(key, spec.requires)
        if (!this.childrenMap.has(spec.requires)) {
          this.childrenMap.set(spec.requires, new Set())
        }
        this.childrenMap.get(spec.requires)!.add(key)
      }
    }
  }

  /** Validate: detect cycles, missing parents. Throws on invalid graph. */
  validate(): void {
    const visited = new Set<string>()
    const recursionStack = new Set<string>()

    const dfs = (node: string) => {
      visited.add(node)
      recursionStack.add(node)

      const children = this.childrenMap.get(node) || new Set()
      for (const child of children) {
        if (!this.manifest[child]) {
          throw new Error(`Feature graph error: Missing definition for feature '${child}'`)
        }
        if (!visited.has(child)) {
          dfs(child)
        } else if (recursionStack.has(child)) {
          throw new Error(`Feature graph error: Cycle detected involving feature '${child}'`)
        }
      }

      recursionStack.delete(node)
    }

    for (const key of Object.keys(this.manifest)) {
      if (this.manifest[key].requires && !this.manifest[this.manifest[key].requires!]) {
        throw new Error(`Feature graph error: Missing parent '${this.manifest[key].requires}' for feature '${key}'`)
      }
      if (!visited.has(key)) {
        dfs(key)
      }
    }
  }

  /** Returns true if the feature can be enabled given current flags + policy. */
  canEnable(key: string, flags: Record<string, boolean>, env?: NodeJS.ProcessEnv): boolean {
    const deny = this.blockedSet(env)
    return this.canEnableWith(key, flags, deny)
  }

  private canEnableWith(key: string, flags: Record<string, boolean>, deny: Set<string>): boolean {
    if (deny.has(key)) return false
    const parent = this.parentMap.get(key)
    if (parent) {
      if (!flags[parent]) return false
      return this.canEnableWith(parent, flags, deny)
    }
    return true
  }

  /** Returns all features that must be disabled when `key` is disabled (cascade). */
  cascade(key: string): string[] {
    const result: string[] = []
    const queue = [key]

    while (queue.length > 0) {
      const current = queue.shift()!
      const children = this.childrenMap.get(current) || new Set()
      for (const child of children) {
        result.push(child)
        queue.push(child)
      }
    }

    return result
  }

  /** Returns all features blocked by a policy (e.g. "cloud" when STRATA_DISABLE_CLOUD is set). */
  blocked(env: NodeJS.ProcessEnv = process.env): string[] {
    return [...this.blockedSet(env)]
  }

  private blockedSet(env: NodeJS.ProcessEnv = process.env): Set<string> {
    const cloud = !!env.STRATA_DISABLE_CLOUD
    const result = new Set<string>()
    for (const [key, spec] of Object.entries(this.manifest)) {
      if (cloud && spec.policy === "cloud") {
        result.add(key)
      }
    }
    return result
  }

  /** Topological sort for activation order (parents before children). */
  order(): string[] {
    const inDegree = new Map<string, number>()
    for (const key of Object.keys(this.manifest)) {
      inDegree.set(key, 0)
    }
    for (const [key, spec] of Object.entries(this.manifest)) {
      if (spec.requires) {
        inDegree.set(key, (inDegree.get(key) || 0) + 1)
      }
    }

    const queue: string[] = []
    for (const [key, degree] of inDegree.entries()) {
      if (degree === 0) {
        queue.push(key)
      }
    }

    const result: string[] = []
    while (queue.length > 0) {
      const current = queue.shift()!
      result.push(current)

      const children = this.childrenMap.get(current) || new Set()
      for (const child of children) {
        inDegree.set(child, inDegree.get(child)! - 1)
        if (inDegree.get(child) === 0) {
          queue.push(child)
        }
      }
    }

    return result
  }
}
