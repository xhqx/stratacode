with open('webview-ui/src/context/session.tsx', 'r') as f:
    content = f.read()

import re
content = re.sub(r'  // Handle permission events immediately.*?\n  const unsubPermissions = vscode\.onMessage.*?\n  \}\)\n\n', '', content, flags=re.DOTALL)
content = content.replace("  onCleanup(unsubPermissions)\n", "")
content = content.replace("      setPermissions([])\n      setRespondingPermissions(new Set<string>())\n", "      permissionLogic.clearPermissions()\n")

# Wait, what was on line 1318? Let's check with python
