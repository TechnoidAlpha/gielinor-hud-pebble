#!/usr/bin/env python3
"""banner.py - the 720x320 appstore banner and the 1280x640 GitHub social preview, from real
screenshots.

Text is drawn with the face's own pixel glyphs (tools/genfont.py) at any scale, with the same
one-art-pixel black drop shadow the watch uses. Screenshots are pasted unframed at 1:1 so
the pixels stay true.

Run: python3 tools/banner.py   ->  docs/banner.png, docs/social.png
"""
import os, sys
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import genfont  # noqa: E402  (glyph table G; building only happens under __main__)

ROOT = os.path.join(HERE, "..")
SHOTS = os.path.join(ROOT, "docs", "screenshots")

def text_w(s, k):
    return sum((len(genfont.G[c][0]) + 1) * k for c in s if c in genfont.G) - k

def text(img, s, x, y, k, col, shadow=True):
    d = ImageDraw.Draw(img)
    def draw(ox, oy, c):
        px = ox
        for ch in s:
            rows = genfont.G.get(ch)
            if rows is None: continue
            for ry, row in enumerate(rows):
                for rx, v in enumerate(row):
                    if v == "#":
                        d.rectangle([px + rx * k, oy + ry * k, px + rx * k + k - 1, oy + ry * k + k - 1], fill=c)
            px += (len(rows[0]) + 1) * k
    if shadow: draw(x + k, y + k, (0, 0, 0))
    draw(x, y, col)

def stone(img, x, y, w, h):
    d = ImageDraw.Draw(img)
    d.rectangle([x, y, x + w - 1, y + h - 1], fill=(0, 0, 0))
    d.rectangle([x + 1, y + 1, x + w - 2, y + h - 2], fill=(170, 170, 85))
    d.rectangle([x + 2, y + 2, x + w - 2, y + h - 2], fill=(85, 85, 85))
    d.rectangle([x + 2, y + 2, x + w - 3, y + h - 3], fill=(85, 85, 0))

def draw(W, H, gap, tx):
    img = Image.new("RGB", (W, H), (28, 24, 18))
    stone(img, 0, 0, W, H)
    d = ImageDraw.Draw(img)
    d.rectangle([8, 8, W - 9, H - 9], fill=(28, 24, 18))
    # two real screenshots, 1:1, on the right
    names = ["hero", "sunny"]
    shots = [Image.open(os.path.join(SHOTS, n + ".png")).convert("RGB") for n in names if os.path.exists(os.path.join(SHOTS, n + ".png"))]
    for i, s in enumerate(shots):                          # side by side, 1:1, unframed
        sx, sy = W - gap - 200 - (1 - i) * 216, 46
        d.rectangle([sx - 3, sy - 3, sx + 202, sy + 230], fill=(0, 0, 0))
        img.paste(s, (sx, sy))
    # title block on the left
    text(img, "Gielinor", tx, 62, 4, (255, 255, 0))
    text(img, "HUD", tx, 62 + 44, 4, (255, 170, 0))
    text(img, "Orbs, weather", tx + 2, 176, 2, (255, 255, 255))
    text(img, "and your", tx + 2, 198, 2, (255, 255, 255))
    text(img, "hiscores", tx + 2, 220, 2, (255, 255, 255))
    text(img, "Pebble Time 2", tx + 2, 252, 2, (0, 255, 255))
    return img

def main():
    out = os.path.join(ROOT, "docs", "banner.png")          # appstore banner, 720x320
    draw(720, 320, 24, 30).save(out); print(out)
    # GitHub social preview: 2:1, drawn at 640x320 then doubled so the pixels stay square
    img = draw(640, 320, 26, 36)
    out = os.path.join(ROOT, "docs", "social.png")
    img.resize((1280, 640), Image.NEAREST).save(out); print(out)

if __name__ == "__main__":
    main()
