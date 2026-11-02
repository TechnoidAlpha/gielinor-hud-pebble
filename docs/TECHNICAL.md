# Gielinor HUD: technical notes

For people reading the source. Installing the face needs none of this: see the
[README](../README.md).

## Building

```bash
pebble build                          # Pebble SDK 4.33+, emery
pebble install --phone <phone-ip>     # developer connection enabled in the Pebble app
```

Releases are built by `.github/workflows/release.yml` when a `v*` tag is pushed.

- `python3 tools/genfont.py` regenerates the pixel-font atlases after a glyph edit.
- `python3 tools/icon_sheet.py` redraws `docs/screenshots/icons.png`.
- `tools/shots.sh` re-captures the README screenshots on the emulator. It patches `DEMO`
  (watch) and `MOCK` (phone) per variant and restores them from git afterwards.

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

## Gotchas found building this

- The BMFont `chars` block must be **sorted by code point**: the host parser binary-searches it.
  Unsorted, roughly half the glyphs silently fail to draw.
- Open-Meteo answers HTTP 429 to shared IPs. The phone keeps the last good reading and the
  face greys it out after 3 hours rather than showing wrong weather as current.
- The face draws into the window `src/c/mdbl.c` creates, and a new Pebble window is white. The
  face relaunches every time you come back from the menu, and when the phone opens Settings, so
  that white showed until the JS machine painted. The window is now black, and `onDraw` paints
  plain black until the saved data is restored, so the first visible frame is the full face.
- The settings page has no `<select>`. In the Pebble app's webview the native picker opened at
  the top of the screen and then jumped to the field. Choices are rows of buttons; the skill
  list opens as a grid under its button.
- With two games on, the game switch and the skill rotation can tick on the same clock. Each
  game's skill then moves on once per round of games (`sameTick` in `main.js`); otherwise Old
  School only ever showed the even-numbered skills.
- `DATA` for two games is about 1.25 KB in practice and 1.6 KB at worst (every RS3 skill past
  110), inside the watch's 2048-byte inbox.
- Known limit: the phone works out RuneScape 3 progress with the standard XP table, so
  Invention, which uses the elite table, shows the wrong XP to its next level.
