# Gielinor HUD: technical notes

For people reading the source. Installing the face needs none of this: see the
[README](../README.md).

## Building

```bash
pebble build                          # Pebble SDK 4.33+, emery
pebble install --phone <phone-ip>     # developer connection enabled in the Pebble app
```

Releases are built by `.github/workflows/release.yml` when a `v*` tag is pushed. Then upload that
release's `.pbw` as a **New Release** of the
[appstore listing](https://apps.repebble.com/b23f973d0f0141e9b99f114a) in the
[developer dashboard](https://developer.repebble.com/dashboard). The appstore needs a version it
hasn't seen before, which the tag check already ensures.

- `python3 tools/genfont.py` regenerates the pixel-font atlases after a glyph edit. Then run
  `python3 tools/gen_startframe.py` so the C start frame's glyphs follow (CI checks this).
- `python3 tools/icon_sheet.py` redraws `docs/screenshots/icons.png`.
- `tools/shots.sh` re-captures the README screenshots on the emulator. It patches `DEMO`
  (watch) and `MOCK` (phone) per variant and restores them from git afterwards. Then
  `python3 tools/demo_gif.py` and `python3 tools/banner.py` rebuild the demo and banner from them,
  and `python3 tools/store_assets.py` refreshes the appstore listing files in `store/`
  (screenshots, demo GIF and banner at the store's sizes; `store/description.txt` is the listing
  text).
- `tools/startframe_diff.sh` proves the start frame hands over invisibly (below).
- `python3 tools/gen_settings.py` rebuilds the settings page after editing
  `src/settings/settings.html`, the drawing code or a font (CI checks this).
- `node tools/test_face.js` tests the face's logic (skill rotation, orbs, chatbox) without a
  watch. CI runs it.
- The emulator scripts (`tools/emu/`) run the emery emulator on a virtual X display, so they
  need Linux or WSL with `Xvfb` and ImageMagick.

## Start frame

PebbleOS closes a watchface whenever Timeline, Health or an app opens, and starts it again on
the way back. The JS machine takes a moment to boot, and the window showed blank until it
painted. So `src/c/mdbl.c` paints the face's still parts first: the stone frame, the orb
sockets and glyphs, the clock, the date and the chatbox speaker. Moddable replaces the root
layer's update proc on its first frame, which hands the screen to JS. Until its saved data is
restored, JS paints the same picture (`drawStill` in `main.js`), and then the orbs, weather,
hiscores and chat fill in.

For that hand-over to be invisible the two pictures must match exactly:

- the C glyphs come from the same atlases the watch draws with, via
  `tools/gen_startframe.py` → `src/c/startframe.h` (text width = the sum of advances, as Poco
  measures it);
- `panel`, `well`, `disc` and the orb glyphs are ports of the JS helpers (the disc's
  `floor(sqrt(r*r - dy*dy) + 0.35)` done in integers);
- the clock always follows the watch's 12/24-hour setting, the only one C can read, so there is
  no clock option in Settings;
- `tools/startframe_diff.sh` builds a C-only variant and a JS-held-before-restore variant,
  captures both on the emulator and fails unless they are pixel-identical.

## How it is drawn

The whole face is one Piu `Port`. Its `onDraw` paints the panels, orbs and icons with
`fillColor` runs and the text with `drawString`, so no per-element `Content` objects exist. A
minute tick is just `invalidate()`. Each icon is a single string (two-digit width, then the
rows concatenated) over a small palette, so the icons live in the mod archive rather than as
arrays on the slot heap.

Text gets its shadow from drawing each string twice: once in black, offset by one art pixel,
then in colour.

## Memory

Measured on the SDK 4.33 emulator as OS heap "Used" at app exit, out of 122568 bytes:

| slot / chunk | Used | Left for PebbleOS |
|--------------|------|-------------------|
| 34816 / 40960 | 117052 | ~5 KB, too tight |
| **28672 / 32768** (shipped) | 102716 | ~20 KB |

Storing the icons as arrays of row strings cost about 5 KB of bytecode, and at 34816/40960
the mod archive failed to map (`fxMapArchive failed`). Single strings fixed both. Re-check
on real hardware before raising either number.

## Settings page

The page is `src/settings/settings.html`. `tools/gen_settings.py` inlines it into
`src/pkjs/settings_page.js` together with the face's own drawing code (everything in
`main.js` between the `preview: begin` and `preview: end` markers) and the pixel fonts, and
the phone fills in the saved settings and its latest data before opening it as a `data:` page.
So the live preview at the top runs the watch's code, on a canvas, with sample health values.
It runs a minute every 1.5 seconds to show what changes each minute.

- No `<select>` anywhere: in the Pebble app's webview a native picker opened at the top of
  the screen and then jumped to the field. Choices are rows of buttons.
- Hiding a block below a control (the skill grid, say) shortens the page, and the browser
  then pulls the scroll back so everything jumps under your finger. `keepPlace` holds the page
  height while a change lands and undoes any drift.
- The encoded page is about 80 KB. That's within what the Pebble app opens; Clay, the usual
  settings library, ships pages of a similar size the same way.
- Orbs always keep their game look. The C start frame draws the default glyphs before it can
  know the settings, so a look that followed the metric would swap glyphs on every launch.

## Gotchas found building this

- The BMFont `chars` block must be **sorted by code point**: the host parser binary-searches it.
  Unsorted, roughly half the glyphs silently fail to draw.
- Open-Meteo answers HTTP 429 to shared IPs. The phone keeps the last good reading and the
  face greys it out after 3 hours rather than showing wrong weather as current.
- The face draws into the window `src/c/mdbl.c` creates, and a new Pebble window is white, so
  every relaunch flashed white until JS painted. Painting plain black instead (until the saved
  data was restored) only turned the flash black; the start frame above is the fix.
- With two games on, the game switch and the skill rotation can tick on the same clock. Each
  game's skill then moves on once per round of games (`sameTick` in `main.js`); otherwise Old
  School only ever showed the even-numbered skills.
- `DATA` for two games is about 1.25 KB in practice and 1.6 KB at worst (every RS3 skill past
  110), inside the watch's 2048-byte inbox.
- Known limit: the phone works out RuneScape 3 progress with the standard XP table, so
  Invention, which uses the elite table, shows the wrong XP to its next level.
