#!/bin/bash

# Source PNG file
PNG_FILE="packages/strata-vscode/assets/icons/strata-light.png"
ICONSET_DIR="icon.iconset"

# Create iconset directory
mkdir -p "$ICONSET_DIR"

# Generate different sizes using sips
sips -z 16 16     "$PNG_FILE" --out "$ICONSET_DIR/icon_16x16.png"
sips -z 32 32     "$PNG_FILE" --out "$ICONSET_DIR/icon_16x16@2x.png"
sips -z 32 32     "$PNG_FILE" --out "$ICONSET_DIR/icon_32x32.png"
sips -z 64 64     "$PNG_FILE" --out "$ICONSET_DIR/icon_32x32@2x.png"
sips -z 128 128   "$PNG_FILE" --out "$ICONSET_DIR/icon_128x128.png"
sips -z 256 256   "$PNG_FILE" --out "$ICONSET_DIR/icon_128x128@2x.png"
sips -z 256 256   "$PNG_FILE" --out "$ICONSET_DIR/icon_256x256.png"
sips -z 512 512   "$PNG_FILE" --out "$ICONSET_DIR/icon_256x256@2x.png"
sips -z 512 512   "$PNG_FILE" --out "$ICONSET_DIR/icon_512x512.png"
sips -z 1024 1024 "$PNG_FILE" --out "$ICONSET_DIR/icon_512x512@2x.png"

# Convert iconset to icns
iconutil -c icns "$ICONSET_DIR" -o temp.icns

# Copy to targets
TARGETS=(
    "packages/desktop/src-tauri/icons/icon.icns"
    "packages/desktop-electron/icons/prod/icon.icns"
    "packages/desktop-electron/icons/beta/icon.icns"
    "packages/desktop-electron/icons/dev/icon.icns"
)

for target in "${TARGETS[@]}"; do
    if [ -f "$target" ]; then
        cp temp.icns "$target"
        echo "Updated $target"
    fi
done

# Cleanup
rm -rf "$ICONSET_DIR"
rm temp.icns
