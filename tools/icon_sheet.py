#!/usr/bin/env python3
"""icon_sheet.py - render every icon in src/embeddedjs/main.js ICONS to a labelled contact sheet.

Reads the same single-string icon data the watch draws (2-digit width + concatenated rows) and the
PAL table, so the sheet is exactly what the face paints. Run: python3 tools/icon_sheet.py [out.png]
"""
import os, re, sys
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
src = open(os.path.join(HERE, "..", "src", "embeddedjs", "main.js")).read()
pal = dict(re.findall(r'(\w): "(#[0-9A-F]{6})"', src[src.index("const PAL"):src.index("const ICONS")]))
icons = re.findall(r'^\s+(\w+): "(\d\d)([^"]+)",', src[src.index("const ICONS"):src.index("const SKILLS")], re.M)
S, CELL, COLS = 4, 70, 6
rows = (len(icons) + COLS - 1) // COLS
sheet = Image.new("RGB", (COLS * CELL, rows * CELL), (0, 0, 0))
d = ImageDraw.Draw(sheet)
for n, (name, w, body) in enumerate(icons):
    w = int(w); h = len(body) // w
    ox, oy = (n % COLS) * CELL + (CELL - w * S) // 2, (n // COLS) * CELL + 4
    d.rectangle([(n % COLS) * CELL + 1, (n // COLS) * CELL + 1, (n % COLS + 1) * CELL - 2, (n // COLS + 1) * CELL - 2], fill=(85, 85, 0))
    for i, ch in enumerate(body):
        if ch == ".": continue
        x, y = i % w, i // w
        c = pal[ch]; rgb = tuple(int(c[k:k + 2], 16) for k in (1, 3, 5))
        d.rectangle([ox + x * S, oy + y * S, ox + x * S + S - 1, oy + y * S + S - 1], fill=rgb)
    d.text(((n % COLS) * CELL + 4, (n // COLS) * CELL + CELL - 13), name, fill=(255, 255, 0))
out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "..", "docs", "screenshots", "icons.png")
sheet.save(out); print(out, len(icons), "icons")
