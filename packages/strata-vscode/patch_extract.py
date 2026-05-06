import re

with open('webview-ui/agent-manager/AgentManagerApp.tsx', 'r') as f:
    content = f.read()

# 1. Imports
content = content.replace(
    'import { groupApplyConflicts } from "./apply-conflicts"',
    'import { useApplyDialog } from "./useApplyDialog"\nimport { useReviewState } from "./useReviewState"'
)

# 2. Extract useApplyDialog

apply_state_pattern = r'  const \[applyStates, setApplyStates\] = createSignal.*?const openWorktreeDirectory = \(\) => \{'
# We don't want to remove `openWorktreeDirectory` itself.
apply_code = content[content.find('  const [applyStates, setApplyStates] = createSignal'):content.find('  const openWorktreeDirectory = () => {')]

content = content.replace(apply_code, "")

apply_effect = r'  createEffect\(\n    on\(\n      \(\) => \[applyTarget\(\), applyDiffs\(\), applySelectionTouched\(\)\] as const,.*?,\n    \),\n  \)\n\n'
content = re.sub(apply_effect, '', content, flags=re.DOTALL)

# Remove the message handler inside onMessage
msg_handler = r'      \} else if \(msg\.type === "agentManager\.applyWorktreeDiffResult"\) \{.*?\}\)\)\n'
content = re.sub(msg_handler, '', content, flags=re.DOTALL)

# 3. Extract useReviewState

review_code = content[content.find('  const [reviewOpenByContext, setReviewOpenByContext] = createSignal'):content.find('  const [reviewDiffStyle, setReviewDiffStyle]')]
content = content.replace(review_code, "")

open_close_tab = content[content.find('  const openReviewTab = () => {'):content.find('  const setSharedDiffStyle = (style: "unified" | "split") => {')]
content = content.replace(open_close_tab, "")

# Remove ApplyState interface
content = re.sub(r'interface ApplyState \{.*?\}\n', '', content, flags=re.DOTALL)

# Inject hooks instantiation
hook_injection = """  const {
    openApplyDialog,
    resolveWorktreeSessionId,
  } = useApplyDialog({
    vscode,
    t,
    dialog,
    selection,
    managedSessions,
    diffDatas,
    diffLoading,
  })

  const {
    reviewOpen,
    setReviewOpenForContext,
    setReviewOpenForSelection,
    reviewComments,
    setReviewCommentsForSelection,
    openReviewTab,
    closeReviewTab,
  } = useReviewState({
    selection,
    tabOrder,
    setTabOrder,
    activeTabId,
    setActiveTabId,
    setSidePanel,
    REVIEW_TAB_ID,
  })

"""
# Put it where the original applyStates was defined
start_pos = content.find('  const [activePendingId, setActivePendingId]')
content = content[:start_pos] + hook_injection + content[start_pos:]

with open('webview-ui/agent-manager/AgentManagerApp.tsx', 'w') as f:
    f.write(content)
