from PIL import Image, ImageFilter
import numpy as np
import sys

def main(image_path):
    print("Processing", image_path)
    img = Image.open(image_path).convert('RGBA')
    arr = np.array(img)
    
    tolerance = 120
    h, w = arr.shape[:2]
    mask = np.zeros((h, w), dtype=np.uint8)
    visited = np.zeros((h, w), dtype=bool)
    
    queue = []
    for x in range(w):
        queue.append((x, 0))
        queue.append((x, h-1))
        visited[0, x] = True
        visited[h-1, x] = True
    for y in range(h):
        if not visited[y, 0]:
            queue.append((0, y))
            visited[y, 0] = True
        if not visited[y, w-1]:
            queue.append((w-1, y))
            visited[y, w-1] = True
            
    head = 0
    while head < len(queue):
        cx, cy = queue[head]
        head += 1
        
        r, g, b = arr[cy, cx, :3]
        if r < tolerance and g < tolerance and b < tolerance:
            mask[cy, cx] = 1
            for nx, ny in ((cx-1, cy), (cx+1, cy), (cx, cy-1), (cx, cy+1)):
                if 0 <= nx < w and 0 <= ny < h and not visited[ny, nx]:
                    visited[ny, nx] = True
                    queue.append((nx, ny))
                    
    # The mask is 1 for background. We want 255 for foreground, 0 for background.
    alpha_raw = (1 - mask) * 255
    mask_img = Image.fromarray(alpha_raw.astype(np.uint8))
    
    # Smooth edges
    mask_img = mask_img.filter(ImageFilter.GaussianBlur(radius=1.5))
    
    # Apply new alpha
    arr[:, :, 3] = np.array(mask_img)
    
    out = Image.fromarray(arr)
    out.save(image_path)
    print("Saved transparent", image_path)

if __name__ == "__main__":
    main('packages/desktop/app-icon/icon.png')
    main('packages/strata-vscode/assets/icons/strata-light.png')
    main('packages/strata-vscode/assets/icons/strata-dark.png')
