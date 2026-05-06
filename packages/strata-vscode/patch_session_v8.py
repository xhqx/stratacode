with open('webview-ui/src/context/session.tsx', 'r') as f:
    content = f.read()

import re
content = re.sub(r'  const removeMode = \(name: string\) => \{.*?\}\n\n', '', content, flags=re.DOTALL)
content = content.replace("    removeMode,\n", "    removeMode: agentLogic.removeMode,\n")

with open('webview-ui/src/context/session.tsx', 'w') as f:
    f.write(content)

