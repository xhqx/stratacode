#!/usr/bin/env python3
"""Remove dark background from strata icon using flood-fill from edges."""

from PIL import Image
import numpy as np
from scipy import ndimage
from collections import deque

SRC = "/Users/aleksejgriskovec/.gemini/antigravity/brain/319c2450-0285-4861-a61e-6ad54fb7ce8b/media__1777463039515.jpg"
DST = "/Users/aleksejgriskovec/AntigravityProjects/stratacode/__scripts/strata_icon_transparent.png"

img = Image.open(SRC).convert("RGBA")
data = np.array(img)
h, w = data.shape[:2]

r, g, b = data[:, :, 0].astype(float), data[:, :, 1].astype(float), data[:, :, 2].astype(float)
luminance = (0.299 * r + 0.587 * g + 0.114 * b)

# Strategy: The image has 3 zones:
# 1. Dark outer background (luminance ~30-40)
# 2. Dark card surface (luminance ~40-65), blends with background
# 3. Bright metallic symbol (luminance ~90-255)
#
# We need to remove zones 1 and 2, keep zone 3.
# Key insight: the card has a subtle rounded-rect boundary.
# The symbol sits inside the card.
#
# Better approach: Use flood fill from all 4 edges with a generous
# dark threshold to eat through the background AND the card surface.
# The symbol's bright metallic surface acts as a natural barrier.

# Flood fill from edges: mark as "background" any pixel reachable
# from the edge with luminance below threshold
threshold = 95  # Card surface peaks around 70-80, symbol starts ~90+

visited = np.zeros((h, w), dtype=bool)
bg = np.zeros((h, w), dtype=bool)

# Seed from all edge pixels
queue = deque()
for x in range(w):
    for y in [0, h - 1]:
        if luminance[y, x] < threshold:
            queue.append((y, x))
            visited[y, x] = True
            bg[y, x] = True
for y in range(h):
    for x in [0, w - 1]:
        if luminance[y, x] < threshold and not visited[y, x]:
            queue.append((y, x))
            visited[y, x] = True
            bg[y, x] = True

# BFS flood fill
while queue:
    cy, cx = queue.popleft()
    for dy, dx in [(-1, 0), (1, 0), (0, -1), (0, 1), (-1, -1), (-1, 1), (1, -1), (1, 1)]:
        ny, nx = cy + dy, cx + dx
        if 0 <= ny < h and 0 <= nx < w and not visited[ny, nx]:
            visited[ny, nx] = True
            if luminance[ny, nx] < threshold:
                bg[ny, nx] = True
                queue.append((ny, nx))

print(f"Background pixels: {bg.sum()} / {h * w} ({bg.sum() / (h * w) * 100:.1f}%)")

# Now also flood fill from the inner arch opening at the bottom center
# The arch has a dark opening at the bottom that should also be transparent
# Seed from bottom-center area
# Actually, let the edge flood fill handle it naturally - the arch bottom
# connects to the outer background

# Create alpha: foreground = not background
# Smooth the edges with a gaussian blur on the alpha
alpha_raw = (~bg).astype(np.float64)

# Apply slight erosion then gaussian blur for anti-aliased edges
from scipy.ndimage import gaussian_filter
alpha_smooth = gaussian_filter(alpha_raw, sigma=1.2)
alpha_smooth = np.clip(alpha_smooth, 0, 1)

# Make sure core symbol stays fully opaque
alpha_smooth[alpha_raw > 0.5] = np.maximum(alpha_smooth[alpha_raw > 0.5], alpha_raw[alpha_raw > 0.5])

alpha = (alpha_smooth * 255).astype(np.uint8)
data[:, :, 3] = alpha

result = Image.fromarray(data)

# Crop to content
bbox = result.getbbox()
if bbox:
    pad = 20
    x1 = max(0, bbox[0] - pad)
    y1 = max(0, bbox[1] - pad)
    x2 = min(w, bbox[2] + pad)
    y2 = min(h, bbox[3] + pad)
    result = result.crop((x1, y1, x2, y2))
    print(f"Cropped from {img.size} to {result.size}")
    print(f"Bbox: {bbox}")

result.save(DST)
print(f"Saved to: {DST}")
