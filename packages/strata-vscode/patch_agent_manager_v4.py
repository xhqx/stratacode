with open('webview-ui/agent-manager/AgentManagerApp.tsx', 'r') as f:
    content = f.read()

import re
pattern = re.compile(r'  const \{(.*?)\} = useReviewState\(\{(.*?)\}\)', re.DOTALL)
def replacer(match):
    return """  const {
    reviewOpenByContext,
    reviewOpen,
    setReviewOpenForContext,
    setReviewOpenForSelection,
    reviewCommentsByContext,
    reviewComments,
    setReviewCommentsForSelection,
    openReviewTab,
    toggleReviewTab,
    closeReviewTab,
    reviewDiffs,
    currentDiffSessionId,
    diffSessionKey,
  } = useReviewState({
    selection,
    tabOrder,
    setTabOrder,
    activeTabId,
    setActiveTabId,
    setSidePanel,
    REVIEW_TAB_ID,
    reviewActive,
    setReviewActive,
    diffDatas,
    managedSessions,
    session,
  })"""

content = pattern.sub(replacer, content)

with open('webview-ui/agent-manager/AgentManagerApp.tsx', 'w') as f:
    f.write(content)
