with open('webview-ui/src/context/session.tsx', 'r') as f:
    content = f.read()

import re

# pass language and showToast
content = content.replace("  const permissionLogic = createPermissionLogic({ vscode })", "  const permissionLogic = createPermissionLogic({ vscode, showToast, language })")

# replace handle functions using strict regex
content = re.sub(r'  function handlePermissionRequest\(.*?\}\n\n', '', content, flags=re.DOTALL)
content = re.sub(r'  function handlePermissionResolved\(.*?\}\n\n', '', content, flags=re.DOTALL)
content = re.sub(r'  function handlePermissionError\(.*?\}\n\n', '', content, flags=re.DOTALL)

with open('webview-ui/src/context/session.tsx', 'w') as f:
    f.write(content)

