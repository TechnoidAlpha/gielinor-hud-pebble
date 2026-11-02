#!/usr/bin/env bash
# Screenshot variants of the face on the emulator for the README, the GIF and the store listing.
# Modelled on ClaudeUsageRings/tools/emu/sweep.sh: per variant, patch DEMO (watch) + MOCK (phone)
# and the hiscore mode on BOTH sides (so a CFG that loses the one-in-flight race changes nothing),
# rebuild, reboot the emulator, capture, normalise. Sources are restored with git at the end.
#
#   tools/shots.sh            # all variants
#   tools/shots.sh today      # only variants whose name contains "today"
#
# Output: tools/emu/out/<name>.png (raw) and docs/screenshots/<name>.png (normalised).
set -uo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EMU="${EMU:-$REPO/tools/emu}"                # emulator driver: tools/emu/emu.sh + capture.sh
PKJS="$REPO/src/pkjs/index.js"; MAINJS="$REPO/src/embeddedjs/main.js"
OUT="$REPO/tools/emu/out"; DOCS="$REPO/docs/screenshots"
mkdir -p "$OUT" "$DOCS"; cd "$REPO"

# HARD GATE (Rings lesson): every variant starts with `git checkout` of the patched files.
for F in "$PKJS" "$MAINJS"; do
  if ! git diff --quiet -- "$F" || ! git diff --cached --quiet -- "$F"; then
    echo "REFUSING: $F has uncommitted changes; each variant git-checkouts it. Commit first."; exit 1
  fi
done
restore() { git checkout -- "$PKJS" "$MAINJS" 2>/dev/null; rm -f "$REPO"/build/*.pbw; echo "restored sources (build/ pbw deleted - rebuild before installing)"; }
trap restore EXIT

variant() {   # name mode skill weather-json
  local name="$1" mode="$2" skill="$3" wx="$4"
  echo "== $name  (mode=$mode skill=$skill)"
  git checkout -- "$PKJS" "$MAINJS"
  sed -i 's/^const DEMO = false;/const DEMO = true;/' "$MAINJS"
  sed -i "/^const cfg = /s/hsMode: \"pick\", skill: 18/hsMode: \"$mode\", skill: $skill/" "$MAINJS"
  sed -i 's/^var MOCK = false;/var MOCK = true;/' "$PKJS"
  sed -i "s|^var MOCK_W = .*;|var MOCK_W = $wx;|" "$PKJS"
  sed -i "s/hsMode: \"pick\", skill: 18,/hsMode: \"$mode\", skill: $skill,/" "$PKJS"
  grep -q "^var MOCK = true;" "$PKJS" && grep -q "^const DEMO = true;" "$MAINJS" || { echo "  patch failed"; return 1; }
  rm -f build/*.pbw
  pebble build >/dev/null 2>&1 || { echo "  build failed"; return 1; }
  REPO="$REPO" timeout 280 "$EMU/emu.sh" boot >/dev/null 2>&1 || { echo "  boot failed"; return 1; }
  sleep 14                                      # CFG + mock DATA (one-in-flight, sequential)
  REPO="$REPO" "$EMU/emu.sh" shot "$name" >/dev/null || { echo "  capture failed"; return 1; }
  python3 "$REPO/tools/shot_clean.py" "$OUT/$name.png" "$DOCS/$name.png"
}

want() { case "$1" in *"${FILTER:-}"*) return 0;; esac; return 1; }
FILTER="${1:-}"
want hero      && variant hero      pick   18 '{ t: 12, hi: 14, lo: 7, c: "rain", p: 60, d: "Light rain", rt: "15:00" }'
want sunny     && variant sunny     pick   8  '{ t: 21, hi: 23, lo: 12, c: "sun", p: 5, d: "Clear", rt: "" }'
want next      && variant next      next   18 '{ t: 16, hi: 18, lo: 9, c: "pcloud", p: 20, d: "Partly cloudy", rt: "" }'
want today     && variant today     today  18 '{ t: -2, hi: 1, lo: -5, c: "snow", p: 80, d: "Snow", rt: "11:00" }'
want storm     && variant storm     pick   6  '{ t: 18, hi: 22, lo: 14, c: "storm", p: 90, d: "Thunderstorm", rt: "16:00" }'
want night     && variant night     pick   10 '{ t: 9, hi: 13, lo: 6, c: "moonw", p: 0, d: "Clear", rt: "" }'
echo "done: $DOCS"
