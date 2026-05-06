with open('webview-ui/agent-manager/AgentManagerApp.tsx', 'r') as f:
    lines = f.readlines()

# delete lines 439 to 635 (indices 438 to 635)
del lines[438:635]

with open('webview-ui/agent-manager/AgentManagerApp.tsx', 'w') as f:
    f.writelines(lines)
