// stratacode_change - new file
import type { Tag } from "./parser"

export interface RankedFile {
  file: string
  score: number
  tags: Tag[]
}

export namespace RankerService {
  /**
   * Ranks files based on symbol reference counts.
   * Boosts files that are already mentioned in the conversation.
   */
  export function rank(
    store: Map<string, { mtime: number; tags: Tag[] }>,
    mentionedFiles: string[] = [],
  ): RankedFile[] {
    // 1. Build global reference counts
    const refCounts = new Map<string, number>()
    for (const { tags } of store.values()) {
      for (const tag of tags) {
        if (tag.kind === "ref") {
          refCounts.set(tag.name, (refCounts.get(tag.name) || 0) + 1)
        }
      }
    }

    // 2. Score files
    const ranked: RankedFile[] = []
    const mentionedSet = new Set(mentionedFiles)

    for (const [file, entry] of store.entries()) {
      let score = 0
      const defTags = entry.tags.filter((t) => t.kind === "def")

      // A file's base score is the sum of reference counts for symbols it defines
      for (const tag of defTags) {
        score += refCounts.get(tag.name) || 0
      }

      // If a file defines nothing that is referenced, but it has definitions,
      // give it a minimal base score so it isn't completely ignored.
      // If it has NO definitions, it's effectively a 0 score (nothing to show).
      if (score === 0 && defTags.length > 0) {
        score = 0.5
      }

      // Boost mentioned files by 3x
      if (mentionedSet.has(file)) {
        score = Math.max(score * 3, 5) // At least 5 if mentioned
      }

      ranked.push({
        file,
        score,
        tags: defTags, // We only need def tags for rendering
      })
    }

    // 3. Sort descending by score, then alphabetically as tie-breaker
    ranked.sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score
      }
      return a.file.localeCompare(b.file)
    })

    return ranked
  }
}
