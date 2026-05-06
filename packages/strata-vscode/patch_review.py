with open('webview-ui/agent-manager/useReviewState.tsx', 'r') as f:
    content = f.read()

import re
content = re.sub(r'  const \[reviewDiffStyle, setReviewDiffStyle\] = createSignal<"split" \| "unified">.*?\n', '', content)
content = content.replace("    reviewDiffStyle,\n", "")
content = content.replace("    setReviewDiffStyle,\n", "")

with open('webview-ui/agent-manager/useReviewState.tsx', 'w') as f:
    f.write(content)
