// stratacode_change - new file
import { Effect } from "effect"
import { CacheService } from "./cache"
import { RankerService } from "./rank"
import { RenderService, type RenderResult, type RenderStats } from "./render"

export namespace RepoMap {
  export type Tag = import("./parser").Tag
  export type Result = RenderResult
  export type Stats = RenderStats

  export interface Options {
    cwd: string
    budget?: number
    mentioned?: string[]
  }

  /**
   * Generates a token-budgeted repository map string.
   */
  export const generate = (opts: Options) =>
    Effect.gen(function* () {
      // 1. Sync cache (discovers files and parses updated ones)
      const store = yield* CacheService.sync(opts.cwd)

      // 2. Rank files
      const ranked = RankerService.rank(store, opts.mentioned)

      // 3. Render map
      const result = RenderService.render(ranked, opts.budget)

      return result
    })

  /**
   * Invalidates specific files or the entire cache.
   */
  export const invalidate = CacheService.invalidate
}
