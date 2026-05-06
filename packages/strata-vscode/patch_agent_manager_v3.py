with open('webview-ui/agent-manager/AgentManagerApp.tsx', 'r') as f:
    content = f.read()

import re

# Update useReviewState call
old_use_review_state = """  const {
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
  })"""

new_use_review_state = """  const {
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

content = content.replace(old_use_review_state, new_use_review_state)

with open('webview-ui/agent-manager/AgentManagerApp.tsx', 'w') as f:
    f.write(content)
