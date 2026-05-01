// stratacode_change - new file
import type { RankedFile } from "./rank"

export interface RenderStats {
  files: number
  symbols: number
  chars: number
  budget: number
}

export interface RenderResult {
  map: string
  stats: RenderStats
}

export namespace RenderService {
  /**
   * Renders the ranked files into a token-budgeted string.
   * Stops when the char budget is exhausted.
   * Uses greedy packing: if a file doesn't fit, it stops completely (simpler than skipping).
   */
  export function render(ranked: RankedFile[], maxChars: number = 4096): RenderResult {
    const initial = { out: "<repo_map>\n", chars: 22, files: 0, symbols: 0 }

    const result = ranked.reduce((acc, { file, tags }) => {
      if (tags.length === 0 || acc.chars >= maxChars) return acc

      const sortedTags = [...tags].sort((a, b) => a.line - b.line)
      const blockLines = sortedTags.map((tag) => `│ ${tag.signature ? tag.signature.trim() : `${tag.type} ${tag.name}`}\n`)
      const block = `${file}:\n${blockLines.join("")}\n`

      if (acc.chars + block.length > maxChars) {
        acc.chars = maxChars // Stop further additions
        return acc
      }

      return {
        out: acc.out + block,
        chars: acc.chars + block.length,
        files: acc.files + 1,
        symbols: acc.symbols + blockLines.length,
      }
    }, initial)

    if (result.files === 0) {
      return {
        map: "<repo_map>\n</repo_map>",
        stats: { files: 0, symbols: 0, chars: 22, budget: maxChars },
      }
    }

    const map = result.out + "</repo_map>"
    return {
      map,
      stats: {
        files: result.files,
        symbols: result.symbols,
        chars: map.length,
        budget: maxChars,
      },
    }
  }
}
