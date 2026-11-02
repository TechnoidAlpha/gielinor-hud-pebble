#!/usr/bin/env python3
"""store_assets.py - the Pebble appstore listing files, in store/, from the README screenshots.

The appstore takes up to five emery screenshots (200x228, PNG or GIF, unframed) and an optional
720x320 banner. Names start with the platform, as `pebble publish --screenshots` expects:

  emery_1_demo.gif   every panel mode, 1:1, 1.8 s a frame
  emery_2_hero.png .. emery_5_storm.png
  banner.png         copy of docs/banner.png

Run tools/shots.sh and tools/banner.py first, then: python3 tools/store_assets.py
store/description.txt is the listing text and is written by hand.
"""
import os, shutil
from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
SHOTS = os.path.join(ROOT, "docs", "screenshots")
OUT = os.path.join(ROOT, "store")
GIF = ["hero", "sunny", "next", "today", "storm", "night"]
STILLS = ["hero", "sunny", "today", "storm"]

def main():
    os.makedirs(OUT, exist_ok=True)
    frames = [Image.open(os.path.join(SHOTS, n + ".png")).convert("RGB") for n in GIF]
    assert all(f.size == (200, 228) for f in frames), "screenshots must be 200x228"
    frames[0].save(os.path.join(OUT, "emery_1_demo.gif"), save_all=True, append_images=frames[1:],
                   duration=1800, loop=0, optimize=True)
    for i, n in enumerate(STILLS, start=2):
        shutil.copyfile(os.path.join(SHOTS, n + ".png"), os.path.join(OUT, "emery_%d_%s.png" % (i, n)))
    shutil.copyfile(os.path.join(ROOT, "docs", "banner.png"), os.path.join(OUT, "banner.png"))
    for f in sorted(os.listdir(OUT)):
        print("store/" + f)

if __name__ == "__main__":
    main()
