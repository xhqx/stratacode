with open('webview-ui/src/context/agent-logic.tsx', 'r') as f:
    content = f.read()

content = content.replace("(a) => a.isDefault", "(a: any) => a.isDefault")

with open('webview-ui/src/context/agent-logic.tsx', 'w') as f:
    f.write(content)

