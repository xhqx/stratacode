with open('webview-ui/src/context/session.tsx', 'r') as f:
    content = f.read()

import re

# 1. Add import
content = content.replace(
    'import { createModelSelectionLogic } from "./model-selection-logic"',
    'import { createModelSelectionLogic } from "./model-selection-logic"\nimport { createPermissionLogic } from "./permission-logic"'
)

# 2. Instantiate permission logic
instantiation = """
  const permissionLogic = createPermissionLogic({
    vscode,
  })
"""
# insert after const vscode = useVSCode()
content = content.replace("const vscode = useVSCode()", "const vscode = useVSCode()\n" + instantiation)

# 3. Replace state definitions
content = re.sub(r'  const \[permissions, setPermissions\] = createSignal<PermissionRequest\[\]>\(\[\]\)\n', '', content)
content = re.sub(r'  // Permission IDs that have been responded to but not yet confirmed by the server\n  const \[respondingPermissions, setRespondingPermissions\] = createSignal<Set<string>>\(new Set\(\)\)\n', '', content)

# 4. Remove message handlers
content = re.sub(r'      if \(message\.type === "permissionRequest"\) \{\n        handlePermissionRequest\(message\.permission\)\n      \}\n', '', content)
content = re.sub(r'      if \(message\.type === "permissionResolved"\) \{\n        handlePermissionResolved\(message\.permissionID\)\n      \}\n', '', content)
content = re.sub(r'      if \(message\.type === "permissionError"\) \{\n        handlePermissionError\(message\.permissionID\)\n      \}\n', '', content)

# 5. Remove clearPermissions logic
content = content.replace("        setPermissions([])\n", "        permissionLogic.clearPermissions()\n")
content = content.replace("        setRespondingPermissions(new Set<string>())\n", "")

# 6. Remove functions
content = re.sub(r'  function handlePermissionRequest.*?\}\n', '', content, flags=re.DOTALL)
# wait, regex might be greedy or not greedy, it's risky
# I will use replace
old_funcs = """  function handlePermissionRequest(permission: PermissionRequest) {
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
  }"""
content = content.replace(old_funcs, "")

old_scoped = """  function scopedPermissions(sessionID: string | undefined): PermissionRequest[] {
    if (!sessionID) return []
    return permissions().filter((p) => p.sessionID === sessionID)
  }"""
content = content.replace(old_scoped, "")

old_respond = """  function respondToPermission(
    permissionId: string,
    response: "once" | "always" | "reject",
    approvedAlways: string[],
  ) {
    vscode.postMessage({
      type: "respondPermission",
      permissionId,
      response,
      approvedAlways,
    })
    setRespondingPermissions((prev) => new Set(prev).add(permissionId))
  }"""
content = content.replace(old_respond, "")

# 7. Replace usages
content = content.replace("setPermissions((prev) => removeSessionPermissions(prev, sessionID))", "permissionLogic.removeSession(sessionID)")
content = content.replace("const scoped = scopedPermissions(id)", "const scoped = permissionLogic.scopedPermissions(id)")
content = content.replace("permissions,", "permissions: permissionLogic.permissions,")
content = content.replace("respondingPermissions,", "respondingPermissions: permissionLogic.respondingPermissions,")
content = content.replace("scopedPermissions,", "scopedPermissions: permissionLogic.scopedPermissions,")
content = content.replace("respondToPermission,", "respondToPermission: permissionLogic.respondToPermission,")

with open('webview-ui/src/context/session.tsx', 'w') as f:
    f.write(content)

print("Patched session.tsx with permission logic")
