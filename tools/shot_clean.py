# (Copied from ClaudeUsageRings/tools/shot_clean.py; this copy takes explicit paths.)
# Normalise emulator captures to the face's nominal palette. QEMU renders the panel with an
# unlit-LCD dimming (a light-theme background reads ~#AAA, a dark-theme clock reads mid-grey),
# which is honest on a wrist but muddy in a store listing. The frames are real; only the gain is
# corrected: scale so the brightest pixel hits full white, then snap every channel to the
# 64-colour grid (0/85/170/255) the watch actually draws from.
import os, sys
from PIL import Image

def clean(src, dst):
    img = Image.open(src).convert("RGB")
    px = img.load()
    w, h = img.size
    peak = 1
    for y in range(h):
        for x in range(w):
            peak = max(peak, *px[x, y])
    gain = 255.0 / peak
    snap = lambda v: min((0, 85, 170, 255), key=lambda q: abs(q - v))
    out = Image.new("RGB", (w, h))
    po = out.load()
    for y in range(h):
        for x in range(w):
            r, g, b = px[x, y]
            po[x, y] = (snap(r * gain), snap(g * gain), snap(b * gain))
    out.save(dst)
    cols = len(out.getcolors(1 << 16) or [])
    print("%s -> %s  (peak %d, %d colours)" % (os.path.basename(src), dst, peak, cols))

if __name__ == "__main__":
    if len(sys.argv) != 3: sys.exit("usage: shot_clean.py <src.png> <dst.png>")
    clean(sys.argv[1], sys.argv[2])
