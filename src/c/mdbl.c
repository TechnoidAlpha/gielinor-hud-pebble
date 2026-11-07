#include <pebble.h>
#include "startframe.h"

// ---------------------------------------------------------------- start frame
// PebbleOS closes the face whenever Timeline, Health or an app opens, and starts it again on the
// way back. The JS machine takes a moment to boot, and until it paints, the window showed blank
// (white, then black). So C paints the face's still parts first: the stone frame, the orb sockets
// and glyphs, the clock, the date and the chatbox speaker. They are drawn the way main.js draws
// them, with glyphs taken from the same font atlases (tools/gen_startframe.py), so when the JS
// machine takes over (Moddable replaces this layer's update proc on its first frame) nothing that
// is already on screen moves. The orb levels, weather, hiscores and chat text then fill in.
// main.js paints the same frame until its saved data is restored (drawStill).

// The Time 2 (emery, 200x228) gets the game-screen frame; the Round 2 (gabbro, 260x260, PBL_ROUND)
// gets the minimap layout's frame. Both follow main.js drawStill pixel for pixel.
#ifdef PBL_ROUND
#define W 260
#define H 260
#else
#define W 200
#define H 228
#endif

static GContext *s_ctx;
static void fill(uint32_t hex, int x, int y, int w, int h) {
  if (w <= 0 || h <= 0) return;
  graphics_context_set_fill_color(s_ctx, GColorFromHEX(hex));
  graphics_fill_rect(s_ctx, GRect(x, y, w, h), 0, GCornerNone);
}
// main.js panel() (the Time 2 frame only) and well()
#ifndef PBL_ROUND
static void panel(int x, int y, int w, int h) {
  fill(0x000000, x, y, w, h);
  fill(0xAAAA55, x + 1, y + 1, w - 2, h - 2);
  fill(0x555555, x + 2, y + 2, w - 3, h - 3);
  fill(0x555500, x + 2, y + 2, w - 4, h - 4);
}
#endif
static void well(int x, int y, int w, int h) {
  fill(0x555555, x, y, w, h);
  fill(0x000000, x, y, w - 1, h - 1);
}
// main.js disc(): half width = floor(sqrt(r*r - dy*dy) + 0.35), in integers
static void disc(int cx, int cy, int r, uint32_t col) {
  for (int dy = -r; dy <= r; dy++) {
    int v = r * r - dy * dy, k = 0;
    while ((k + 1) * (k + 1) <= v) k++;
    if ((100 * (k + 1) - 35) * (100 * (k + 1) - 35) <= 10000 * v) k++;
    fill(col, cx - k, cy + dy, k * 2 + 1, 1);
  }
}
// main.js icon() at scale 1 (the Time 2 orb glyphs): "07" then rows, '.' = transparent
#ifndef PBL_ROUND
static void glyph7(const char *ic, int x, int y, uint32_t col) {
  for (int p = 0; p < 49; p++) if (ic[2 + p] != '.') fill(col, x + p % 7, y + p / 7, 1, 1);
}
#endif
#ifndef PBL_ROUND
// one status orb as main.js orb() draws it before any data: value plate, empty socket, glyph with
// its dark outline. flip puts the plate on the right (the round layout's right-hand orbs).
static void orb_still(int x, int y, const char *g, bool flip) {
  int cx = flip ? x + 10 : x + 50, cy = y + 10;
  well(flip ? x + 22 : x - 1, y + 1, 40, 19);
  disc(cx, cy, 10, 0x000000);
  disc(cx, cy, 9, 0x555555);
  disc(cx, cy, 8, 0x000055);
  glyph7(g, cx - 4, cy - 3, 0x000000); glyph7(g, cx - 2, cy - 3, 0x000000);
  glyph7(g, cx - 3, cy - 4, 0x000000); glyph7(g, cx - 3, cy - 2, 0x000000);
  glyph7(g, cx - 3, cy - 3, 0xFFFFFF);
}
#endif
// text from the generated atlases: width = sum of advances, as Poco measures it
static const SfGlyph *find(const SfFont *f, char c) {
  for (int i = 0; i < f->n; i++) if (f->g[i].ch == (uint8_t)c) return &f->g[i];
  return NULL;
}
static int text_w(const SfFont *f, const char *s) {
  int w = 0;
  for (; *s; s++) { const SfGlyph *g = find(f, *s); if (g) w += g->xa; }
  return w;
}
static void text(const SfFont *f, const char *s, uint32_t col, int x, int y) {
  graphics_context_set_fill_color(s_ctx, GColorFromHEX(col));
  for (; *s; s++) {
    const SfGlyph *g = find(f, *s);
    if (!g) continue;
    int stride = (g->w + 7) / 8;
    for (int row = 0; row < g->h; row++) {
      const uint8_t *line = f->bits + g->off + row * stride;
      int i = 0;
      while (i < g->w) {
        if (!(line[i >> 3] & (0x80 >> (i & 7)))) { i++; continue; }
        int j = i + 1;
        while (j < g->w && (line[j >> 3] & (0x80 >> (j & 7)))) j++;
        graphics_fill_rect(s_ctx, GRect(x + g->xo + i, y + g->yo + row, j - i, 1), 0, GCornerNone);
        i = j;
      }
    }
    x += g->xa;
  }
}
// main.js txt(..., "c"): centred, with a black shadow one art pixel (o px) down-right
static void text_c(const SfFont *f, int o, const char *s, uint32_t col, int cx, int y) {
  int x = cx - (text_w(f, s) >> 1);
  text(f, s, 0x000000, x + o, y + o);
  text(f, s, col, x, y);
}

static const char *ORB_GLYPHS[4] = {
  "07.WW.WW.WWWWWWWWWWWWWWWWWWWWW.WWWWW...WWW.....W...",   // heart
  "07...W.....WWW..WWWWWWW.WWWWW...WWW...WW.WW.W.....W",   // pray
  "07.WWW....WWW....WWW....WWWW...WWWWWWWWWWWWWWWWWWWW",   // boot
  "07..WWW...WWW...WWW....WWW....WWW.....WWW.....WWW..",   // moon
};
static const char *DOW[7] = {"Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"};
static const char *MON[12] = {"Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"};

static void clock_text(char *buf, size_t n, struct tm *t) {
  int hh = t->tm_hour;
  if (clock_is_24h_style()) snprintf(buf, n, "%02d:%02d", hh, t->tm_min);
  else { hh %= 12; if (hh == 0) hh = 12; snprintf(buf, n, "%d:%02d", hh, t->tm_min); }
}

#ifdef PBL_ROUND
// ---------------------------------------------------------------- Round 2: the minimap layout
// main.js roundStill(): the stone frame, the clock viewport with the clock and date, the minimap,
// the four bigger orbs, the chatbox band and the weather band. Constants follow main.js.
#define RC (W / 2)
#define CV_Y0 15
#define CV_Y1 85
#define CV_HW 84
#define MM_Y 132
#define MM_R 44
#define CH_Y 179
#define WX_Y 213
#define RO_R 12
#define RO_PW 46
#define RO_PH 23
// main.js chord(y, r): floor(sqrt(r^2 - (y + 0.5 - RC)^2)) = floor(isqrt(4r^2 - (2y + 1 - 2RC)^2) / 2)
static int chord_r(int y, int r) {
  int d = 2 * y + 1 - 2 * RC, v = 4 * r * r - d * d, k = 0;
  if (v <= 0) return 0;
  while ((k + 1) * (k + 1) <= v) k++;
  return k / 2;
}
// main.js roundBand(): rows y0..y1 clipped to the screen circle; edge on the first and last row,
// hi on the second when has_hi
static void round_band(int y0, int y1, uint32_t fillc, uint32_t edge, bool has_hi, uint32_t hi) {
  for (int y = y0; y <= y1; y++) {
    int h = chord_r(y, RC);
    if (h) fill(y == y0 || y == y1 ? edge : (has_hi && y == y0 + 1) ? hi : fillc, RC - h, y, 2 * h, 1);
  }
}
// main.js icon() at scale 2 for the 7x7 orb glyphs
static void glyph7x2(const char *ic, int x, int y, uint32_t col) {
  for (int p = 0; p < 49; p++) if (ic[2 + p] != '.') fill(col, x + (p % 7) * 2, y + (p / 7) * 2, 2, 2);
}
static void draw_start(Layer *layer, GContext *ctx) {
  s_ctx = ctx;
  // roundBackdrop: dark outer line, lit edge, stone, the fixed grain scatter
  fill(0x000000, 0, 0, W, H);
  disc(RC, RC, RC - 1, 0x000000);
  disc(RC, RC, RC - 2, 0xAAAA55);
  disc(RC, RC, RC - 4, 0x555500);
  for (int k = 0; k < 150; k++) {
    int x = (k * 97 + 13) % 236 + 12, y = (k * 61 + 7) % 236 + 12, dx = x - RC, dy = y - RC;
    if (dx * dx + dy * dy < (RC - 8) * (RC - 8)) fill(0x555555, x, y, 2, 1);
  }
  // roundClock: the viewport, then the clock and the date
  for (int y = CV_Y0; y <= CV_Y1; y++) {
    int h = chord_r(y, RC - 8);
    if (h > CV_HW) h = CV_HW;
    if (!h) continue;
    bool edge = y == CV_Y0 || y == CV_Y1;
    fill(edge ? 0x000000 : 0x555555, RC - h - 1, y, 2 * h + 2, 1);
    if (!edge) fill(0x000000, RC - h, y, 2 * h, 1);
  }
  time_t now = time(NULL);
  struct tm *t = localtime(&now);
  char buf[16];
  clock_text(buf, sizeof buf, t);
  text_c(&SF_C5, 5, buf, 0xFFFF00, RC, 25);
  snprintf(buf, sizeof buf, "%s %d %s", DOW[t->tm_wday], t->tm_mday, MON[t->tm_mon]);
  text_c(&SF_N3, 3, buf, 0xFFAA00, RC, 65);
  // roundMinimap
  disc(RC, MM_Y, MM_R, 0x000000); disc(RC, MM_Y, MM_R - 1, 0xAAAA55); disc(RC, MM_Y, MM_R - 2, 0x555500);
  disc(RC, MM_Y, MM_R - 7, 0x000000); disc(RC, MM_Y, MM_R - 8, 0x000000);
  // roundOrb (empty): plate, socket, 2x glyph with its outline; main.js roundOrbSpot()
  for (int i = 0; i < 4; i++) {
    bool right = i >= 2;
    int x = right ? 176 : 10, y = i % 2 ? 142 : 98;
    int cy = y + RO_PH / 2, cx = right ? x + RO_R : x + RO_PW + 3 + RO_R, px = right ? x + 2 * RO_R + 4 : x;
    well(px, y, RO_PW, RO_PH);
    disc(cx, cy, RO_R + 1, 0x000000);
    disc(cx, cy, RO_R, 0x555555);
    disc(cx, cy, RO_R - 1, 0x000055);
    int gx = cx - 7, gy = cy - 6;
    glyph7x2(ORB_GLYPHS[i], gx - 1, gy, 0x000000); glyph7x2(ORB_GLYPHS[i], gx + 1, gy, 0x000000);
    glyph7x2(ORB_GLYPHS[i], gx, gy - 1, 0x000000); glyph7x2(ORB_GLYPHS[i], gx, gy + 1, 0x000000);
    glyph7x2(ORB_GLYPHS[i], gx, gy, 0xFFFFFF);
  }
  round_band(CH_Y, WX_Y - 2, 0xFFFFAA, 0xAA5500, false, 0);
  round_band(WX_Y, H - 1, 0x555500, 0x000000, true, 0xAAAA55);
}
#else
// ---------------------------------------------------------------- Time 2: the game screen
static void draw_start(Layer *layer, GContext *ctx) {
  s_ctx = ctx;
  fill(0x000000, 0, 0, W, H);
  // clock viewport
  panel(0, 0, 134, 92);
  well(5, 5, 124, 82);
  time_t now = time(NULL);
  struct tm *t = localtime(&now);
  char buf[16];
  clock_text(buf, sizeof buf, t);
  text_c(&SF_CLK, 4, buf, 0xFFFF00, 67, 14);
  snprintf(buf, sizeof buf, "%s %d %s", DOW[t->tm_wday], t->tm_mday, MON[t->tm_mon]);
  text_c(&SF_M, 2, buf, 0xFFAA00, 67, 58);
  // orbs: value plate, empty socket, glyph with its dark outline
  panel(134, 0, 66, 92);
  for (int i = 0; i < 4; i++) orb_still(137, 2 + 22 * i, ORB_GLYPHS[i], false);
  // weather and hiscores panels, then the chatbox and its speaker
  panel(0, 92, W, 48);
  panel(0, 140, W, 52);
  fill(0xAA5500, 0, 192, W, H - 192);
  fill(0xFFFFAA, 2, 194, W - 4, H - 196);
  text(&SF_N, "Gielinor: ", 0x0000AA, 6, 198);
}
#endif

int main(void) {
  Window *w = window_create();
  window_set_background_color(w, GColorBlack);
  layer_set_update_proc(window_get_root_layer(w), draw_start);
  window_stack_push(w, false);   // a watchface has nothing to slide in over

#ifdef START_FRAME_ONLY
  // test build (tools/startframe_diff.sh): show only what C paints, for the pixel diff
  app_event_loop();
#else
  // Size the XS machine ourselves (honoured on PebbleOS >= 4.21, coredevices/PebbleOS#1621).
  // ALL of stack/slot/chunk must be non-zero or the record is rejected and the app falls back to
  // a machine too small to load.
  // Measured on the SDK 4.33 emulator, identical on emery and gabbro (OS heap "Used" at app exit):
  //   v26.11.1, 41 KB mod:    28672/32768 -> 102716
  //   v26.11.2, 48.6 KB mod:  28672/32768 -> fxMapArchive failed (no room to map the mod)
  //   v26.11.2, 42.7 KB mod (no typings, shared px-n glyphs, run-length icons, demo data built
  //   only when asked):
  //     slot 27648 -> "Slot allocation: failed" at start; 28672 starts with under 1 KB to spare
  //     30720/26624 -> 109176 with real data for both games, a kill count, a GE price and every
  //                    chatbox message  <- this record
  // Heaps + mod = 63.5 + 42.7 = 106.2 KB. ClaudeUsageRings found the real PT2 hangs at about
  // 115.7 KB and works at 113.7 KB, so this stays ~7.5 KB under the known-good point.
  // Re-check on real hardware before raising either.
  ModdableCreationRecord cr = {
    .recordSize = sizeof(cr),
    .stack = 6144,
    .slot = 30720,
    .chunk = 26624,
#ifdef PBL_DEBUG
    .flags = kModdableCreationFlagDebug,
#endif
  };
  moddable_createMachine(&cr);
#endif

  window_destroy(w);
}
