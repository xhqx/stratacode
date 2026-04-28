from PIL import Image
import numpy as np

def trace(png_path, svg_path, size):
    img = Image.open(png_path).convert('RGBA')
    img = img.resize((size, size), Image.LANCZOS)
    arr = np.array(img)
    
    # Use alpha channel since this PNG has transparency
    alpha = arr[:, :, 3]
    mask = alpha > 128

    rows = np.any(mask, axis=1)
    cols = np.any(mask, axis=0)
    rmin, rmax = np.where(rows)[0][[0, -1]]
    cmin, cmax = np.where(cols)[0][[0, -1]]

    # Squash vertically by 15% to make it less tall
    content_h = rmax - rmin + 1
    content_w = cmax - cmin + 1
    squeeze = 0.85
    new_h = int(content_h * squeeze)
    offset_y = (content_h - new_h) // 2

    pad = 1
    vx = max(0, cmin - pad)
    vy = max(0, rmin + offset_y - pad)
    vw = content_w + pad * 2
    vh = new_h + pad * 2

    rects = []
    for y in range(rmin + offset_y, rmin + offset_y + new_h):
        if y < 0 or y >= size:
            continue
        x = cmin
        while x <= cmax:
            if mask[y, x]:
                xend = x
                while xend <= cmax and mask[y, xend]:
                    xend += 1
                rects.append(f'<rect x="{x}" y="{y}" width="{xend - x}" height="1"/>')
                x = xend
            else:
                x += 1

    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vx} {vy} {vw} {vh}" width="24" height="24">
  <g fill="currentColor">
    {"".join(rects)}
  </g>
</svg>'''

    with open(svg_path, 'w') as f:
        f.write(svg)
    print(f"Created {svg_path} ({size}x{size}, {len(rects)} rects, viewBox {vx} {vy} {vw} {vh})")

src = 'packages/strata-vscode/assets/icons/strata-light.png'
trace(src, 'packages/strata-vscode/assets/icons/strata-activity-v6.svg', 64)
