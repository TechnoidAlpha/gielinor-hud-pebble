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

#define W 200
#define H 228

static GContext *s_ctx;
static void fill(uint32_t hex, int x, int y, int w, int h) {
  if (w <= 0 || h <= 0) return;
  graphics_context_set_fill_color(s_ctx, GColorFromHEX(hex));
  graphics_fill_rect(s_ctx, GRect(x, y, w, h), 0, GCornerNone);
}
// main.js panel() and well()
static void panel(int x, int y, int w, int h) {
  fill(0x000000, x, y, w, h);
  fill(0xAAAA55, x + 1, y + 1, w - 2, h - 2);
  fill(0x555555, x + 2, y + 2, w - 3, h - 3);
  fill(0x555500, x + 2, y + 2, w - 4, h - 4);
}
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
// main.js icon() at scale 1 (the orb glyphs): "07" then rows, '.' = transparent
static void glyph7(const char *ic, int x, int y, uint32_t col) {
  for (int p = 0; p < 49; p++) if (ic[2 + p] != '.') fill(col, x + p % 7, y + p / 7, 1, 1);
}
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

static void draw_start(Layer *layer, GContext *ctx) {
  s_ctx = ctx;
  fill(0x000000, 0, 0, W, H);
  // clock viewport
  panel(0, 0, 134, 92);
  well(5, 5, 124, 82);
  time_t now = time(NULL);
  struct tm *t = localtime(&now);
  char buf[16];
  int hh = t->tm_hour;
  if (clock_is_24h_style()) snprintf(buf, sizeof buf, "%02d:%02d", hh, t->tm_min);
  else { hh %= 12; if (hh == 0) hh = 12; snprintf(buf, sizeof buf, "%d:%02d", hh, t->tm_min); }
  text_c(&SF_CLK, 4, buf, 0xFFFF00, 67, 14);
  snprintf(buf, sizeof buf, "%s %d %s", DOW[t->tm_wday], t->tm_mday, MON[t->tm_mon]);
  text_c(&SF_M, 2, buf, 0xFFAA00, 67, 58);
  // orbs: value plate, empty socket, glyph with its dark outline
  panel(134, 0, 66, 92);
  for (int i = 0; i < 4; i++) {
    int x = 137, y = 2 + 22 * i, cx = x + 50, cy = y + 10;
    well(x - 1, y + 1, 40, 19);
    disc(cx, cy, 10, 0x000000);
    disc(cx, cy, 9, 0x555555);
    disc(cx, cy, 8, 0x000055);
    glyph7(ORB_GLYPHS[i], cx - 4, cy - 3, 0x000000); glyph7(ORB_GLYPHS[i], cx - 2, cy - 3, 0x000000);
    glyph7(ORB_GLYPHS[i], cx - 3, cy - 4, 0x000000); glyph7(ORB_GLYPHS[i], cx - 3, cy - 2, 0x000000);
    glyph7(ORB_GLYPHS[i], cx - 3, cy - 3, 0xFFFFFF);
  }
  // weather and hiscores panels, then the chatbox and its speaker
  panel(0, 92, W, 48);
  panel(0, 140, W, 52);
  fill(0xAA5500, 0, 192, W, H - 192);
  fill(0xFFFFAA, 2, 194, W - 4, H - 196);
  text(&SF_N, "Gielinor: ", 0x0000AA, 6, 198);
}

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
  // Measured on the SDK 4.33 emulator (OS heap "Used" at app exit, of 122568):
  //   34816/40960 -> 117052  (5 KB left for PebbleOS: too tight)
  //   28672/32768 -> 102716  (~20 KB left)  <- this record
  //   28672/28672 ->  98620
  // The face draws through ONE Port and keeps its icons as single strings in the archive, so it
  // needs far less slot than the Content-tree faces. Re-check on the PT2 before raising either.
  ModdableCreationRecord cr = {
    .recordSize = sizeof(cr),
    .stack = 6144,
    .slot = 28672,
    .chunk = 32768,
#ifdef PBL_DEBUG
    .flags = kModdableCreationFlagDebug,
#endif
  };
  moddable_createMachine(&cr);
#endif

  window_destroy(w);
}
