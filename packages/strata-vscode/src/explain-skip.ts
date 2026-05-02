/**
 * Shared logic for the batch explainer/review flow.
 */

export interface ReviewCommentPayload {
  file: string
  side: "additions" | "deletions"
  line: number
  endLine?: number
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

export function buildExplainPrompt(annotatedDiffs: string): string {
  return `You are a strict, senior code reviewer analyzing an annotated multi-file diff.

=== DIFF FORMAT ===
Each file starts with "=== FILE: path ===".
Changed lines are prefixed with an ID:
-[123] deleted line
+[124] added line

Context lines have no ID prefix. 
Hunk headers (@@ ...) indicate line numbers.

=== TASK ===
1. Review the changes for substantive issues (bugs, logic errors, architectural flaws, security risks).
2. Skip trivial changes (formatting, renamed variables, basic docstring updates) unless they introduce bugs.
3. Keep comments extremely concise and factual.

=== OUTPUT FORMAT ===
Provide a JSON object containing:
- \`summary\`: A brief 1-2 sentence overview of the substantive changes.
- \`comments\`: An array of objects for specific substantive issues, each with:
  - \`id\`: The exact integer ID of the line to attach the comment to (or "ID1-ID2" for a range, e.g. "123-125").
  - \`text\`: The concise comment text.

Example:
\`\`\`json
{
  "summary": "Updated API to use batching and fixed race condition in auth.",
  "comments": [
    { "id": "124", "text": "This batch call is missing an error boundary." },
    { "id": "130-135", "text": "This lock is acquired but never released if an exception occurs." }
  ]
}
\`\`\`

Here are the annotated diffs to review:

${annotatedDiffs}`
}

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

function extractJsonStr(raw: string): string {
  const codeMatch = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
  if (codeMatch && codeMatch[1]) return codeMatch[1].trim()
  
  const objMatch = raw.match(/\{[\s\S]*\}/)
  if (objMatch) return objMatch[0].trim()
  
  return raw.trim()
}

function processComment(key: unknown, text: unknown, map: Map<number, IndexedLine>, out: ReviewCommentPayload[]) {
  const match = String(key).match(/\d+(?:-\d+)?/)
  if (!match) return
  
  const parts = match[0].split("-")
  const idStart = parseInt(parts[0], 10)
  const idEnd = parts[1] ? parseInt(parts[1], 10) : idStart
  if (isNaN(idStart) || isNaN(idEnd) || typeof text !== "string" || !text.trim()) return

  const mappedStart = map.get(idStart)
  if (!mappedStart) return

  let endLine: number | undefined
  if (idStart !== idEnd) {
    const mappedEnd = map.get(idEnd)
    if (mappedEnd && mappedEnd.file === mappedStart.file && mappedEnd.side === mappedStart.side) {
      endLine = mappedEnd.line
    }
  }

  out.push({
    file: mappedStart.file,
    side: mappedStart.side,
    line: mappedStart.line,
    ...(endLine !== undefined ? { endLine } : {}),
    text: text.trim(),
  })
}

function parseCommentsArr(items: unknown[], map: Map<number, IndexedLine>, out: ReviewCommentPayload[]) {
  for (const item of items) {
    if (!item || typeof item !== "object") continue
    
    const obj = item as Record<string, unknown>
    const idVal = "id" in obj ? obj.id : Object.keys(obj).find((k) => /\d+/.test(k))
    if (idVal === undefined) continue

    const textVal = "text" in obj ? obj.text : obj[idVal as string]
    processComment(idVal, textVal, map, out)
  }
}

function parseCommentsObj(obj: Record<string, unknown>, map: Map<number, IndexedLine>, out: ReviewCommentPayload[]) {
  for (const [key, text] of Object.entries(obj)) {
    processComment(key, text, map, out)
  }
}

export function parseExplainResponse(raw: string, lineMap: Map<number, IndexedLine>): ReviewResponsePayload {
  const fallback: ReviewResponsePayload = { summary: "", comments: [] }
  if (!raw) return fallback

  const str = extractJsonStr(raw)

  try {
    const parsed = JSON.parse(str)
    if (!parsed || typeof parsed !== "object") return fallback

    const obj = parsed as Record<string, unknown>
    const summary = typeof obj.summary === "string" ? obj.summary.trim() : ""
    const comments: ReviewCommentPayload[] = []

    if (Array.isArray(obj.comments)) {
      parseCommentsArr(obj.comments, lineMap, comments)
    } else if (obj.comments && typeof obj.comments === "object") {
      parseCommentsObj(obj.comments as Record<string, unknown>, lineMap, comments)
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
