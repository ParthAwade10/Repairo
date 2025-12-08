# Logo Setup Instructions

## To Fix Glitchy Logo Rendering

If your logo looks glitchy, here's the best solution:

### Option 1: Use Your JPEG/PNG File Directly (Recommended)

1. **Convert your JPEG to PNG** (better quality, supports transparency):
   - Use an online converter or image editor
   - Save as PNG format

2. **Place the file** in `/frontend/public/` as:
   - `logo.png` (preferred) OR
   - `logo.jpg` (also works)

3. **The app will automatically use it** - no code changes needed!

### Option 2: Optimize the SVG

If you want to use SVG, make sure:
- The SVG is clean and simple (no complex paths)
- File size is reasonable (< 50KB)
- Uses simple shapes instead of complex transforms

### Current Setup

The Logo component tries files in this order:
1. `/logo.png` (tried first - best for photos)
2. `/logo.svg` (fallback)
3. `/logo.jpg` (last resort)
4. Built-in fallback icon (if all fail)

### Quick Fix

**Just place your logo JPEG/PNG file as `logo.png` in the `/frontend/public/` folder and it will work perfectly!**

The component is already set up to handle PNG/JPEG files better than SVG for photographic logos.

