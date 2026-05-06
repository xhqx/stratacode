import re

with open('webview-ui/agent-manager/AgentManagerApp.tsx', 'r') as f:
    content = f.read()

# 1. Imports
content = content.replace(
    'import { groupApplyConflicts } from "./apply-conflicts"',
    'import { useApplyDialog } from "./useApplyDialog"\nimport { useReviewState } from "./useReviewState"'
)

# 2. Inject hooks instantiation
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
    reviewOpenByContext,
    reviewOpen,
    setReviewOpenForContext,
    setReviewOpenForSelection,
    reviewCommentsByContext,
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
start_pos = content.find('  const [activePendingId, setActivePendingId] = createSignal<string | undefined>()')
content = content[:start_pos] + hook_injection + content[start_pos:]

# 3. Remove apply section
apply_start = content.find('  const [applyStates, setApplyStates] = createSignal<Record<string, ApplyState>>({})')
apply_end = content.find('  const openWorktreeDirectory = () => {')
content = content[:apply_start] + content[apply_end:]

apply_effect = r'  createEffect\(\n    on\(\n      \(\) => \[applyTarget\(\), applyDiffs\(\), applySelectionTouched\(\)\] as const,.*?,\n    \),\n  \)\n\n'
content = re.sub(apply_effect, '', content, flags=re.DOTALL)

msg_handler = r'      \} else if \(msg\.type === "agentManager\.applyWorktreeDiffResult"\) \{.*?\}\)\)\n'
content = re.sub(msg_handler, '', content, flags=re.DOTALL)

# 4. Remove review section
review_start = content.find('  const [reviewOpenByContext, setReviewOpenByContext]')
review_end = content.find('  const applyStateForSelection = createMemo(() => {')
content = content[:review_start] + content[review_end:]

open_close_tab_start = content.find('  const openReviewTab = () => {')
open_close_tab_end = content.find('  const setSharedDiffStyle = (style: "unified" | "split") => {')
content = content[:open_close_tab_start] + content[open_close_tab_end:]

# 5. Remove ApplyState interface
content = re.sub(r'interface ApplyState \{.*?\}\n', '', content, flags=re.DOTALL)

with open('webview-ui/agent-manager/AgentManagerApp.tsx', 'w') as f:
    f.write(content)
