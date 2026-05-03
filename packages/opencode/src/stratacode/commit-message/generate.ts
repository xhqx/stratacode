import { Provider } from "@/provider"
import { LLM } from "@/session/llm"
import { Agent } from "@/agent/agent"
import { Log } from "@/util"
import type { CommitMessageRequest, CommitMessageResponse, GitContext } from "./types"
import { getGitContext } from "./git-context"
import { fetchSessionContext } from "../session-context" // stratacode_change

const log = Log.create({ service: "commit-message" })

const SYSTEM_PROMPT = `You are an expert Git commit message generator that creates conventional commit messages based on staged changes. Analyze the provided git diff output and generate an appropriate conventional commit message following the specification.

## Conventional Commits Format
Use the following types:
- **feat**: New feature or functionality
- **fix**: Bug fix or error correction
- **docs**: Documentation changes only
- **style**: Code style changes
- **refactor**: Code refactoring
- **perf**: Performance improvements
- **test**: Adding or fixing tests
- **build**: Build system or dependency changes
- **ci**: CI/CD configuration changes
- **chore**: Maintenance tasks
- **revert**: Reverting previous commits

Return ONLY a JSON object with this exact structure (no markdown fences, no extra text):
{
  "type": "feat",
  "scope": "api",
  "description": "add new endpoint",
  "body": "Detailed explanation...",
  "footer": "BREAKING CHANGE: description"
}

- "type" and "description" are REQUIRED.
- "scope", "body", and "footer" are OPTIONAL (omit them if not needed).
- "description" should be imperative mood, lowercase start, max 72 chars.
`

const SIMPLE_PROMPT = `You are an expert Git commit message generator. Analyze the provided git diff output and generate a short, simple commit message.
The message should be a single line, under 72 characters, describing the main change.
Do not use conventional commits format or gitmoji. Start with a capitalized action verb in the imperative mood (e.g. "Add", "Fix", "Update").

Return ONLY a JSON object with this exact structure (no markdown fences, no extra text):
{
  "message": "Update styling"
}`

const GITMOJI_PROMPT = `You are an expert Git commit message generator that creates commit messages using gitmoji based on staged changes. Analyze the provided git diff output and generate an appropriate commit message.

Common gitmojis:
- 🐛 (bug) Bug fix
- ✨ (sparkles) New feature
- 📝 (memo) Documentation
- ♻️ (recycle) Refactoring
- 💄 (lipstick) UI/style changes
- ⚡️ (zap) Performance
- 🔧 (wrench) Configuration

Return ONLY a JSON object with this exact structure (no markdown fences, no extra text):
{
  "emoji": "🐛",
  "description": "Fix login bug"
}`

function buildUserMessage(ctx: GitContext): string {
  const fileList = ctx.files.map((f) => `${f.status} ${f.path}`).join("\n")
  const diffs = ctx.files
    .filter((f) => f.diff)
    .map((f) => `--- ${f.path} ---\n${f.diff}`)
    .join("\n\n")

  return `Generate a commit message for the following changes:

Branch: ${ctx.branch}
Recent commits:
${ctx.recentCommits.join("\n")}

Changed files:
${fileList}

Diffs:
${diffs}`
}

function parseCommitResponse(raw: string, format: string): string {
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
    if (format === "simple" && parsed.message) {
      return parsed.message.trim()
    }
    if (format === "gitmoji" && parsed.emoji && parsed.description) {
      return `${parsed.emoji.trim()} ${parsed.description.trim()}`
    }
    if ((format === "conventional" || !format) && parsed.type && parsed.description) {
      let msg = parsed.type.trim()
      if (parsed.scope) msg += `(${parsed.scope.trim()})`
      msg += `: ${parsed.description.trim()}`
      if (parsed.body) msg += `\n\n${parsed.body.trim()}`
      if (parsed.footer) msg += `\n\n${parsed.footer.trim()}`
      return msg
    }
  } catch (err) {
    // fallback if model failed to output JSON
  }

  // Fallback to old clean method
  let result = raw.trim()
  if (result.startsWith("```")) {
    const first = result.indexOf("\n")
    if (first !== -1) {
      result = result.slice(first + 1)
    }
  }
  if (result.endsWith("```")) {
    result = result.slice(0, -3)
  }
  result = result.trim()
  if ((result.startsWith('"') && result.endsWith('"')) || (result.startsWith("'") && result.endsWith("'"))) {
    result = result.slice(1, -1)
  }
  return result.trim()
}

// Maximum time (ms) to wait for the LLM to produce a commit message before
// aborting. Prevents the HTTP request from hanging indefinitely when the
// provider is slow or the stream stalls (e.g. due to config state races).
const TIMEOUT_MS = 30_000

export async function generateCommitMessage(request: CommitMessageRequest): Promise<CommitMessageResponse> {
  const ctx = await getGitContext(request.path, request.selectedFiles)
  if (ctx.files.length === 0) {
    throw new Error("No changes found to generate a commit message for")
  }

  log.info("generating", {
    branch: ctx.branch,
    files: ctx.files.length,
  })

  let targetModel
  if (request.model) {
    const parts = request.model.split("/")
    const providerID = parts[0] as any
    const modelID = parts.slice(1).join("/")
    try {
      targetModel = await Provider.getModel(providerID, modelID as any)
    } catch (err) {
      log.warn("failed to get configured model, falling back to small model", { error: err })
    }
  }

  if (!targetModel) {
    const defaultModel = await Provider.defaultModel()
    targetModel =
      (await Provider.getSmallModel(defaultModel.providerID)) ??
      (await Provider.getModel(defaultModel.providerID, defaultModel.modelID))
  }

  let systemPrompt = SYSTEM_PROMPT
  if (request.format === "simple") systemPrompt = SIMPLE_PROMPT
  if (request.format === "gitmoji") systemPrompt = GITMOJI_PROMPT

  const agent: Agent.Info = {
    name: "commit-message",
    mode: "primary",
    hidden: true,
    options: {},
    permission: [],
    prompt: request.prompt || systemPrompt,
    temperature: 0.3,
  }

  let userMessage = buildUserMessage(ctx)
  if (request.previousMessage) {
    userMessage = `IMPORTANT: Generate a COMPLETELY DIFFERENT commit message from the previous one. The previous message was: "${request.previousMessage}". Use a different type, scope, or description approach.\n\n${userMessage}`
  }

  // stratacode_change start - inject session context for developer intent
  try {
    const { Config } = await import("../../config")
    const cfg = await Config.get()
    const limit = cfg.session_context?.limit ?? 5
    if (limit > 0) {
      const context = await fetchSessionContext(request.path, limit)
      if (context) userMessage = `${context}\n\n${userMessage}`
    }

    if (cfg.workers?.enabled) {
      const { ContextMapService } = await import("../worker/context-map")
      userMessage = await ContextMapService.inject(userMessage, request.path)
    }
  } catch (err) {
    log.warn("session context fetch failed, continuing without", { err })
  }
  // stratacode_change end

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const stream = await LLM.stream({
      agent,
      user: {
        id: "commit-message",
        sessionID: "commit-message",
        role: "user",
        model: {
          providerID: targetModel.providerID,
          modelID: targetModel.id,
        },
        time: {
          created: Date.now(),
          completed: Date.now(),
        },
      } as any,
      tools: {},
      model: targetModel,
      small: true,
      messages: [
        {
          role: "user" as const,
          content: userMessage,
        },
      ],
      abort: controller.signal,
      sessionID: "commit-message",
      system: [],
      retries: 3,
    })

    // Consume the stream explicitly so that stream-level errors surface
    // immediately instead of leaving the .text promise hanging (issue #7345).
    // With some providers/versions of the Vercel AI SDK, `await stream.text`
    // never resolves when the underlying stream errors out early.
    let result = ""
    for await (const chunk of stream.textStream) {
      result += chunk
    }

    log.info("generated", { message: result })
    return { message: parseCommitResponse(result, request.format || "conventional") }
  } catch (err) {
    if (controller.signal.aborted) {
      throw new Error("Commit message generation timed out after 30 seconds")
    }
    const msg = err instanceof Error ? err.message : String(err)
    log.error("generation failed", { error: msg })
    throw new Error(`Failed to generate commit message: ${msg}`)
  } finally {
    clearTimeout(timer)
  }
}
