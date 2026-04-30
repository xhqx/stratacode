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
    let out = "<repo_map>\\n"
    let currentChars = out.length + 12 // +12 for "\\n</repo_map>"

    let filesIncluded = 0
    let symbolsIncluded = 0

    for (const { file, tags } of ranked) {
      if (tags.length === 0) continue // Skip empty files

      // Build the block for this file
      let block = `${file}:\\n`
      let blockSymbols = 0

      // Sort tags by line number to render them in document order
      const sortedTags = [...tags].sort((a, b) => a.line - b.line)

      for (const tag of sortedTags) {
        // If we have a signature (the full line text), render that since it gives more context.
        // Otherwise fallback to the basic type + name.
        const lineText = tag.signature ? tag.signature.trim() : `${tag.type} ${tag.name}`
        block += `│ ${lineText}\\n`
        blockSymbols++
      }
      block += "\\n"

      // Check budget
      if (currentChars + block.length > maxChars) {
        // Out of budget. We stop here.
        // We could try to pack smaller files, but strict cutoff is usually fine.
        break
      }

      out += block
      currentChars += block.length
      filesIncluded++
      symbolsIncluded += blockSymbols
    }

    out += "</repo_map>"

    // If no files fit, or nothing was available, return empty wrapper.
    if (filesIncluded === 0) {
      return {
        map: "<repo_map>\\n</repo_map>",
        stats: { files: 0, symbols: 0, chars: 22, budget: maxChars },
      }
    }

    return {
      map: out,
      stats: {
        files: filesIncluded,
        symbols: symbolsIncluded,
        chars: out.length,
        budget: maxChars,
      },
    }
  }
}
