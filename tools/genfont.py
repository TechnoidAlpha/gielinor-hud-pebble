#!/usr/bin/env python3
"""
genfont.py - build GielinorHUD's pixel fonts from hand-drawn glyphs.

Every glyph below is original pixel art on a 7-row cap grid (rows 0-6 above the baseline,
rows 7-8 for descenders), drawn for this face. The same glyphs are emitted at three scales as
AngelCode BMFont binary v3 + alpha PNG, the "*-alpha" format Piu reads (see
PebbleDayProgress/tools/genfonts.py, which established the format and the empty-kerning-block
terminator the host parser needs):

  px-n    capitals 3x5, 2x  (cap 10px)  small labels, chatbox (own glyph table, N below)
  px-m    full charset, 2x   (cap 14px)  orb values, temperatures, panel headings
  px-clk  digits + colon, 4x (cap 28px)  the clock
  px-n3   px-n's capitals at 3x (cap 15px)  Round 2: all text but the clock
  px-c5   digits + colon, 5x (cap 35px)  Round 2: the clock and the big numbers in the minimap

Coverage is hard 0/255 (no anti-aliasing) so the pixels stay crisp; main.js draws each string
twice (black, offset one art-pixel down-right, then the colour) for the drop shadow.

Run: python3 tools/genfont.py   (also prints the metrics table main.js uses)
"""
import os, struct, math
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "src", "embeddedjs", "fonts")
CAP, BASE_ROW, ROWS = 7, 7, 9   # cap height, baseline row index, total rows (incl. descender)

G = {}
def g(ch, art):
    rows = [r for r in art.strip("\n").split("\n")]
    rows = [r.strip() for r in rows]
    w = max(len(r) for r in rows)
    rows = [r.ljust(w, ".") for r in rows]
    while len(rows) < ROWS: rows.append("." * w)
    G[ch] = rows

# ---------------------------------------------------------------- uppercase
g("A", ".###.\n#...#\n#...#\n#####\n#...#\n#...#\n#...#")
g("B", "####.\n#...#\n#...#\n####.\n#...#\n#...#\n####.")
g("C", ".###.\n#...#\n#....\n#....\n#....\n#...#\n.###.")
g("D", "####.\n#...#\n#...#\n#...#\n#...#\n#...#\n####.")
g("E", "####\n#...\n#...\n###.\n#...\n#...\n####")
g("F", "####\n#...\n#...\n###.\n#...\n#...\n#...")
g("G", ".###.\n#...#\n#....\n#.###\n#...#\n#...#\n.###.")
g("H", "#...#\n#...#\n#...#\n#####\n#...#\n#...#\n#...#")
g("I", "###\n.#.\n.#.\n.#.\n.#.\n.#.\n###")
g("J", "..###\n...#.\n...#.\n...#.\n...#.\n#..#.\n.##..")
g("K", "#...#\n#..#.\n#.#..\n##...\n#.#..\n#..#.\n#...#")
g("L", "#...\n#...\n#...\n#...\n#...\n#...\n####")
g("M", "#...#\n##.##\n#.#.#\n#.#.#\n#...#\n#...#\n#...#")
g("N", "#...#\n##..#\n#.#.#\n#..##\n#...#\n#...#\n#...#")
g("O", ".###.\n#...#\n#...#\n#...#\n#...#\n#...#\n.###.")
g("P", "####.\n#...#\n#...#\n####.\n#....\n#....\n#....")
g("Q", ".###.\n#...#\n#...#\n#...#\n#.#.#\n#..#.\n.##.#")
g("R", "####.\n#...#\n#...#\n####.\n#.#..\n#..#.\n#...#")
g("S", ".####\n#....\n#....\n.###.\n....#\n....#\n####.")
g("T", "#####\n..#..\n..#..\n..#..\n..#..\n..#..\n..#..")
g("U", "#...#\n#...#\n#...#\n#...#\n#...#\n#...#\n.###.")
g("V", "#...#\n#...#\n#...#\n#...#\n#...#\n.#.#.\n..#..")
g("W", "#...#\n#...#\n#...#\n#.#.#\n#.#.#\n##.##\n#...#")
g("X", "#...#\n#...#\n.#.#.\n..#..\n.#.#.\n#...#\n#...#")
g("Y", "#...#\n#...#\n.#.#.\n..#..\n..#..\n..#..\n..#..")
g("Z", "#####\n....#\n...#.\n..#..\n.#...\n#....\n#####")
# ---------------------------------------------------------------- lowercase
g("a", "....\n....\n.##.\n...#\n.###\n#..#\n.###")
g("b", "#...\n#...\n###.\n#..#\n#..#\n#..#\n###.")
g("c", "...\n...\n.##\n#..\n#..\n#..\n.##")
g("d", "...#\n...#\n.###\n#..#\n#..#\n#..#\n.###")
g("e", "....\n....\n.##.\n#..#\n####\n#...\n.###")
g("f", ".##\n#..\n###\n#..\n#..\n#..\n#..")
g("g", "....\n....\n.###\n#..#\n#..#\n#..#\n.###\n...#\n.##.")
g("h", "#...\n#...\n###.\n#..#\n#..#\n#..#\n#..#")
g("i", "#\n.\n#\n#\n#\n#\n#")
g("j", ".#\n..\n.#\n.#\n.#\n.#\n.#\n.#\n#.")
g("k", "#...\n#...\n#..#\n#.#.\n##..\n#.#.\n#..#")
g("l", "#.\n#.\n#.\n#.\n#.\n#.\n.#")
g("m", ".....\n.....\n####.\n#.#.#\n#.#.#\n#.#.#\n#.#.#")
g("n", "....\n....\n###.\n#..#\n#..#\n#..#\n#..#")
g("o", "....\n....\n.##.\n#..#\n#..#\n#..#\n.##.")
g("p", "....\n....\n###.\n#..#\n#..#\n#..#\n###.\n#...\n#...")
g("q", "....\n....\n.###\n#..#\n#..#\n#..#\n.###\n...#\n...#")
g("r", "...\n...\n#.#\n##.\n#..\n#..\n#..")
g("s", "....\n....\n.###\n#...\n.##.\n...#\n###.")
g("t", ".#.\n.#.\n###\n.#.\n.#.\n.#.\n..#")
g("u", "....\n....\n#..#\n#..#\n#..#\n#..#\n.###")
g("v", ".....\n.....\n#...#\n#...#\n#...#\n.#.#.\n..#..")
g("w", ".....\n.....\n#...#\n#...#\n#.#.#\n#.#.#\n.#.#.")
g("x", "....\n....\n#..#\n#..#\n.##.\n#..#\n#..#")
g("y", "....\n....\n#..#\n#..#\n#..#\n#..#\n.###\n...#\n.##.")
g("z", "....\n....\n####\n...#\n.##.\n#...\n####")
# ---------------------------------------------------------------- digits (tabular, 5 wide)
g("0", ".###.\n#...#\n#..##\n#.#.#\n##..#\n#...#\n.###.")
g("1", "..#..\n.##..\n..#..\n..#..\n..#..\n..#..\n.###.")
g("2", ".###.\n#...#\n....#\n...#.\n..#..\n.#...\n#####")
g("3", ".###.\n#...#\n....#\n..##.\n....#\n#...#\n.###.")
g("4", "...#.\n..##.\n.#.#.\n#..#.\n#####\n...#.\n...#.")
g("5", "#####\n#....\n####.\n....#\n....#\n#...#\n.###.")
g("6", "..##.\n.#...\n#....\n####.\n#...#\n#...#\n.###.")
g("7", "#####\n....#\n...#.\n..#..\n.#...\n.#...\n.#...")
g("8", ".###.\n#...#\n#...#\n.###.\n#...#\n#...#\n.###.")
g("9", ".###.\n#...#\n#...#\n.####\n....#\n...#.\n.##..")
# ---------------------------------------------------------------- punctuation
g(".", ".\n.\n.\n.\n.\n.\n#")
g(",", "..\n..\n..\n..\n..\n..\n.#\n#.")
g(":", ".\n.\n#\n.\n.\n#\n.")
g(";", "..\n..\n.#\n..\n..\n.#\n#.")
g("!", "#\n#\n#\n#\n#\n.\n#")
g("?", ".###.\n#...#\n....#\n...#.\n..#..\n.....\n..#..")
g("'", "#\n#")
g('"', "#.#\n#.#")
g("-", "....\n....\n....\n####")
g("+", ".....\n..#..\n..#..\n#####\n..#..\n..#..")
g("=", "....\n....\n####\n....\n####")
g("/", "....#\n....#\n...#.\n..#..\n.#...\n#....\n#....")
g("%", "##..#\n##..#\n...#.\n..#..\n.#...\n#..##\n#..##")
g("(", ".#\n#.\n#.\n#.\n#.\n#.\n.#")
g(")", "#.\n.#\n.#\n.#\n.#\n.#\n#.")
g("<", "...#\n..#.\n.#..\n#...\n.#..\n..#.\n...#")
g(">", "#...\n.#..\n..#.\n...#\n..#.\n.#..\n#...")
g("*", ".....\n#.#.#\n.###.\n#####\n.###.\n#.#.#")
g("#", ".#.#.\n.#.#.\n#####\n.#.#.\n#####\n.#.#.\n.#.#.")
g("&", ".##..\n#..#.\n#.#..\n.#...\n#.#.#\n#..#.\n.##.#")
g("_", "....\n....\n....\n....\n....\n....\n....\n####")
g("|", "#\n#\n#\n#\n#\n#\n#\n#")
g("[", "##\n#.\n#.\n#.\n#.\n#.\n##")
g("]", "##\n.#\n.#\n.#\n.#\n.#\n##")
g("°", ".#.\n#.#\n.#.")           # degree sign
g(" ", "...")                         # space: advance only

FULL = sorted(G, key=ord)   # the host font parser binary-searches by code point
CLOCK = list("0123456789:")

# ---------------------------------------------------------------- px-n: the small text font
# Capitals only, on a 5-row cap grid (row 5 is the comma's tail), drawn at 2x: 10 px capitals,
# the size of Pebble's own Gothic 14, with the same 2 px pixel grain as px-m. Lowercase maps to
# the capitals, so strings stay mixed-case in code. Wide letters (M, W, N) get extra columns.
N_ROWS, N_CAP = 6, 5
N = {}
def n(ch, art):
    rows = [r.strip() for r in art.strip("\n").split("\n")]
    w = max(len(r) for r in rows)
    rows = [r.ljust(w, ".") for r in rows]
    while len(rows) < N_ROWS: rows.append("." * w)
    N[ch] = rows
for ch, art in {
    "A": ".#.|#.#|###|#.#|#.#", "B": "##.|#.#|##.|#.#|##.", "C": ".##|#..|#..|#..|.##",
    "D": "##.|#.#|#.#|#.#|##.", "E": "###|#..|##.|#..|###", "F": "###|#..|##.|#..|#..",
    "G": ".##|#..|#.#|#.#|.##", "H": "#.#|#.#|###|#.#|#.#", "I": "###|.#.|.#.|.#.|###",
    "J": "..#|..#|..#|#.#|.#.", "K": "#.#|#.#|##.|#.#|#.#", "L": "#..|#..|#..|#..|###",
    "M": "#...#|##.##|#.#.#|#...#|#...#", "N": "#..#|##.#|#.##|#..#|#..#", "O": ".#.|#.#|#.#|#.#|.#.",
    "P": "##.|#.#|##.|#..|#..", "Q": ".#.|#.#|#.#|##.|.##", "R": "##.|#.#|##.|#.#|#.#",
    "S": ".##|#..|.#.|..#|##.", "T": "###|.#.|.#.|.#.|.#.", "U": "#.#|#.#|#.#|#.#|###",
    "V": "#.#|#.#|#.#|#.#|.#.", "W": "#...#|#...#|#.#.#|##.##|#...#", "X": "#.#|#.#|.#.|#.#|#.#",
    "Y": "#.#|#.#|.#.|.#.|.#.", "Z": "###|..#|.#.|#..|###",
    "0": "###|#.#|#.#|#.#|###", "1": ".#.|##.|.#.|.#.|###", "2": "##.|..#|.#.|#..|###",
    "3": "##.|..#|.#.|..#|##.", "4": "#.#|#.#|###|..#|..#", "5": "###|#..|##.|..#|##.",
    "6": ".##|#..|###|#.#|###", "7": "###|..#|.#.|.#.|.#.", "8": "###|#.#|###|#.#|###",
    "9": "###|#.#|###|..#|##.",
    ".": ".|.|.|.|#", ",": "..|..|..|..|.#|#.", ":": ".|#|.|#|.", ";": "..|.#|..|.#|#.",
    "!": "#|#|#|.|#", "?": "##.|..#|.#.|...|.#.", "'": "#", '"': "#.#", "-": "...|...|###",
    "+": "...|.#.|###|.#.", "/": "..#|..#|.#.|#..|#..", "%": "#.#|..#|.#.|#..|#.#",
    "(": ".#|#.|#.|#.|.#", ")": "#.|.#|.#|.#|#.", "\u00b0": ".#.|#.#|.#.", "&": ".#.|#.#|.#.|#.#|.##",
    " ": "..",
}.items():
    n(ch, art.replace("|", "\n"))
for c in "abcdefghijklmnopqrstuvwxyz": N[c] = N[c.upper()]
NCHARS = sorted(N, key=ord)

def build(name, chars, s, label, table=None, nrows=ROWS, base_row=BASE_ROW, cap=CAP, even=False):
    """even: centred text lands on the true centre. Each glyph is cut to its ink and the one
    art-pixel gap between letters is split either side of it (xoffset s//2), instead of all
    after it, so a string's ink sits in the middle of its measured width (to half a pixel)."""
    table = G if table is None else table
    items = []
    for ch in chars:
        rows = table[ch]
        on = [(x, y) for y, r in enumerate(rows) for x, c in enumerate(r) if c == "#"]
        if even and on:
            x0 = min(x for x, _ in on)
            rows = [r[x0:max(x for x, _ in on) + 1] for r in rows]
            on = [(x - x0, y) for x, y in on]
        w = len(rows[0])
        adv = (w + 1) * s
        if not on:
            items.append((ch, None, 0, 0, adv)); continue
        y0 = min(y for _, y in on); y1 = max(y for _, y in on)
        im = Image.new("L", (w * s, (y1 - y0 + 1) * s), 0)
        for x, y in on:
            for dy in range(s):
                for dx in range(s):
                    im.putpixel((x * s + dx, (y - y0) * s + dy), 255)
        items.append((ch, im, s // 2 if even else 0, y0 * s, adv))
    # identical bitmaps share one atlas spot (px-n's lowercase letters are its capitals)
    same = {}
    for i, it in enumerate(items):
        if it[1]:
            key = (it[1].size, it[1].tobytes(), it[3])
            same.setdefault(key, i)
    alias = {i: same[(it[1].size, it[1].tobytes(), it[3])] for i, it in enumerate(items) if it[1]}
    # shelf pack, tallest first
    boxes = [(i, it[1].size) for i, it in enumerate(items) if it[1] and alias[i] == i]
    total = sum((w + 1) * (h + 1) for _, (w, h) in boxes)
    maxW = max(64, int(math.sqrt(total) * 1.3))
    x = y = rowh = W = 0; place = {}
    for i, (w, h) in sorted(boxes, key=lambda b: -b[1][1]):
        if x + w + 1 > maxW and x > 0:
            x = 0; y += rowh + 1; rowh = 0
        place[i] = (x + 1, y + 1); x += w + 1; rowh = max(rowh, h); W = max(W, x)
    H = y + rowh + 2; W += 2
    cover = Image.new("L", (W, H), 0)
    for i, p in place.items(): cover.paste(items[i][1], p)
    for i, j in alias.items(): place[i] = place[j]
    zero = Image.new("L", (W, H), 0)
    Image.merge("RGBA", (zero, zero, zero, cover)).save(os.path.join(OUT, name + ".png"))
    lh, base = (nrows + 1) * s, base_row * s
    out = bytearray(b"BMF\x03")
    def block(bt, body): out.extend(struct.pack("<BI", bt, len(body))); out.extend(body)
    block(1, struct.pack("<hBBHBBBBBBBB", cap * s, 0, 0, 100, 1, 0, 0, 0, 0, 1, 1, 0) + label.encode() + b"\0")
    block(2, struct.pack("<HHHHHBBBBB", lh, base, W, H, 1, 128, 0, 0, 0, 0))
    block(3, (name + ".png").encode() + b"\0")
    cb = bytearray()
    for i, (ch, im, xo, yo, adv) in enumerate(items):
        px, py = place.get(i, (0, 0)); w, h = im.size if im else (0, 0)
        cb += struct.pack("<IHHHHhhhBB", ord(ch), px, py, w, h, xo, yo, adv, 1, 0)
    block(4, bytes(cb))
    block(5, b"")   # empty kerning block: the host parser reads past EOF and hangs without it
    open(os.path.join(OUT, name + ".fnt"), "wb").write(out)
    print("  %-7s scale=%d glyphs=%-3d atlas=%dx%d=%-6d cap=%d base=%d lh=%d" %
          (name, s, len(chars), W, H, W * H, cap * s, base, lh))

if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    build("px-n", NCHARS, 2, "GielinorPx N", table=N, nrows=N_ROWS, base_row=N_CAP, cap=N_CAP)
    # Pebble Round 2 only (see manifest.json): the same glyphs, bigger, for its round layout
    build("px-n3", NCHARS, 3, "GielinorPx N3", table=N, nrows=N_ROWS, base_row=N_CAP, cap=N_CAP, even=True)
    build("px-c5", CLOCK, 5, "GielinorPx Clock 5", even=True)
    build("px-m", FULL, 2, "GielinorPx M")
    build("px-clk", CLOCK, 4, "GielinorPx Clock")
