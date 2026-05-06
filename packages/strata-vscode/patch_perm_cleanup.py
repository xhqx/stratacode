with open('webview-ui/src/context/session.tsx', 'r') as f:
    content = f.read()

import re

# Remove handlePermissionRequest, handlePermissionResolved, handlePermissionError
content = re.sub(r'  function handlePermissionRequest\(permission: PermissionRequest\) \{.*?\}\n\n', '', content, flags=re.DOTALL)
content = re.sub(r'  function handlePermissionResolved\(permissionID: string\) \{.*?\}\n\n', '', content, flags=re.DOTALL)
content = re.sub(r'  function handlePermissionError\(permissionID: string\) \{.*?\}\n\n', '', content, flags=re.DOTALL)
content = re.sub(r'  function scopedPermissions\(.*?\}\n\n', '', content, flags=re.DOTALL)
content = re.sub(r'  function respondToPermission\(.*?\}\n\n', '', content, flags=re.DOTALL)

with open('webview-ui/src/context/session.tsx', 'w') as f:
    f.write(content)

