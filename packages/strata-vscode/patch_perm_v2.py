with open('webview-ui/src/context/session.tsx', 'r') as f:
    content = f.read()

# 1. Imports
content = content.replace(
    'import { removeSessionPermissions, upsertPermission } from "./permission-queue"',
    'import { createPermissionLogic } from "./permission-logic"'
)

# 2. Instantiation
content = content.replace(
    'const vscode = useVSCode()',
    'const vscode = useVSCode()\n  const permissionLogic = createPermissionLogic({ vscode })'
)

# 3. State removal
content = content.replace('  const [permissions, setPermissions] = createSignal<PermissionRequest[]>([])\n', '')
content = content.replace('  // Permission IDs that have been responded to but not yet confirmed by the server\n  const [respondingPermissions, setRespondingPermissions] = createSignal<Set<string>>(new Set())\n', '')

# 4. Message handlers removal
unsub_permissions_block = """  const unsubPermissions = vscode.onMessage((message: ExtensionMessage) => {
    switch (message.type) {
      case "permissionRequest":
        handlePermissionRequest(message.permission)
        break
      case "permissionResolved":
        handlePermissionResolved(message.permissionID)
        break
      case "permissionError":
        handlePermissionError(message.permissionID)
        break
    }
  })

"""
content = content.replace(unsub_permissions_block, "")
content = content.replace("    unsubPermissions()\n", "")
content = content.replace("  onCleanup(unsubPermissions)\n", "")

# 5. Functions removal
handle_funcs = """  function handlePermissionRequest(permission: PermissionRequest) {
    setPermissions((prev) => upsertPermission(prev, permission))
  }

  function handlePermissionResolved(permissionID: string) {
    setPermissions((prev) => prev.filter((p) => p.id !== permissionID))
    setRespondingPermissions((prev) => {
      const next = new Set(prev)
      next.delete(permissionID)
      return next
    })
  }

  function handlePermissionError(permissionID: string) {
    // Keep it in the list so the user can try again
    setRespondingPermissions((prev) => {
      const next = new Set(prev)
      next.delete(permissionID)
      return next
    })
  }

"""
content = content.replace(handle_funcs, "")

scoped_func = """  function scopedPermissions(sessionID: string | undefined): PermissionRequest[] {
    if (!sessionID) return []
    return permissions().filter((p) => p.sessionID === sessionID)
  }

"""
content = content.replace(scoped_func, "")

respond_func = """  function respondToPermission(
    permissionId: string,
    response: "once" | "always" | "reject",
    approvedAlways: string[],
    deniedAlways: string[],
    scope?: "global" | "agent",
    agent?: string,
  ) {
    // Resolve sessionID from the stored permission request
    const permission = permissions().find((p) => p.id === permissionId)
    const sessionID = permission?.sessionID ?? currentSessionID() ?? ""

    // Mark as responding so the UI disables the buttons.
    // The permission is removed when the server confirms via permission.replied SSE.
    setRespondingPermissions((prev) => new Set(prev).add(permissionId))

    vscode.postMessage({
      type: "permissionResponse",
      permissionId,
      sessionID,
      response,
      approvedAlways,
      deniedAlways,
      scope,
      agent,
    })
  }

"""
content = content.replace(respond_func, "")

# 6. Usage replacements
content = content.replace("        setPermissions([])\n        setRespondingPermissions(new Set<string>())\n", "        permissionLogic.clearPermissions()\n")
content = content.replace("      setPermissions((prev) => removeSessionPermissions(prev, sessionID))\n", "      permissionLogic.removeSession(sessionID)\n")
content = content.replace("const scoped = scopedPermissions(id)", "const scoped = permissionLogic.scopedPermissions(id)")
content = content.replace("    permissions,\n    respondingPermissions,\n", "    permissions: permissionLogic.permissions,\n    respondingPermissions: permissionLogic.respondingPermissions,\n")
content = content.replace("    scopedPermissions,\n", "    scopedPermissions: permissionLogic.scopedPermissions,\n")
content = content.replace("    respondToPermission,\n", "    respondToPermission: permissionLogic.respondToPermission,\n")


with open('webview-ui/src/context/session.tsx', 'w') as f:
    f.write(content)

print("Patch v2 applied")
