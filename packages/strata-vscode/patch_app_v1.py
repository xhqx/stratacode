with open('webview-ui/agent-manager/AgentManagerApp.tsx', 'r') as f:
    content = f.read()

import re

# Remove ApplyState interface
content = re.sub(r'interface ApplyState \{.*?\}\n', '', content, flags=re.DOTALL)

# Add import
content = content.replace(
    'import { groupApplyConflicts } from "./apply-conflicts"',
    'import { useApplyDialog } from "./useApplyDialog"'
)

# Replace state and methods
start_index = content.find('  const [applyStates, setApplyStates] = createSignal')
end_index = content.find('  const isPending = (id: string)')
if start_index != -1 and end_index != -1:
    content = content[:start_index] + """  const { openApplyDialog } = useApplyDialog({
    vscode,
    t,
    dialog,
    selection,
    managedSessions,
    diffDatas,
    diffLoading,
  })

""" + content[end_index:]

# Remove handling of agentManager.applyWorktreeDiffResult
diff_result_handler = """      } else if (msg.type === "agentManager.applyWorktreeDiffResult") {
        const ev = msg as AgentManagerApplyWorktreeDiffResultMessage
        const files = new Set((ev.conflicts ?? []).map((entry) => entry.file).filter(Boolean)).size
        const count = ev.conflicts?.length ?? 0
        setApplyStates((prev) => ({
          ...prev,
          [ev.worktreeId]: {
            status: ev.status,
            message: ev.message,
            conflicts: ev.conflicts ?? [],
          },
        }))"""
content = content.replace(diff_result_handler, "")

# And also we need to make resolveWorktreeSessionId available since it was used elsewhere.
# Actually `resolveWorktreeSessionId` is used inside `AgentManagerApp.tsx` directly!
# Let's check where it is used.
with open('webview-ui/agent-manager/AgentManagerApp.tsx', 'w') as f:
    f.write(content)
