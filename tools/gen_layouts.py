#!/usr/bin/env python3
"""gen_layouts.py - per-watch copies of main.js, each without the other watch's layout.

main.js holds both layouts (the Time 2's game screen and the Round 2's minimap layout) between
"// ==== layout: square begin/end ====" and "// ==== layout: round begin/end ====" markers. The
settings preview and tools/test_face.js use main.js whole; each watch's build only needs its
own layout, and every byte of bytecode is RAM on the watch (the mod is mapped into the app heap).
So the build (wscript runs this first) compiles src/embeddedjs/gen/main-emery.js and
main-gabbro.js instead (see the "platforms" section of manifest.json). The dropped block is
replaced by blank lines, so line numbers in error messages still match main.js.

Run by hand only to look at the output: python3 tools/gen_layouts.py
"""
import os, re

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
SRC = os.path.join(ROOT, "src", "embeddedjs", "main.js")
OUT = os.path.join(ROOT, "src", "embeddedjs", "gen")


def strip(src, block):
    a = "// ==== layout: %s begin ====" % block
    b = "// ==== layout: %s end ====" % block
    if src.count(a) != 1 or src.count(b) != 1:
        raise SystemExit("main.js must have exactly one '%s' and one '%s'" % (a, b))
    i, j = src.index(a), src.index(b) + len(b)
    return src[:i] + "\n" * src[i:j].count("\n") + src[j:]


def main():
    src = open(SRC, encoding="utf-8").read()
    os.makedirs(OUT, exist_ok=True)
    for platform, drop in (("emery", "round"), ("gabbro", "square")):
        text = strip(src, drop)
        path = os.path.join(OUT, "main-%s.js" % platform)
        cur = open(path, encoding="utf-8").read() if os.path.exists(path) else None
        if cur != text:                      # untouched files keep their timestamps (no rebuild)
            with open(path, "w", encoding="utf-8", newline="\n") as f:
                f.write(text)


if __name__ == "__main__":
    main()
