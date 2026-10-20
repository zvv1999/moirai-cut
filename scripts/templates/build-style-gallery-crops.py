"""Make explicitly labeled detail crops alongside full-frame gallery evidence."""
import json
import os
from pathlib import Path
from PIL import Image, ImageDraw

root = Path(os.environ.get('PILOT_OUTPUT', '/Users/zhengwei/Downloads/style-quality-gallery-events-2026-09-29'))
manifest = json.loads((root / 'manifest.json').read_text())
items = manifest['results']
atlas = Image.new('RGB', (1200, 230 * ((len(items) + 3) // 4)), '#202833')
draw = ImageDraw.Draw(atlas)
for n, item in enumerate(items):
    time = str(item['sampleTimes'][0])
    source = Image.open(root / f"{item['index']}-{time}.png").convert('RGB')
    # The capture uses a black background. This is an inspection crop only;
    # keep the original image to assess placement, scale, and dark outlines.
    mask = source.convert('L').point(lambda value: 255 if value > 8 else 0)
    bounds = mask.getbbox()
    if bounds is None:
        raise ValueError(f"Blank frame: {item['id']}")
    x0, y0, x1, y1 = bounds
    pad = max(12, round(max(x1-x0, y1-y0) * .08))
    bounds = (max(0,x0-pad), max(0,y0-pad), min(source.width,x1+pad), min(source.height,y1+pad))
    crop = source.crop(bounds)
    crop.save(root / f"{item['index']}-detail.png")
    crop.thumbnail((280, 185))
    x, y = n % 4 * 300, n // 4 * 230
    atlas.paste(crop, (x+(300-crop.width)//2, y+30+(185-crop.height)//2))
    draw.text((x+10,y+8),f"{item['index']+1}. r{item['revision']} (detail)",fill='white')
atlas.save(root / 'atlas-details.jpg')
print(root / 'atlas-details.jpg')
