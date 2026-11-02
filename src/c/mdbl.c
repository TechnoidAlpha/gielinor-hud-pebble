#include <pebble.h>

int main(void) {
  Window *w = window_create();
  // The face draws into this window, and a new window is white. Until the JS machine paints its
  // first frame (every launch: back from the menu, or the phone restarting the face for
  // Settings) that white showed as a flash. Black matches the face's own background.
  window_set_background_color(w, GColorBlack);
  window_stack_push(w, true);

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

  window_destroy(w);
}
