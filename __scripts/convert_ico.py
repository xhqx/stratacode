from PIL import Image
import os

def png_to_ico(png_path, ico_path):
    img = Image.open(png_path)
    # PIL can save directly to ICO
    img.save(ico_path, format='ICO', sizes=[(16,16), (32,32), (48,48), (64,64), (128,128), (256,256)])

png_path = 'packages/strata-vscode/assets/icons/strata-light.png'

targets = [
    'packages/strata-docs/public/img/favicon.ico',
    'packages/app/public/favicon.ico',
    'packages/ui/src/assets/favicon/favicon.ico',
    'packages/desktop/app-icon/icon.ico',
    'packages/desktop/src-tauri/icons/icon.ico',
    'packages/desktop-electron/icons/prod/icon.ico',
    'packages/desktop-electron/icons/beta/icon.ico',
    'packages/desktop-electron/icons/dev/icon.ico',
]

for t in targets:
    if os.path.exists(t):
        png_to_ico(png_path, t)
        print("Updated", t)
