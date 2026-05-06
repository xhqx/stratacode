with open('webview-ui/agent-manager/AgentManagerApp.tsx', 'r') as f:
    content = f.read()

import re

# Remove review logic
review_start = content.find('  const reviewOpen = createMemo(() => {')
review_end = content.find('  const applyStateForSelection = createMemo(() => {')
content = content[:review_start] + content[review_end:]

# Remove apply state selection
apply_start = content.find('  const applyStateForSelection = createMemo(() => {')
apply_end = content.find('  const openWorktreeDirectory = () => {')
content = content[:apply_start] + content[apply_end:]

# Remove open/close review tab
tab_start = content.find('  const openReviewTab = () => {')
tab_end = content.find('  const setSharedDiffStyle = (style: "unified" | "split") => {')
content = content[:tab_start] + content[tab_end:]

# Remove Apply effect
apply_effect = r'  createEffect\(\n    on\(\n      \(\) => \[applyTarget\(\), applyDiffs\(\), applySelectionTouched\(\)\] as const,.*?,\n    \),\n  \)\n\n'
content = re.sub(apply_effect, '', content, flags=re.DOTALL)

# Remove message handler
msg_handler = r'      \} else if \(msg\.type === "agentManager\.applyWorktreeDiffResult"\) \{.*?\}\)\)\n'
content = re.sub(msg_handler, '', content, flags=re.DOTALL)

# Remove ApplyState interface
content = re.sub(r'interface ApplyState \{.*?\}\n', '', content, flags=re.DOTALL)

with open('webview-ui/agent-manager/AgentManagerApp.tsx', 'w') as f:
    f.write(content)
