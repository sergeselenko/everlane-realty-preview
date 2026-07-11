#!/usr/bin/env python3
"""Generate responsive derivatives (-800, -400) for every base scene image under
src/assets/img/. Base = a *.jpg NOT already suffixed -<width>. Re-run after adding
or replacing any image (idempotent: overwrites the derivatives). No build-time dep —
these are committed alongside the 1600px originals; images.js builds the srcset."""
import os, re, glob
from PIL import Image
BASE = os.path.join(os.path.dirname(__file__), "..", "src", "assets", "img")
WIDTHS = [800, 400]
made = 0
for f in glob.glob(os.path.join(BASE, "**", "*.jpg"), recursive=True):
    name = os.path.basename(f)
    if re.search(r"-\d+\.jpg$", name):      # skip derivatives
        continue
    im = Image.open(f).convert("RGB")
    stem = f[:-4]
    for w in WIDTHS:
        if im.width <= w:
            continue
        h = round(im.height * w / im.width)
        out = f"{stem}-{w}.jpg"
        im.resize((w, h), Image.LANCZOS).save(out, "JPEG", quality=80, optimize=True)
        made += 1
print(f"derivatives written: {made}")
