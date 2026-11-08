#!/usr/bin/env bash
# Emery emulator driver for WSL. Runs the emulator on a VIRTUAL display by default, so it never
# appears on the Windows desktop (WSL's DISPLAY is WSLg, which puts qemu windows on the real screen).
#
#   tools/emu/emu.sh boot            # wipe, launch, install the current build, wait for the face
#   PLATFORM=gabbro tools/emu/emu.sh boot   # the Pebble Round 2 emulator instead of the Time 2
#   tools/emu/emu.sh shot <name>     # screenshot into tools/emu/out/<name>.png
#   tools/emu/emu.sh stop            # kill the emulator and the virtual display
#   tools/emu/emu.sh status
#
# VISIBLE=1 tools/emu/emu.sh boot    # show it on the desktop instead
#
# HARD RULE, learned the expensive way: ONE emulator instance at a time. Two qemu processes share
# one qemu_spi_flash.bin and corrupt it, which looks like an endless flicker at the Pebble logo and
# is NOT an app bug. `boot` always tears down first for exactly this reason.
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"   # capture.sh lives next to this script

# Shared across the Pebble projects: point REPO at the app repo, or just run from inside it.
REPO="${REPO:-$PWD}"
OUT="$REPO/tools/emu/out"
VDISP="${VDISP:-:99}"
mkdir -p "$OUT"

teardown() {
  # bracketed patterns never match the shell that launched this script (README: pkill trap)
  pkill -f "qemu-[p]ebble"     >/dev/null 2>&1
  pkill -f "pebble [i]nstall"  >/dev/null 2>&1
  pkill -f "pyp[k]js"          >/dev/null 2>&1
  sleep 1
}

start_display() {
  if [ "${VISIBLE:-0}" = "1" ]; then
    echo "display: WSLg (${DISPLAY:-unset}) - the window WILL appear on the desktop"
    return
  fi
  if ! pgrep -f "Xvfb $VDISP" >/dev/null 2>&1; then
    Xvfb "$VDISP" -screen 0 800x900x24 >/dev/null 2>&1 &
    sleep 2
  fi
  export DISPLAY="$VDISP"
  echo "display: virtual $VDISP (nothing appears on the desktop)"
}

case "${1:-status}" in
  boot)
    teardown
    start_display
    echo "wiping emulator data so a corrupt flash image can never persist across runs"
    pebble wipe >/dev/null 2>&1
    echo "installing the current build (this also launches the emulator)..."
    # setsid: qemu and pypkjs are children of `pebble install`, so without a new session they die
    # with whatever shell launched the boot. A detached session lets the emulator outlive the call,
    # which is the whole point - later installs and screenshots reuse it instead of rebooting.
    ( cd "$REPO" && setsid --wait timeout 240 pebble install --emulator "${PLATFORM:-emery}" >"$OUT/install.log" 2>&1 )
    rc=$?
    # A cold pypkjs (first start after a fresh pebble-tool install, still compiling its bytecode)
    # is not listening yet when pebble-tool connects: "[Errno 111] Connection refused". The
    # emulator itself is up by then, so one retry into it is enough.
    if [ $rc -ne 0 ] && grep -q "Connection refused" "$OUT/install.log"; then
      echo "pypkjs was not listening yet (cold start); retrying the install once"
      sleep 5
      ( cd "$REPO" && setsid --wait timeout 180 pebble install --emulator "${PLATFORM:-emery}" >"$OUT/install.log" 2>&1 )
      rc=$?
    fi
    tail -5 "$OUT/install.log" 2>/dev/null
    if [ $rc -ne 0 ]; then echo "install exited $rc (240s timeout = hung)"; exit $rc; fi
    echo "installed. giving the face a few seconds to render."
    sleep 6
    ;;
  shot)
    # Grab the 200x228 qemu window straight off the display. `pebble screenshot` talks the watch
    # protocol and times out against this firmware; the window IS the framebuffer, so this is both
    # pixel-exact and immune to a wedged protocol channel.
    name="${2:-shot}"
    start_display >/dev/null
    # window grab on WSL, QEMU-monitor screendump where xwininfo is missing (cloud containers)
    if "$HERE/capture.sh" "$OUT/$name.png"; then
      echo "$OUT/$name.png  $(identify -format '%wx%h %k colours' "$OUT/$name.png" 2>/dev/null)"
    else
      echo "capture FAILED - is the emulator booted?"; exit 1
    fi
    ;;
  stop)
    teardown
    pkill -f "Xvfb $VDISP" >/dev/null 2>&1
    echo "stopped"
    ;;
  status)
    echo "qemu:  $(pgrep -c qemu-pebble 2>/dev/null || echo 0)"
    echo "xvfb:  $(pgrep -cf "Xvfb $VDISP" 2>/dev/null || echo 0)"
    ;;
  *)
    echo "usage: emu.sh {boot|shot <name>|stop|status}"; exit 2;;
esac
