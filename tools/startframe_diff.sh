#!/usr/bin/env bash
# Proves the start frame hands over invisibly: what C paints before the JS machine starts must be
# pixel-identical to what JS paints before its saved data is restored (drawStill in main.js).
#
#   tools/startframe_diff.sh
#   PLATFORM=gabbro tools/startframe_diff.sh    # the Round 2 frame
#
# 1. builds with START_FRAME_ONLY (C paints, JS never starts) and captures it;
# 2. builds with the JS held in its pre-restore state and captures it;
# 3. compares the two over the whole screen, then captures the normal face as a sanity check.
# A minute tick between captures changes the clock, so the pair is retried until both land in the
# same minute. Sources are restored with git at the end.
set -uo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EMU="${EMU:-$REPO/tools/emu}"
C="$REPO/src/c/mdbl.c"; MAINJS="$REPO/src/embeddedjs/main.js"
OUT="$REPO/tools/emu/out"; mkdir -p "$OUT"; cd "$REPO"
for F in "$C" "$MAINJS"; do
  if ! git diff --quiet -- "$F"; then echo "REFUSING: $F has uncommitted changes; this script git-checkouts it."; exit 1; fi
done
restore() { git checkout -- "$C" "$MAINJS" 2>/dev/null; rm -f build/*.pbw; }
trap restore EXIT

build() { rm -f build/*.pbw; pebble build >/dev/null 2>&1 || { echo "build failed ($1)"; exit 1; }; }
install() { ( setsid --wait timeout 120 pebble install --emulator "${PLATFORM:-emery}" >"$OUT/install.log" 2>&1 ) || { tail -3 "$OUT/install.log"; exit 1; }; sleep 6; }

build boot   # emu.sh boot installs the current build
REPO="$REPO" "$EMU/emu.sh" boot >"$OUT/boot.log" 2>&1 || { echo "emulator boot failed:"; tail -5 "$OUT/boot.log"; exit 1; }
for try in 1 2 3; do
  git checkout -- "$C" "$MAINJS"
  sed -i '1i #define START_FRAME_ONLY' "$C"
  build c-only; install
  m1=$(date +%H%M); REPO="$REPO" "$EMU/emu.sh" shot sf-c >/dev/null
  git checkout -- "$C"
  sed -i 's/^  booted = true;$/  booted = false;   \/\/ startframe_diff: hold the pre-restore frame/' "$MAINJS"
  grep -q "startframe_diff: hold" "$MAINJS" || { echo "could not hold the JS frame"; exit 1; }
  build js-still; install
  REPO="$REPO" "$EMU/emu.sh" shot sf-js >/dev/null; m2=$(date +%H%M)
  [ "$m1" = "$m2" ] && break
  echo "minute changed between captures ($m1 -> $m2), retrying"
done
python3 - "$OUT/sf-c.png" "$OUT/sf-js.png" <<'EOF'
import sys
from PIL import Image, ImageChops
a, b = (Image.open(p).convert("RGB") for p in sys.argv[1:3])
box = ImageChops.difference(a, b).getbbox()
n = sum(1 for p in ImageChops.difference(a, b).getdata() if p != (0, 0, 0))
print("C frame vs JS still frame:", "IDENTICAL" if box is None else "DIFFER in %s (%d pixels)" % (box, n))
sys.exit(0 if box is None else 1)
EOF
rc=$?
git checkout -- "$C" "$MAINJS"; build full; install
REPO="$REPO" "$EMU/emu.sh" shot sf-full >/dev/null && echo "normal face captured: $OUT/sf-full.png"
exit $rc
