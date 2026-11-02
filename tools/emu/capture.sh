#!/usr/bin/env bash
# Capture the emulator's 200x228 screen to a PNG:   tools/emu/capture.sh <out.png>
#
# Two routes, both pixel-exact framebuffer grabs:
#   1. the QEMU window off the X display (xwininfo + ImageMagick import) - the WSL route;
#   2. the QEMU monitor's `screendump` - for hosts without xwininfo (Claude Code cloud
#      containers, where x11-utils is not installable). The monitor port comes from the
#      emulator state file pebble-tool writes, /tmp/pb-emulator.json.
set -uo pipefail
OUTPNG="${1:?usage: capture.sh <out.png>}"
rm -f "$OUTPNG"

if command -v xwininfo >/dev/null 2>&1; then
  W="$(xwininfo -root -tree 2>/dev/null | awk '/"QEMU"/ && /200x228/ {print $1; exit}')"
  if [ -n "$W" ]; then
    import -window "$W" "$OUTPNG" 2>/dev/null
    [ -s "$OUTPNG" ] && exit 0
  fi
fi

python3 - "$OUTPNG" <<'EOF'
import json, os, socket, subprocess, sys, time
out = sys.argv[1]
try:
    st = json.load(open("/tmp/pb-emulator.json"))
    port = [v for plat in st.values() for v in plat.values()][0]["qemu"]["monitor"]
except Exception as e:
    sys.exit("no running emulator (/tmp/pb-emulator.json): %s" % e)
ppm = out + ".ppm"
s = socket.create_connection(("127.0.0.1", port), timeout=5)
time.sleep(0.3); s.recv(65536)
s.sendall(("screendump %s\n" % ppm).encode())
for _ in range(30):                       # wait for qemu to finish writing
    time.sleep(0.1)
    if os.path.exists(ppm) and os.path.getsize(ppm) >= 200 * 228 * 3: break
s.close()
if not os.path.exists(ppm): sys.exit("screendump produced nothing")
subprocess.run(["convert", ppm, out], check=True)
os.remove(ppm)
EOF
[ -s "$OUTPNG" ]
