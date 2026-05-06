with open('webview-ui/src/context/session.tsx', 'r') as f:
    content = f.read()

import re

# Fix clearModelOverride
content = content.replace("agentLogic.removeSession(sessionID)", "delete selections[agentName]")

# Delete the remaining unsubAgents block
content = re.sub(r'  const unsubAgents = vscode\.onMessage.*?\}\)\n\n', '', content, flags=re.DOTALL)

with open('webview-ui/src/context/session.tsx', 'w') as f:
    f.write(content)

