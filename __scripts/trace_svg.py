from PIL import Image
import numpy as np

def trace_to_svg(png_path, svg_path):
    """Convert PNG alpha channel to an SVG with tight viewBox."""
    img = Image.open(png_path).convert('RGBA')
    
    # Resize to 128x128 for a clean, small SVG
    img = img.resize((128, 128), Image.LANCZOS)
    arr = np.array(img)
    alpha = arr[:, :, 3]
    
    # Find bounding box
    rows = np.any(alpha > 128, axis=1)
    cols = np.any(alpha > 128, axis=0)
    if not rows.any():
        print(f"No content found in {png_path}")
        return
    rmin, rmax = np.where(rows)[0][[0, -1]]
    cmin, cmax = np.where(cols)[0][[0, -1]]
    
    # Add 1px padding
    pad = 1
    vx = max(0, cmin - pad)
    vy = max(0, rmin - pad)
    vw = (cmax - cmin + 1) + pad * 2
    vh = (rmax - rmin + 1) + pad * 2
    
    print(f"Content bbox: x={cmin}-{cmax}, y={rmin}-{rmax}")
    print(f"ViewBox: {vx} {vy} {vw} {vh}")
    
    # Create SVG with filled rectangles for each opaque pixel
    rects = []
    for y in range(rmin, rmax + 1):
        x = cmin
        while x <= cmax:
            if alpha[y, x] > 128:
                # Find horizontal run
                xend = x
                while xend <= cmax and alpha[y, xend] > 128:
                    xend += 1
                rects.append(f'<rect x="{x}" y="{y}" width="{xend - x}" height="1"/>')
                x = xend
            else:
                x += 1
    
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vx} {vy} {vw} {vh}" width="24" height="24">
  <g fill="#C5C5C5">
    {"".join(rects)}
  </g>
</svg>'''
    
    with open(svg_path, 'w') as f:
        f.write(svg)
    print(f"Created {svg_path} with {len(rects)} rects")

trace_to_svg(
    'packages/strata-vscode/assets/icons/strata-light.png',
    'packages/strata-vscode/assets/icons/strata-light.svg'
)
trace_to_svg(
    'packages/strata-vscode/assets/icons/strata-dark.png',
    'packages/strata-vscode/assets/icons/strata-dark.svg'
)
