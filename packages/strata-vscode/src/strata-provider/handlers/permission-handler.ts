/**
 * Permission handlers — extracted from StrataProvider.
 *
 * Manages permission responses (once/always/reject) and recovery of
 * pending permissions after SSE reconnections. No vscode dependency.
 */

import type { StrataClient, PermissionRequest } from "@stratacode/sdk/v2/client"

export type RecoverablePermission = PermissionRequest

export interface PermissionContext {
  readonly client: StrataClient | null
  readonly currentSessionId: string | undefined
  readonly trackedSessionIds: Set<string>
  readonly sessionDirectories: ReadonlyMap<string, string>
  postMessage(msg: unknown): void
  getWorkspaceDirectory(sessionId?: string): string
}

export function recoveryDirs(workspace: string, dirs: ReadonlyMap<string, string>) {
  return [...new Set([workspace, ...dirs.values()])]
}

export function recoverablePermissions(perms: RecoverablePermission[], tracked: Set<string>, seen: Set<string>) {
  return perms.filter((perm) => {
    if (seen.has(perm.id)) return false
    seen.add(perm.id)
    return tracked.has(perm.sessionID)
  })
}

/**
 * Handle permission response from the webview.
 * Calls saveAlwaysRules first (if any), then reply — sequentially to avoid races.
 */
export async function handlePermissionResponse(
  ctx: PermissionContext,
  permissionId: string,
  sessionID: string,
  response: "once" | "always" | "reject",
  approvedAlways: string[],
  deniedAlways: string[],
  scope?: "global" | "agent",
  agent?: string,
): Promise<void> {
  if (!ctx.client) {
    ctx.postMessage({ type: "permissionError", permissionID: permissionId })
    return
  }

  const target = sessionID || ctx.currentSessionId
  if (!target) {
    console.error("[Strata New] StrataProvider: No sessionID for permission response")
    ctx.postMessage({ type: "permissionError", permissionID: permissionId })
    return
  }

  try {
    const dir = ctx.getWorkspaceDirectory(target)

    // Save per-pattern rules before replying (reply deletes the pending request)
    if (approvedAlways.length > 0 || deniedAlways.length > 0) {
      if (scope === "agent" && agent) {
        await saveAgentPermissionRules(ctx, agent, approvedAlways, deniedAlways, permissionId, dir)
      } else {
        await ctx.client.permission.saveAlwaysRules(
          {
            requestID: permissionId,
            directory: dir,
            approvedAlways,
            deniedAlways,
          },
          { throwOnError: true },
        )
      }
    }

    await ctx.client.permission.reply(
      { requestID: permissionId, reply: response, directory: dir },
      { throwOnError: true },
    )
  } catch (error) {
    console.error("[Strata New] StrataProvider: Failed to respond to permission:", error)
    ctx.postMessage({ type: "permissionError", permissionID: permissionId })
  }
}

async function saveAgentPermissionRules(
  ctx: PermissionContext,
  agent: string,
  approved: string[],
  denied: string[],
  requestId: string,
  dir: string,
): Promise<void> {
  const listRes = await ctx.client!.permission.list({ directory: dir })
  const pending = listRes.data?.find((p) => p.id === requestId)
  const permName = pending?.permission ?? "*"

  const rules: Record<string, "allow" | "deny"> = {}
  for (const p of approved) rules[p] = "allow"
  for (const p of denied) rules[p] = "deny"

  await ctx.client!.config.update({
    directory: dir,
    config: {
      agent: {
        [agent]: {
          permission: { [permName]: rules },
        },
      },
    },
  })
}

/**
 * Fetch all pending permissions from the backend and forward any that belong
 * to tracked sessions to the webview. Called after SSE reconnects and after
 * loading messages for a session so that missed permission.asked events are
 * recovered instead of leaving the server blocked indefinitely.
 */
export async function fetchAndSendPendingPermissions(ctx: PermissionContext): Promise<void> {
  if (!ctx.client) return
  try {
    const dirs = recoveryDirs(ctx.getWorkspaceDirectory(), ctx.sessionDirectories)

    const seen = new Set<string>()
    for (const dir of dirs) {
      const { data } = await ctx.client.permission.list({ directory: dir })
      if (!data) continue
      for (const perm of recoverablePermissions(data, ctx.trackedSessionIds, seen)) {
        ctx.postMessage({
          type: "permissionRequest",
          permission: {
            id: perm.id,
            sessionID: perm.sessionID,
            toolName: perm.permission,
            patterns: perm.patterns,
            always: perm.always,
            args: perm.metadata,
            message: `Permission required: ${perm.permission}`,
            tool: perm.tool,
            agent: perm.agent,
          },
        })
      }
    }
  } catch (error) {
    console.error("[Strata New] StrataProvider: Failed to fetch pending permissions:", error)
  }
}
