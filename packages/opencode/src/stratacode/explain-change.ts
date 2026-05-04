import { Log } from "@/util"
import { injectContext } from "./project-context"
import { Instance } from "@/project/instance"
import { Review } from "./review/review"
import type { DiffFile } from "./review/types"

const log = Log.create({ service: "explain-change" })

const EXPLAIN_PROMPT = `You are an expert at reading diffs and explaining what changed in plain language.

You are explaining: \${SCOPE_DESCRIPTION}

## Files Changed

\${FILE_LIST}

## Instructions

For each file (or group of closely related files), write a brief explanation:

**What changed**: One sentence describing the change.
**Why it likely changed**: Your best guess at the author's intent.
**Watch out for**: Anything a reviewer should pay close attention to (missing error handling, subtle behavior changes, etc).

Keep it factual and concise. Do NOT review for bugs or suggest fixes — just explain.
Do NOT use code blocks. Do NOT produce severity tables.

## Diff

\`\`\`diff
\${DIFF_CONTENT}
\`\`\`

Write the explanation now. Group by file or logical unit.`

const EMPTY_PROMPT = `You are an expert at reading diffs and explaining what changed in plain language.

You are explaining: \${SCOPE_DESCRIPTION}.

There are no changes to explain.

Output exactly:

## Change Explanation for \${SCOPE_DESCRIPTION}

No changes detected.`

const FILE_PROMPT = `You are an expert at reading diffs and explaining what changed in plain language.

Explain the following changes to **\${FILE_PATH}**:

\`\`\`diff
\${DIFF_CONTENT}
\`\`\`

Write a concise explanation:

**What changed**: Describe the change.
**Why it likely changed**: Your best guess at intent.
**Watch out for**: What a reviewer should focus on.

Keep it factual. No code blocks in your answer. No fix suggestions.`

function summary(file: DiffFile): string {
  let adds = 0
  let dels = 0
  for (const hunk of file.hunks) {
    for (const line of hunk.content.split("\n")) {
      if (line.startsWith("+") && !line.startsWith("+++")) adds++
      else if (line.startsWith("-") && !line.startsWith("---")) dels++
    }
  }
  const tag =
    file.status === "added" ? "[A]" : file.status === "deleted" ? "[D]" : file.status === "renamed" ? "[R]" : "[M]"
  const renamed = file.oldPath ? ` (was: ${file.oldPath})` : ""
  return `- ${tag} ${file.path}${renamed} (+${adds}, -${dels})`
}

function raw(files: DiffFile[]): string {
  return files
    .map((f) =>
      f.hunks
        .map((h) => h.content)
        .filter(Boolean)
        .join("\n"),
    )
    .filter(Boolean)
    .join("\n\n")
}

export namespace ExplainChange {
  export type Scope =
    | { kind: "uncommitted" }
    | { kind: "branch"; base?: string }
    | { kind: "range"; from: string; to: string }
    | { kind: "file"; path: string; base?: string }
    | { kind: "hunk"; path: string; hunk: number; base?: string }

  /**
   * Build a prompt for the given scope.
   * Returns the full prompt string ready to send to the LLM.
   */
  export async function prompt(scope: Scope): Promise<string> {
    let result = ""
    switch (scope.kind) {
      case "uncommitted":
        result = await promptUncommitted()
        break
      case "branch":
        result = await promptBranch(scope.base)
        break
      case "range":
        result = await promptRange(scope.from, scope.to)
        break
      case "file":
        result = await promptFile(scope.path, scope.base)
        break
      case "hunk":
        result = await promptHunk(scope.path, scope.hunk, scope.base)
        break
    }

    return result
  }

  async function injectExplainContext(prompt: string, mentioned: string[]): Promise<string> {
    try {
      return await injectContext(prompt, {
        cwd: Instance.directory,
        tier: "big",
        mentioned,
      })
    } catch (err) {
      log.warn("session context fetch failed for explain-change", { err })
    }
    return prompt
  }

  /**
   * Build a per-file explanation prompt from a raw patch string.
   * Used by the diff viewer to explain a single file without re-fetching git data.
   */
  export function filePrompt(path: string, patch: string): string {
    if (!patch.trim()) {
      return EMPTY_PROMPT.replaceAll("${SCOPE_DESCRIPTION}", `**${path}**`)
    }
    return FILE_PROMPT.replace("${FILE_PATH}", path).replace("${DIFF_CONTENT}", patch)
  }

  async function promptUncommitted(): Promise<string> {
    const diff = await Review.getUncommittedChanges()
    const desc = "**uncommitted changes**"

    if (diff.files.length === 0) {
      log.info("no uncommitted changes to explain")
      return EMPTY_PROMPT.replaceAll("${SCOPE_DESCRIPTION}", desc)
    }

    log.info("building explain prompt for uncommitted changes", { files: diff.files.length })
    const prompt = EXPLAIN_PROMPT.replace("${SCOPE_DESCRIPTION}", desc)
      .replace("${FILE_LIST}", diff.files.map(summary).join("\n"))
      .replace("${DIFF_CONTENT}", raw(diff.files))

    return injectExplainContext(
      prompt,
      diff.files.map((f) => f.path),
    )
  }

  async function promptBranch(base?: string): Promise<string> {
    const resolved = base ?? (await Review.getBaseBranch())
    const branch = await Review.getCurrentBranch()
    const diff = await Review.getBranchChanges(resolved)
    const desc = `**branch diff**: \`${branch}\` → \`${resolved}\``

    if (diff.files.length === 0) {
      log.info("no branch changes to explain", { base: resolved })
      return EMPTY_PROMPT.replaceAll("${SCOPE_DESCRIPTION}", desc)
    }

    log.info("building explain prompt for branch", { files: diff.files.length, base: resolved })
    const prompt = EXPLAIN_PROMPT.replace("${SCOPE_DESCRIPTION}", desc)
      .replace("${FILE_LIST}", diff.files.map(summary).join("\n"))
      .replace("${DIFF_CONTENT}", raw(diff.files))

    return injectExplainContext(
      prompt,
      diff.files.map((f) => f.path),
    )
  }

  async function promptRange(from: string, to: string): Promise<string> {
    const { $ } = await import("bun")
    const result = await $`git diff ${from}...${to}`.cwd(Instance.directory).quiet().nothrow()
    const desc = `**range**: \`${from}\` → \`${to}\``

    if (result.exitCode !== 0) {
      log.warn("git diff for range failed", { from, to, exitCode: result.exitCode })
      return EMPTY_PROMPT.replaceAll("${SCOPE_DESCRIPTION}", desc)
    }

    const parsed = Review.parseDiff(result.stdout.toString())
    if (parsed.files.length === 0) {
      log.info("no range changes to explain", { from, to })
      return EMPTY_PROMPT.replaceAll("${SCOPE_DESCRIPTION}", desc)
    }

    log.info("building explain prompt for range", { files: parsed.files.length, from, to })
    const prompt = EXPLAIN_PROMPT.replace("${SCOPE_DESCRIPTION}", desc)
      .replace("${FILE_LIST}", parsed.files.map(summary).join("\n"))
      .replace("${DIFF_CONTENT}", raw(parsed.files))

    return injectExplainContext(
      prompt,
      parsed.files.map((f) => f.path),
    )
  }

  async function promptFile(path: string, base?: string): Promise<string> {
    const resolved = base ?? (await Review.getBaseBranch())
    const diff = await Review.getBranchChanges(resolved)
    const target = diff.files.find((f) => f.path === path)
    const desc = `**file**: \`${path}\``

    if (!target || target.hunks.length === 0) {
      log.info("no changes to explain for file", { path, base: resolved })
      return EMPTY_PROMPT.replaceAll("${SCOPE_DESCRIPTION}", desc)
    }

    log.info("building explain prompt for file", { path, base: resolved })
    const prompt = FILE_PROMPT.replace("${FILE_PATH}", path).replace("${DIFF_CONTENT}", raw([target]))

    return injectExplainContext(prompt, [path])
  }

  async function promptHunk(path: string, idx: number, base?: string): Promise<string> {
    const resolved = base ?? (await Review.getBaseBranch())
    const diff = await Review.getBranchChanges(resolved)
    const target = diff.files.find((f) => f.path === path)
    const desc = `**hunk ${idx + 1}** in \`${path}\``

    if (!target) {
      log.info("file not found for hunk explain", { path, base: resolved })
      return EMPTY_PROMPT.replaceAll("${SCOPE_DESCRIPTION}", desc)
    }

    const hunk = target.hunks[idx]
    if (!hunk) {
      log.info("hunk index out of range", { path, idx, total: target.hunks.length })
      return EMPTY_PROMPT.replaceAll("${SCOPE_DESCRIPTION}", desc)
    }

    log.info("building explain prompt for hunk", { path, idx, base: resolved })
    const prompt = FILE_PROMPT.replace("${FILE_PATH}", `${path} (hunk ${idx + 1})`).replace(
      "${DIFF_CONTENT}",
      hunk.content,
    )

    return injectExplainContext(prompt, [path])
  }
}
