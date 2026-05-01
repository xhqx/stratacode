/**
 * Shared logic for the batch explainer/review flow.
 */

export interface ReviewCommentPayload {
  file: string
  side: "additions" | "deletions"
  line: number
  text: string
}

export interface ReviewResponsePayload {
  summary: string
  comments: ReviewCommentPayload[]
}

export interface IndexedLine {
  file: string;
  side: "additions" | "deletions";
  line: number;
}

export interface IndexedPatchResult {
  annotatedDiffs: string;
  lineMap: Map<number, IndexedLine>;
}

const HUNK_RE = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/

export function buildIndexedPatches(diffs: { file: string, patch: string }[]): IndexedPatchResult {
  const lineMap = new Map<number, IndexedLine>();
  let nextId = 1;
  const out: string[] = [];

  for (const { file, patch } of diffs) {
    out.push(`=== FILE: ${file} ===`);
    
    let oldLine = 0;
    let newLine = 0;

    for (const raw of patch.split("\n")) {
      const hunk = raw.match(HUNK_RE);
      if (hunk) {
        oldLine = parseInt(hunk[1]!, 10);
        newLine = parseInt(hunk[2]!, 10);
        out.push(raw);
        continue;
      }
      
      if (raw.startsWith("---") || raw.startsWith("+++") || raw.startsWith("diff ") || raw.startsWith("index ")) {
        out.push(raw);
        continue;
      }

      if (raw.startsWith("-")) {
        const id = nextId++;
        lineMap.set(id, { file, side: "deletions", line: oldLine });
        out.push(`-[${id}] ${raw.slice(1)}`);
        oldLine++;
      } else if (raw.startsWith("+")) {
        const id = nextId++;
        lineMap.set(id, { file, side: "additions", line: newLine });
        out.push(`+[${id}] ${raw.slice(1)}`);
        newLine++;
      } else if (raw.startsWith(" ")) {
        out.push(raw);
        oldLine++;
        newLine++;
      } else {
        out.push(raw);
      }
    }
    out.push("");
  }

  return { annotatedDiffs: out.join("\n"), lineMap };
}

export function parseExplainResponse(raw: string, lineMap: Map<number, IndexedLine>): ReviewResponsePayload {
  const fallback: ReviewResponsePayload = { summary: "", comments: [] }
  if (!raw) return fallback

  let jsonStr = raw.trim()

  const match = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
  if (match && match[1]) {
    jsonStr = match[1].trim()
  } else {
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      jsonStr = jsonMatch[0].trim()
    }
  }

  try {
    const parsed = JSON.parse(jsonStr)
    
    if (!parsed || typeof parsed !== "object") return fallback
    
    const summary = typeof parsed.summary === "string" ? parsed.summary.trim() : ""
    const comments: ReviewCommentPayload[] = []

    if (parsed.comments) {
      if (Array.isArray(parsed.comments)) {
        // Handle case where model returns an array: [{ "1": "comment" }] or [{ "id": 1, "text": "comment" }]
        for (const item of parsed.comments) {
          if (item && typeof item === "object") {
            const idVal = "id" in item ? item.id : Object.keys(item).find(k => /\d+/.test(k))
            const textVal = "text" in item ? item.text : (idVal !== undefined ? item[idVal as keyof typeof item] : undefined)
            
            if (idVal !== undefined && typeof textVal === "string" && textVal.trim()) {
              const match = String(idVal).match(/\d+/)
              if (match) {
                const id = parseInt(match[0], 10)
                const mapped = lineMap.get(id)
                if (mapped) {
                  comments.push({
                    file: mapped.file,
                    side: mapped.side,
                    line: mapped.line,
                    text: textVal.trim()
                  })
                }
              }
            }
          }
        }
      } else if (typeof parsed.comments === "object") {
        // Handle object dictionary case (expected format)
        for (const [key, text] of Object.entries(parsed.comments)) {
          const match = String(key).match(/\d+/)
          if (!match) continue
          const id = parseInt(match[0], 10)
          if (isNaN(id)) continue
          if (typeof text !== "string" || !text.trim()) continue
          
          const mapped = lineMap.get(id)
          if (mapped) {
            comments.push({
              file: mapped.file,
              side: mapped.side,
              line: mapped.line,
              text: text.trim()
            })
          }
        }
      }
    }

    return { summary, comments }
  } catch (err) {
    return fallback
  }
}

/** Effort-based thresholds for pre-filtering small diffs. */
const PREFILTER_THRESHOLDS: Record<string, number> = {
  low: 5,
  medium: 2,
}

/**
 * Pre-filter: should we exclude this file from the batch prompt entirely?
 * Returns true when the change is too trivial to warrant an explanation.
 */
export function shouldPreSkip(patch: string, effort: string): boolean {
  // "high" effort never pre-skips
  const threshold = PREFILTER_THRESHOLDS[effort]
  if (threshold === undefined) return false

  const lines = patch.split("\n")
  const changed = lines.filter((l) => l.startsWith("+") || l.startsWith("-"))
    // Exclude diff headers
    .filter((l) => !l.startsWith("---") && !l.startsWith("+++"))

  if (changed.length === 0) return true

  // Pure whitespace changes
  const substantive = changed.filter((l) => l.slice(1).trim().length > 0)
  if (substantive.length === 0) return true

  // Below effort threshold
  if (substantive.length <= threshold) return true

  return false
}
