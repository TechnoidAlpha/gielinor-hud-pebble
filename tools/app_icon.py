#!/usr/bin/env python3
"""app_icon.py - the appstore icons (80x80 small, 144x144 large), drawn like the face's minimap.

A round stone dial on a transparent background: dark outline, lit edge, stone rim carrying the XP
ring (green, the rest dark red), a black well, and something from the face inside it. Drawn on a
small art grid with the face's colours, skill icons (main.js ICONS) and glyphs (genfont.py), then
scaled up whole, so the pixels stay square: 80 = 40 x 2, 144 = 48 x 3.

Run: python3 tools/app_icon.py   ->  store/icon_80.png, store/icon_144.png (the chosen variant)
                                    and docs/icon-sheet.png (every variant, for comparing)
"""
import math, os, re, sys
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..")
sys.path.insert(0, HERE)
import genfont  # noqa: E402

SRC = open(os.path.join(ROOT, "src", "embeddedjs", "main.js"), encoding="utf-8").read()
PAL = dict(re.findall(r'(\w): "(#[0-9A-F]{6})"', SRC[SRC.index("const PAL"):SRC.index("const ICONS")]))
ICONS = {n: (int(w), b) for n, w, b in re.findall(r'^\s+(\w+): "(\d\d)([^"]+)",', SRC[SRC.index("const ICONS"):SRC.index("const SKILLS")], re.M)}

def hexc(h): return tuple(int(h[i:i + 2], 16) for i in (1, 3, 5)) + (255,)
BLACK, STONE, HI, MID = hexc("#000000"), hexc("#555500"), hexc("#AAAA55"), hexc("#555555")
XP, XPBACK, YELLOW, WHITE = hexc("#00AA00"), hexc("#550000"), hexc("#FFFF00"), hexc("#FFFFFF")
RED, REDLO, ORB = hexc("#FF0000"), hexc("#AA0000"), hexc("#000055")

def unrle(e):
    out, i = [], 0
    while i < len(e):
        if "2" <= e[i] <= "9": out.append(e[i + 1] * int(e[i])); i += 2
        else: out.append(e[i]); i += 1
    return "".join(out)

def put_icon(px, name, x, y, k=1, tint=None):
    w, body = ICONS[name]; body = unrle(body)
    for i, ch in enumerate(body):
        if ch == ".": continue
        c = tint or hexc(PAL[ch])
        for dy in range(k):
            for dx in range(k): px[x + (i % w) * k + dx, y + (i // w) * k + dy] = c

def put_text(px, s, x, y, col, shadow=True):
    def draw(ox, oy, c):
        for ch in s:
            rows = genfont.N[ch]
            for ry, row in enumerate(rows):
                for rx, v in enumerate(row):
                    if v == "#": px[ox + rx, oy + ry] = c
            ox += len(rows[0]) + 1
    if shadow: draw(x + 1, y + 1, BLACK)
    draw(x, y, col)

def text_w(s): return sum(len(genfont.N[c][0]) + 1 for c in s) - 1

def dial(N, inner, frac=0.72):
    img = Image.new("RGBA", (N, N), (0, 0, 0, 0)); px = img.load()
    c = (N - 1) / 2
    R = N / 2 - 0.5                                    # outer edge touches the canvas
    ring0, ring1 = R - 5.6 * N / 40, R - 2.9 * N / 40  # XP ring inside the rim
    well = R - 7.2 * N / 40
    for y in range(N):
        for x in range(N):
            d = math.hypot(x - c, y - c)
            if d > R + 0.3: continue
            if d > R - 0.8: col = BLACK
            elif d > R - 1.8: col = HI
            elif ring0 <= d <= ring1:
                a = math.atan2(x - c, -(y - c)) % (2 * math.pi)
                col = XP if a < frac * 2 * math.pi else XPBACK
            elif d > well + 1: col = STONE
            elif d > well: col = BLACK
            else: col = BLACK
            px[x, y] = col
    inner(px, N, c, well)
    return img

# what sits in the well: original pixel art of three of the game's running jokes, drawn at 2x
# with a one-art-pixel black outline. Letters are colours (see ART_COL); "." is transparent.
ART_COL = {
    "B": hexc("#0055FF"), "L": hexc("#55AAFF"), "D": hexc("#0000AA"),      # blue partyhat
    "G": hexc("#00AA00"), "g": hexc("#55FF55"), "d": hexc("#005500"),      # cabbage
}
ART = {
    # a blue partyhat: the paper crown from the 2001 Christmas crackers, the game's rarest flex
    "partyhat": [
        "L....B....D",
        "L...BBB...D",
        "LL..BBB..DD",
        "LL.BBBBB.DD",
        "LLBBBBBBBDD",
        "LBBBBBBBBBD",
        "LLLLLLLLLLD",
        "LBBBBBBBBBD",
        "DDDDDDDDDDD",
    ],
    # a cabbage: the humblest item in the game, and its longest-running joke
    "cabbage": [
        "...GGGGG...",
        "..GggGGGG..",
        ".GggGgGGGd.",
        "GggGGgGGGGd",
        "GgGGGgGGGGd",
        "GGGGgGGGGGd",
        "GGGGgGGGGdd",
        ".GGGgGGGGd.",
        ".GGGGgGGdd.",
        "..GGGgGdd..",
        "...ddddd...",
    ],
}

def put_art(px, rows, x, y, k=2):
    h, w = len(rows), len(rows[0])
    for ox, oy, outline in ((-1, 0, 1), (1, 0, 1), (0, -1, 1), (0, 1, 1), (0, 0, 0)):
        for ry, row in enumerate(rows):
            for rx, ch in enumerate(row):
                if ch == ".": continue
                col = BLACK if outline else ART_COL[ch]
                for a in range(k):
                    for b in range(k): px[x + ox + rx * k + a, y + oy + ry * k + b] = col

def art(name):
    def inner(px, N, c, well):
        rows = ART[name]
        put_art(px, rows, round(c - len(rows[0]) + 0.5), round(c - len(rows) + 0.5))
    return inner

def coins(px, N, c, well):                             # "doubling money": a fat stack of gold
    for ox, oy in ((-1, 0), (1, 0), (0, -1), (0, 1)): put_icon(px, "coins", round(c - 10 + 0.5) + ox, round(c - 10 + 0.5) + oy, 2, BLACK)
    put_icon(px, "coins", round(c - 10 + 0.5), round(c - 10 + 0.5), 2)

VARIANTS = {"partyhat": art("partyhat"), "cabbage": art("cabbage"), "coins": coins}
CHOSEN = "partyhat"   # the listing's icon: store/icon_80.png and store/icon_144.png

def build(variant, size):
    N, k = (40, 2) if size == 80 else (48, 3)
    return dial(N, VARIANTS[variant]).resize((size, size), Image.NEAREST)

def main():
    out = os.path.join(ROOT, "store")
    imgs = {}
    for v in VARIANTS:
        for s in (80, 144):
            im = build(v, s); imgs[v, s] = im
            if v == CHOSEN: im.save(os.path.join(out, "icon_%d.png" % s))
    # contact sheet: each variant at both sizes, on the Pebble app's light and dark backgrounds
    W, H = 3 * 420, 2 * 200 + 20
    sheet = Image.new("RGBA", (W, H), (40, 40, 40, 255)); d = ImageDraw.Draw(sheet)
    for i, v in enumerate(VARIANTS):
        for j, bg in enumerate([(245, 245, 245, 255), (24, 24, 24, 255)]):
            x0, y0 = i * 420 + 10, j * 200 + 10
            d.rectangle([x0, y0, x0 + 400, y0 + 190], fill=bg)
            sheet.alpha_composite(imgs[v, 144], (x0 + 30, y0 + 23))
            sheet.alpha_composite(imgs[v, 80], (x0 + 230, y0 + 55))
            d.text((x0 + 8, y0 + 4), "%s  (144 / 80)" % v, fill=(128, 128, 128, 255))
    p = os.path.join(ROOT, "docs", "icon-sheet.png"); sheet.convert("RGB").save(p); print(p)

if __name__ == "__main__":
    main()
