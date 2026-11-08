#!/usr/bin/env python3
"""banner.py - the 720x320 appstore banner and the 1280x640 GitHub social preview, from real
screenshots (the Time 2 hero and the Round 2 hero; run tools/shots.sh for both platforms first).

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

def round_shot(name):
    """A Round 2 screenshot cut to its circle, with a black rim."""
    im = Image.open(os.path.join(SHOTS, name + ".png")).convert("RGB")
    m = Image.new("L", im.size, 0); ImageDraw.Draw(m).ellipse([0, 0, im.width - 1, im.height - 1], fill=255)
    return im, m

def draw(W, H, gap, tx, k, rect):
    img = Image.new("RGB", (W, H), (28, 24, 18))
    stone(img, 0, 0, W, H)
    d = ImageDraw.Draw(img)
    d.rectangle([8, 8, W - 9, H - 9], fill=(28, 24, 18))
    # real screenshots, 1:1, unframed: the Round 2 on the right, the Time 2 beside it when it fits
    rim, mask = round_shot("round-hero")
    rx, ry = W - gap - 260, (H - 260) // 2
    d.ellipse([rx - 3, ry - 3, rx + 262, ry + 262], fill=(0, 0, 0))
    img.paste(rim, (rx, ry), mask)
    if rect:
        s = Image.open(os.path.join(SHOTS, "hero.png")).convert("RGB")
        sx, sy = rx - 16 - 200, (H - 228) // 2
        d.rectangle([sx - 3, sy - 3, sx + 202, sy + 230], fill=(0, 0, 0))
        img.paste(s, (sx, sy))
    # title block on the left
    text(img, "Gielinor", tx, 62, k, (255, 255, 0))
    text(img, "HUD", tx, 62 + 11 * k, k, (255, 170, 0))
    y = 62 + 22 * k + 14
    for line in ("Orbs, weather", "and your", "hiscores"):
        text(img, line, tx + 2, y, 2, (255, 255, 255)); y += 22
    text(img, "Time 2", tx + 2, y + 10, 2, (0, 255, 255))
    text(img, "Round 2", tx + 2, y + 32, 2, (0, 255, 255))
    return img

def main():
    out = os.path.join(ROOT, "docs", "banner.png")          # appstore banner, 720x320
    draw(720, 320, 22, 26, 3, True).save(out); print(out)
    # GitHub social preview: 2:1, drawn at 640x320 then doubled so the pixels stay square
    img = draw(640, 320, 40, 60, 4, False)
    out = os.path.join(ROOT, "docs", "social.png")
    img.resize((1280, 640), Image.NEAREST).save(out); print(out)

if __name__ == "__main__":
    main()
