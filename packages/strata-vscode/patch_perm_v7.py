with open('webview-ui/src/context/session.tsx', 'r') as f:
    content = f.read()

import re

# Fix instantiation position
instantiation = "  const permissionLogic = createPermissionLogic({ vscode, showToast, language })\n"
content = content.replace(instantiation, "")

# Find where useLanguage is
content = content.replace(
    "const language = useLanguage()",
    "const language = useLanguage()\n" + instantiation
)

# Remove the remaining unsubPermissions
content = re.sub(r'  // Handle permission events immediately.*?\n  const unsubPermissions = vscode\.onMessage.*?\}\)\n', '', content, flags=re.DOTALL)
content = content.replace("  onCleanup(unsubPermissions)\n", "")

# Fix duplicate scopedPermissions
content = re.sub(r'  /\*\* Return permissions scoped to the given session\'s family \(self \+ subagents\)\. \*/\n  function scopedPermissions.*?\}\n\n  /\*\* Return permissions scoped to the given session\'s family \(self \+ subagents\)\. \*/\n  function scopedPermissions.*?\}\n\n', 
"""  /** Return permissions scoped to the given session's family (self + subagents). */
  function scopedPermissions(sessionID: string | undefined): PermissionRequest[] {
    if (!sessionID) return []
    const family = sessionFamily(sessionID)
    return permissionLogic.permissions().filter((p) => family.has(p.sessionID))
  }

""", content, flags=re.DOTALL)

with open('webview-ui/src/context/session.tsx', 'w') as f:
    f.write(content)

