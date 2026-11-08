#!/usr/bin/env python3
"""demo_gif.py - the README's animated demo from the emulator screenshots.

Six frames (hero, sunny, next, today, storm, night) scaled 2x with nearest-neighbour so the
pixels stay sharp, 1.8 s each, looping. Run tools/shots.sh first.

Run: python3 tools/demo_gif.py   ->  docs/demo.gif
"""
import os
from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
SHOTS = os.path.join(ROOT, "docs", "screenshots")
FRAMES = ["hero", "sunny", "next", "today", "storm", "night", "dark", "kc", "ge", "levelup", "bright"]

def main():
    frames = []
    for n in FRAMES:
        im = Image.open(os.path.join(SHOTS, n + ".png")).convert("RGB")
        frames.append(im.resize((im.width * 2, im.height * 2), Image.NEAREST))
    out = os.path.join(ROOT, "docs", "demo.gif")
    frames[0].save(out, save_all=True, append_images=frames[1:], duration=1800, loop=0, optimize=True)
    print(out)

if __name__ == "__main__":
    main()
