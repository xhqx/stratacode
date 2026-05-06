with open('webview-ui/src/context/session.tsx', 'r') as f:
    content = f.read()

import re
content = re.sub(r'  const unsubPermissions = vscode\.onMessage.*?\}\)\n\n', '', content, flags=re.DOTALL)
content = content.replace("  onCleanup(unsubPermissions)\n", "")

with open('webview-ui/src/context/session.tsx', 'w') as f:
    f.write(content)

