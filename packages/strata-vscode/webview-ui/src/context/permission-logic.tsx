import { createSignal, onMount } from "solid-js"
import type { Accessor } from "solid-js"
import type { PermissionRequest } from "../types/messages"
import type { ExtensionMessage } from "../types/messages/extension-messages"
import { removeSessionPermissions, upsertPermission } from "./permission-queue"

export interface PermissionDependencies {
  showToast: (props: any) => void;
  language: any;
  vscode: {
    postMessage: (msg: any) => void
    onMessage: (handler: (msg: ExtensionMessage) => void) => () => void
  }
}

export function createPermissionLogic(deps: PermissionDependencies) {
  const [permissions, setPermissions] = createSignal<PermissionRequest[]>([])
  // Permission IDs that have been responded to but not yet confirmed by the server
  const [respondingPermissions, setRespondingPermissions] = createSignal<Set<string>>(new Set())

  function handleMessage(message: ExtensionMessage) {
    if (message.type === "permissionRequest") {
      setPermissions((prev) => upsertPermission(prev, message.permission))
    } else if (message.type === "permissionResolved") {
      setPermissions((prev) => prev.filter((p) => p.id !== message.permissionID))
      setRespondingPermissions((prev) => {
        const next = new Set(prev)
        next.delete(message.permissionID)
        return next
      })
    } else if (message.type === "permissionError") {
      // Keep it in the list so the user can try again
      setRespondingPermissions((prev) => {
        const next = new Set(prev)
        next.delete(message.permissionID)
        return next
      })
      deps.showToast({
        variant: "error",
        title: deps.language.t("settings.permissions.toast.updateFailed.title"),
      })
    }
  }

  onMount(() => {
    deps.vscode.onMessage(handleMessage)
  })

  function clearPermissions() {
    setPermissions([])
    setRespondingPermissions(new Set<string>())
  }

  function removeSession(sessionID: string) {
    setPermissions((prev) => removeSessionPermissions(prev, sessionID))
  }

  function scopedPermissions(sessionID: string | undefined): PermissionRequest[] {
    if (!sessionID) return []
    return permissions().filter((p) => p.sessionID === sessionID)
  }

  function respondToPermission(
    permissionId: string,
    response: "once" | "always" | "reject",
    approvedAlways: string[],
    deniedAlways: string[],
    scope?: "global" | "agent",
    agent?: string,
  ) {
    const permission = permissions().find((p) => p.id === permissionId)
    const sessionID = permission?.sessionID ?? ""
    deps.vscode.postMessage({
      type: "permissionResponse",
      permissionId,
      sessionID,
      response,
      approvedAlways,
      deniedAlways,
      scope,
      agent,
    })
    setRespondingPermissions((prev) => new Set(prev).add(permissionId))
  }

  return {
    permissions,
    respondingPermissions,
    clearPermissions,
    removeSession,
    scopedPermissions,
    respondToPermission,
  }
}
