with open('webview-ui/src/context/session.tsx', 'r') as f:
    content = f.read()

# Fix clearPendingPrompts
content = content.replace("setPermissions([])", "permissionLogic.clearPermissions()")
content = content.replace("setRespondingPermissions(new Set<string>())", "")

# Fix permissions() in sessionFamily
content = content.replace("permissions().filter((p) => family.has(p.sessionID))", "permissionLogic.permissions().filter((p) => family.has(p.sessionID))")

# Re-add scopedPermissions function right before scopedQuestions
scoped_permissions_str = """  /** Return permissions scoped to the given session's family (self + subagents). */
  function scopedPermissions(sessionID: string | undefined): PermissionRequest[] {
    if (!sessionID) return []
    const family = sessionFamily(sessionID)
    return permissionLogic.permissions().filter((p) => family.has(p.sessionID))
  }

"""
content = content.replace("  /** Return questions scoped to the given session's family (self + subagents). */", scoped_permissions_str + "  /** Return questions scoped to the given session's family (self + subagents). */")

# Expose scopedPermissions in the return block
content = content.replace("    scopedPermissions: permissionLogic.scopedPermissions,", "    scopedPermissions,")

with open('webview-ui/src/context/session.tsx', 'w') as f:
    f.write(content)

