/*
 * GielinorHUD - an RPG-HUD watchface for the Pebble Time 2 (emery, 200x228, 64 colours).
 *
 * A fan face in the spirit of an old-school fantasy MMO's game screen: a stone-framed clock
 * "viewport", four status orbs down the right (HP = battery, Prayer = heart rate, Run = steps
 * toward goal, Special = sleep), a weather panel, a hiscores panel and a parchment chatbox.
 * All art and the pixel font are original (tools/genfont.py), drawn for this face.
 *
 * Rendering: the whole face is ONE Port whose onDraw paints everything with fillColor runs and
 * drawString. No per-element Content objects, so the slot heap stays small and a minute tick is
 * just port.invalidate(). Icons are palette-indexed strings (ICONS) drawn as horizontal runs.
 *
 * Watchface rules (learned on PT2, see taptest + PebbleDayProgress): minutechange only, no
 * buttons/tap/touch, phone does all networking (pkjs), 64-colour grid colours (00/55/AA/FF).
 */

import {} from "piu/MC";
import Message from "pebble/message";
import Battery from "embedded:sensor/Battery";
import Health from "pebble/health";

const VERSION = "26.11.1";
// DEMO fills every panel with sample values so emulator renders show a full board. The phone
// sends real weather + hiscores; battery/health switch to live sensors when DEMO is false.
const DEMO = false;

const W = screen.width, H = screen.height;

// ---------------------------------------------------------------- colours (64-colour grid)
const C = {
  bg: "#000000",
  stone: "#555500", stoneHi: "#AAAA55", stoneLo: "#000000", stoneMid: "#555555",
  inset: "#000000",
  parch: "#FFFFAA", parchLo: "#AA5500", ink: "#000000", inkBlue: "#0000AA",
  yellow: "#FFFF00", orange: "#FFAA00", white: "#FFFFFF", green: "#00FF00", red: "#FF0000",
  cyan: "#00FFFF", grey: "#AAAAAA", shadow: "#000000",
  xpFill: "#00AA00", xpBack: "#550000",
};

// ---------------------------------------------------------------- fonts
// [style, scale]: scale = art-pixel size, used for the drop-shadow offset.
const F = {
  n: [new Style({ font: "px-n" }), 2],   // capitals 3x5 at 2x: 10 px caps, the small text
  m: [new Style({ font: "px-m" }), 2],
  c: [new Style({ font: "px-clk" }), 4],
};

// ---------------------------------------------------------------- icons
// Palette chars -> colour. "." is transparent. Each icon is one string: a 2-digit width, then
// the rows concatenated (one string per icon keeps them in the archive, not the slot heap).
const PAL = {
  W: "#FFFFFF", K: "#000000", Y: "#FFFF00", O: "#FFAA00", R: "#FF0000", r: "#AA0000",
  G: "#AAAAAA", D: "#555555", B: "#55AAFF", b: "#0055AA", N: "#AA5500", n: "#550000",
  T: "#00AAAA", L: "#55FF55", g: "#00AA00", P: "#AA55FF", p: "#5500AA", S: "#55FFFF",
};
const ICONS = {
  // ---- orb glyphs, 7x7, white on the orb fluid
  heart: "07.WW.WW.WWWWWWWWWWWWWWWWWWWWW.WWWWW...WWW.....W...",
  pray: "07...W.....WWW..WWWWWWW.WWWWW...WWW...WW.WW.W.....W",
  boot: "07.WWW....WWW....WWW....WWWW...WWWWWWWWWWWWWWWWWWWW",
  moon: "07..WWW...WWW...WWW....WWW....WWW.....WWW.....WWW..",
  // ---- precipitation markers, drawn at 2x beside the % chance
  drop:   "03.B.BBBBBB.B.",
  flake:  "03W.W.W.W.W",
  // ---- weather, 12x12, drawn at 2x
  sun: "12....O..O.....O........O.....YYYY.......YYYYYY...O.YYYYYYYY.O..YYYYYYYY....YYYYYYYO..O.YYYYYYOO.O...YYYOOO.......OOOO.....O........O.....O..O....",
  moonw: "12................YYY........YYY........YYY.........YYY........YYYY........YYYY........YYYYY....Y...YYYYYYYY....OYYYYYYO.....OOOOOO...............",
  cloud: "12............................WWW........WWWWW......WWWWWWWW...WWWWWWWWWW.WWWWWWWWWWWWWWWWWWWWWWWWGWWWWWWWWWWG.GGGGGGGGGG.........................",
  pcloud: "12......Y..Y.........YYY........YYYYY.....WWWYYYYY...WWWWWYYY...WWWWWWWW...WWWWWWWWWW.WWWWWWWWWWWWWWWWWWWWWWWWGWWWWWWWWWWG.GGGGGGGGGG.............",
  rain: "12....GGG........GGGGG......GGGGGGGG...GGGGGGGGGG.GGGGGGGGGGGGDGGGGGGGGGGD.DDDDDDDDDD..............B...B...B..B...B...B......B...B...B..B...B...B.",
  snow: "12....GGG........GGGGG......GGGGGGGG...GGGGGGGGGG.GGGGGGGGGGGGDGGGGGGGGGGD.DDDDDDDDDD..............W...W...W..WWW.WWW.WWW..W...W...W..............",
  storm: "12....DDD........DDDDD......DDDDDDDD...DDDDDDDDDD.DDDDDDDDDDDDKDDDDDDDDDDK.KKKKYYKKKK......YY.........YYYY..........Y..........Y..........Y.......",
  fog: "12........................GGGGGGGGG.................GGGGGGGGGG............GGGGGGGGGG.................GGGGGGGGG............GGGGGGGGG...............",
  // ---- skills, 10x10, drawn at 2x. Original symbols, one per hiscores skill (SKILLS order).
  total: "10Y.YYYYYY.YYYYYYYYYYY.YYYYYYYY...YYYYYY.....YYYY.......OO........OO.......OOOO.....NNNNNN............",
  attack: "10........WW.......WGW......WGW......WGW..O...WGW....O.WGW......OWW.......NO.......N..O.....N.........",
  defence: "10.OOOOOOOO.OGGGGGGGGOOGBBBBBBGOOGBBBBBBGOOGBBBBBBGO.OGBBBBGO..OGBBBBGO...OGBBGO.....OGGO.......OO....",
  strength: "10...........DD....DD.DGGD..DGGDDGGD..DGGDDGGGGGGGGDDGGD..DGGDDGGD..DGGD.DD....DD.....................",
  hitpoints: "10.RR...RR..RWRR.RRRR.RRRRRRRRR.RRRRRRRRR..RRRRRRR....RRRRR......RRR........R.........................",
  ranged: "10....NNG.....NN..G....N....G...N.....G...OOGGGGGGGWN.....G....N....G.....NN..G.......NNG.............",
  prayer: "10....S........SWS.......SWS....SSSWWWSSS..SWWWWWS....SWWWS....SWS.SWS..SS.....SS.....................",
  magic: "10....bb.......bbb.......bYb......bbbbb.....bbbYbb...bbbbbbb...bbYbbbbb.bbbbbbbbbbBBBBBBBBBB..........",
  cooking: "10..W..W.......W..W.....W..W..............DGGGGGGGGD.GGGGGGGG..GDDDDDDG..GDDDDDDG...GGGGGG............",
  woodcutting: "10...gLLg.....gLLLLg...gLLgLLLg.gLLLLLLgLg.gLLLLLLg...gggggg......NN........NN.......NNNN.............",
  fletching: "10......GGG........GG.......N.G......N........N........N......RRN.......RRR........RR.................",
  fishing: "10.............BBBB....BBBBBBB.BBKBBBBBBBBBBBBBBBBBB.BBBBBBB.B...BBBB.................................",
  firemaking: "10....R........RR........ROR......ROOR.R....ROOORR...ROOYOOR...ROYYYOR...ROYYYOR....ROOOR.....NNNNN...",
  crafting: "10............SSSSSS...SWSSSSWS.SSSSSSSSSS.BSSSSSSB...BSSSSB.....BSSB.......BB........................",
  smithing: "10....................DGGGGGGGG..DGGGGGGGG..DDGGGG......GG........GG.......GGGG.....DDDDDD............",
  mining: "10..GGGGG....G.....GG.G....N..G......N........N.........N........N.........N........N........N........",
  herblore: "10......LL.......LLLL.....LgLLL....LLgLL....LLgLLL...LLgLLL.....gLL......g........g...................",
  agility: "10.....WW........WW......WWW......W.WWW.W.....W..W.....WWW......W...W....W.....W..W...................",
  thieving: "10....................PPPPPPPPPPPKKPPPPKKPPKKPPPPKKP.PPPPPPPP...PP..PP................................",
  slayer: "10..WWWWWW...WWWWWWWW.WWWWWWWWWWWKKWWWWKKWWKKWWWWKKWWWWWKKWWWW.WWWWWWWW...WKWKWK....WWWWWW............",
  farming: "10...L..L.....LLL.LL....LLLLLL......LL........g.........g........ggg....NNNNNNNNNN.nnnnnnnn...........",
  runecraft: "10...GGGG....GGDDDDGG..GDDYDDDG.GDDYYYDDDGGDDDYDDDDGGDDDYDDDDG.GDDYDDDG..GGDDDDGG....GGGG.............",
  hunter: "10..NN..NN....NN..NN..N........NNN.NNNN.NN..NNNNNN...NNNNNNNN..NNNNNNNN...NN..NN......................",
  construction: "10..DDDDD....DGGGGGD...DGGGGGDDD..DDNDD.......N.........N.........N.........N........NNN..............",
  // RuneScape 3's extra skills
  summoning: "10....NN.......NnnN.......NN......NNNNNN...NNNNNNNN.NNNSSSSNNNNNSSWWSSNNNNNSSSSNNN.NNNNNNNN...NNNNNN..",
  dungeoneering: "10..GGGGGG...GNNNNNNG..GNNNNNNG..GNNNNNNG..GNNNNYNG..GNNNNNNG..GNNNNNNG..GNNNNNNG..GNNNNNNG.GGGGGGGGGG",
  divination: "10....Y........YSY......YSWSY......YSY........S........S..........S..........S........S...............",
  invention: "10...YYYY.....YWWYYY...YWYYYYYY..YYYYYYYY..YYYYYYYY...YYYYYY.....YYYY......GGGG......DDDD.......GG....",
  archaeology: "10......GG.......GWGG.....GWGGG....GGGGG....NGGGG....NN.......NN........N.............................",
  necromancy: "10...PPPP.....PWWWWP...PWWWWWWP..PWKWWKWP..PWKWWKWP..PWWWWWWP...PWKKWP.....PWWP.....P.PP.P............",
  sailing: "10....GG.......G..G.......GG......GGGGGG......GG........GG....G...GG...GGG..GG..GG.GGGGGGGG....GGGG...",
};
const SKILLS = ["Attack", "Defence", "Strength", "Hitpoints", "Ranged", "Prayer", "Magic", "Cooking",
  "Woodcutting", "Fletching", "Fishing", "Firemaking", "Crafting", "Smithing", "Mining", "Herblore",
  "Agility", "Thieving", "Slayer", "Farming", "Runecraft", "Hunter", "Construction", "Sailing"];
// RuneScape 3 (a hiscores block with gm === "rs3"): same order through Construction, two renamed, six extra.
const RS3_TAIL = ["Summoning", "Dungeoneering", "Divination", "Invention", "Archaeology", "Necromancy"];
function skName(s, i) {
  if (s.gm !== "rs3") return SKILLS[i] || "";
  return i === 3 ? "Constitution" : i === 20 ? "Runecrafting" : i >= 23 ? RS3_TAIL[i - 23] : SKILLS[i];
}
function skIcon(s, i) {
  const nm = skName(s, i).toLowerCase();
  return nm === "constitution" ? "hitpoints" : nm === "runecrafting" ? "runecraft" : nm;
}

// Draw an icon at (x, y) with integer scale s. Runs of one colour become one fillColor.
// tint, when given, paints every opaque pixel that one colour (used for the glyph outlines).
function icon(port, name, x, y, s, tint) {
  const ic = ICONS[name]; if (!ic) return;
  const w = parseInt(ic.slice(0, 2), 10), n = ic.length;
  for (let p = 2; p < n; p += w) {
    const yy = y + ((p - 2) / w) * s;
    let i = 0;
    while (i < w) {
      const ch = ic[p + i];
      if (ch === ".") { i++; continue; }
      let j = i + 1; while (j < w && ic[p + j] === ch) j++;
      port.fillColor(tint || PAL[ch], x + i * s, yy, (j - i) * s, s);
      i = j;
    }
  }
}

// ---------------------------------------------------------------- text
function tw(port, s, f) { return port.measureString(s, F[f][0]).width; }
// Shadowed text, OSRS-style: black one art-pixel down-right, then the colour on top.
// align: "l" (x = left), "c" (x = centre), "r" (x = right edge).
function txt(port, s, f, col, x, y, align) {
  const st = F[f][0], o = F[f][1];
  if (align === "c") x -= tw(port, s, f) >> 1;
  else if (align === "r") x -= tw(port, s, f);
  port.drawString(s, st, C.shadow, x + o, y + o);
  port.drawString(s, st, col, x, y);
}
function txtFlat(port, s, f, col, x, y, align) {
  if (align === "c") x -= tw(port, s, f) >> 1;
  else if (align === "r") x -= tw(port, s, f);
  port.drawString(s, F[f][0], col, x, y);
}

// ---------------------------------------------------------------- frames
// Bevelled stone panel: black outline, light top-left edge, dark bottom-right edge, stone fill.
function panel(port, x, y, w, h) {
  port.fillColor(C.stoneLo, x, y, w, h);
  port.fillColor(C.stoneHi, x + 1, y + 1, w - 2, h - 2);
  port.fillColor(C.stoneMid, x + 2, y + 2, w - 3, h - 3);
  port.fillColor(C.stone, x + 2, y + 2, w - 4, h - 4);
}
// Recessed dark well inside a panel (where values sit).
function well(port, x, y, w, h) {
  port.fillColor(C.stoneMid, x, y, w, h);
  port.fillColor(C.inset, x, y, w - 1, h - 1);
}

// ---------------------------------------------------------------- orbs
// Filled circle as horizontal spans; clipped to rows >= clipY when clipY is given.
function disc(port, cx, cy, r, col, clipY) {
  for (let dy = -r; dy <= r; dy++) {
    const yy = cy + dy;
    if (clipY !== undefined && yy < clipY) continue;
    const hw = Math.floor(Math.sqrt(r * r - dy * dy) + 0.35);
    port.fillColor(col, cx - hw, yy, hw * 2 + 1, 1);
  }
}
// One status orb: value plate on the left, socket with fluid level + glyph on the right.
function orb(port, x, y, frac, fluid, fluidLo, glyph, label, labelCol) {
  const r = 9, cx = x + 50, cy = y + 10;
  // value plate
  // plate y+1..y+19 is centred on the orb (cy = y+10); the 14 px digits plus their 2 px shadow
  // sit inside it, and it is wide enough for "100"
  well(port, x - 1, y + 1, 40, 19);                 // 40 wide: fits "5.1k" and "100"
  // right edge x+37: measured widths include each glyph's 2 px trailing gap, so ink ends at x+35
  if (label.length > 1 && label[label.length - 1] === "k") {   // "5.1k": number + a small K suffix
    txt(port, "k", "n", labelCol, x + 37, y + 7, "r");
    txt(port, label.slice(0, -1), "m", labelCol, x + 37 - tw(port, "k", "n"), y + 3, "r");
  } else txt(port, label, "m", labelCol, x + 37, y + 3, "r");
  // socket
  disc(port, cx, cy, r + 1, C.stoneLo);
  disc(port, cx, cy, r, C.stoneMid);
  disc(port, cx, cy, r - 1, "#000055");
  const f = frac < 0 ? 0 : frac > 1 ? 1 : frac;
  if (f > 0) {
    const top = cy + (r - 1) - Math.round(f * (2 * (r - 1) + 1)) + 1;
    disc(port, cx, cy, r - 1, fluidLo, top);
    disc(port, cx - 1, cy - 1, r - 3, fluid, top);   // lighter core = a little depth
  }
  // dark outline (four offsets) so the white glyph reads over any fluid colour
  icon(port, glyph, cx - 4, cy - 3, 1, "#000000"); icon(port, glyph, cx - 2, cy - 3, 1, "#000000");
  icon(port, glyph, cx - 3, cy - 4, 1, "#000000"); icon(port, glyph, cx - 3, cy - 2, 1, "#000000");
  icon(port, glyph, cx - 3, cy - 3, 1);
}
// OSRS-ish value colours: green when healthy, through yellow and orange, to red.
// Run orb number = today's step count (the fluid shows progress to the goal): 830, 5.1k, 12k
function stepsLabel(n) {
  if (n < 1000) return "" + n;
  if (n < 10000) return (Math.floor(n / 100) / 10) + "k";
  return Math.floor(n / 1000) + "k";
}
function levelCol(f) { return f >= 0.75 ? C.green : f >= 0.5 ? C.yellow : f >= 0.25 ? C.orange : C.red; }

// ---------------------------------------------------------------- data
// skill = the Old School pick, skill3 = the RuneScape 3 pick; swap = how two games share the panel
const cfg = { stepGoal: 8000, sleepGoal: 8, units: "C", hsMode: "pick", skill: 18, skill3: 18, swap: "min", rotMin: 5, chat: true };
// DEMO_DATA seeds the panels for emulator renders; real phone DATA replaces it as it arrives.
const DEMO_DATA = {
  v: 2, at: 0,
  w: { t: 12, hi: 14, lo: 7, c: "rain", p: 40, d: "Light rain", rt: "15:00" },
  hs: [{ gm: "osrs", n: "Zezima", tot: 1873,
       l: [92, 88, 95, 93, 90, 77, 94, 85, 81, 82, 86, 80, 74, 70, 77, 72, 71, 75, 87, 79, 66, 78, 70, 41],
       g: [0, 0, 0, 12500, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 41200, 0, 0, 0, 0, 0] }],
};
// sample progress: % through each level (f) and xp left (r), as the phone would send them
DEMO_DATA.hs[0].f = DEMO_DATA.hs[0].l.map((lv, k) => (k * 37 + 11) % 97);
DEMO_DATA.hs[0].r = DEMO_DATA.hs[0].l.map((lv, k) => Math.round((100 - DEMO_DATA.hs[0].f[k]) * lv * lv * 7));
let data = DEMO ? DEMO_DATA : { v: 2, at: 0, hs: [] };   // v2: hs = one hiscores block per game

let battery = null;
try { battery = new Battery({}); } catch (e) { battery = null; }
function batt() {
  if (DEMO) return { pct: 87, chg: false };
  try { const s = battery.sample(); return { pct: Math.round(s.percent), chg: !!s.charging }; } catch (e) { return null; }
}
// Health needs Pebble Health switched on in the phone app and this face allowed to read it.
// `lock` explains a missing reading on the watch instead of showing a silent 0:
// "off" = Health unavailable, "perm" = no permission; `acc` is the raw access mask (for logs).
function health() {
  if (DEMO) return { steps: 5120, hr: 72, sleep: 7 * 3600 + 25 * 60, lock: "", acc: 15 };
  const h = { steps: 0, hr: 0, sleep: 0, lock: "", acc: -1 };
  const t = Date.now();
  try {
    h.acc = Health.metric.accessible({ metric: "step count", start: t - 3600000, end: t });
    if (!(h.acc & Health.access.available)) h.lock = "off";
    else if (!(h.acc & Health.access.permission)) h.lock = "perm";
  } catch (e) { h.lock = "off"; }
  try { h.steps = Health.metric.query({ metric: "step count" }); } catch (e) {}
  try { h.hr = Health.metric.get("heart rate"); } catch (e) {}
  // sleep over the last 24 hours, so last night still counts after midnight and through the day
  try { h.sleep = Health.metric.query({ metric: "sleep seconds", start: t - 86400000, end: t }); } catch (e) {}
  return h;
}

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pad = (n) => (n < 10 ? "0" + n : "" + n);
// Always the watch's own 12/24-hour setting: the C start frame can only read that one, and the
// two must agree or the clock would change format as the face starts.
function hour12() { try { return !!watch.hour12; } catch (e) { return false; } }
function kfmt(n) {                                     // 4012345 -> 4.01M, 412000 -> 412k
  if (n >= 1e7) return Math.floor(n / 1e6) + "M";
  if (n >= 1e6) return (Math.floor(n / 1e4) / 100) + "M";
  if (n >= 1e4) return Math.floor(n / 1e3) + "k";
  return "" + n;
}
let btOk = true; try { btOk = !!watch.connected.app; } catch (e) {}

// ---------------------------------------------------------------- the face
function drawClock(port, d) {
  panel(port, 0, 0, 134, 92);
  well(port, 5, 5, 124, 82);
  let hh = d.getHours();
  if (hour12()) { hh = hh % 12; if (hh === 0) hh = 12; }
  const clock = (hour12() ? "" + hh : pad(hh)) + ":" + pad(d.getMinutes());
  txt(port, clock, "c", C.yellow, 67, 14, "c");
  txt(port, DOW[d.getDay()] + " " + d.getDate() + " " + MON[d.getMonth()], "m", C.orange, 67, 58, "c");
}
const ORB_GLYPHS = ["heart", "pray", "boot", "moon"];
// The still parts of the face, exactly as the C start frame paints them (src/c/mdbl.c): shown
// until the saved data is restored, so the hand-over from C changes nothing on screen.
function drawStill(port) {
  port.fillColor(C.bg, 0, 0, W, H);
  drawClock(port, new Date());
  panel(port, 134, 0, 66, 92);
  for (let i = 0; i < 4; i++) orb(port, 137, 2 + 22 * i, 0, C.grey, C.grey, ORB_GLYPHS[i], "", C.grey);
  panel(port, 0, 92, W, 48);
  panel(port, 0, 140, W, 52);
  port.fillColor(C.parchLo, 0, 192, W, H - 192);
  port.fillColor(C.parch, 2, 194, W - 4, H - 196);
  txtFlat(port, "Gielinor: ", "n", C.inkBlue, 6, 198, "l");
}

function drawFace(port) {
  port.fillColor(C.bg, 0, 0, W, H);

  // ---- clock viewport (left) ----
  const d = new Date();
  drawClock(port, d);

  // ---- orbs (right) ----
  panel(port, 134, 0, 66, 92);
  const b = batt(), h = health();
  const ox = 137;
  if (b) orb(port, ox, 2, b.pct / 100, "#FF5555", "#AA0000", "heart", "" + b.pct, b.chg ? C.cyan : levelCol(b.pct / 100));
  else orb(port, ox, 2, 0, "#FF5555", "#AA0000", "heart", "--", C.grey);
  const hrF = h.hr ? Math.min(1, h.hr / 180) : 0;
  orb(port, ox, 24, hrF, "#55FFFF", "#00AAAA", "pray", h.hr ? "" + h.hr : "--", C.cyan);
  const stF = h.steps / cfg.stepGoal;
  orb(port, ox, 46, h.lock ? 0 : stF, "#FFFF55", "#AAAA00", "boot", h.lock ? "--" : stepsLabel(h.steps), h.lock ? C.grey : levelCol(stF));
  const slH = h.sleep / 3600, slF = slH / cfg.sleepGoal;
  orb(port, ox, 68, h.lock ? 0 : slF, "#55FFAA", "#00AA55", "moon", (h.lock || !slH) ? "--" : (Math.floor(slH) + "h"), h.lock ? C.grey : levelCol(slF));

  // ---- weather ----
  panel(port, 0, 92, W, 48);
  const w = data.w;
  if (w) {
    well(port, 5, 97, 30, 38);
    icon(port, w.c || "cloud", 8, 104, 2);
    // older than 3 hours (phone offline, API refusing): grey it out and say how old
    const age = w.at ? Date.now() / 1000 - w.at : 0, stale = age > 3 * 3600;
    txt(port, w.t + "°", "m", stale ? C.grey : C.yellow, 42, 99, "l");
    txt(port, "H" + w.hi + " L" + w.lo, "m", stale ? C.grey : C.orange, W - 7, 99, "r");
    // row 2: conditions on the left, chance of rain/snow on the right behind a drop/flake marker
    const pS = w.p + "%", px0 = W - 7 - tw(port, pS, "n");
    txt(port, pS, "n", stale ? C.grey : C.cyan, W - 7, 121, "r");
    icon(port, w.c === "snow" ? "flake" : "drop", px0 - 10, w.c === "snow" ? 122 : 121, 2, stale ? C.grey : undefined);
    const desc = stale ? Math.floor(age / 3600) + "h old" : (w.d || "");
    if (42 + tw(port, desc, "n") <= px0 - 14) txt(port, desc, "n", stale ? C.grey : C.white, 42, 121, "l");
  } else {
    txt(port, "Fetching weather...", "n", C.grey, W >> 1, 111, "c");
  }

  // ---- hiscores ----
  panel(port, 0, 140, W, 52);
  const hs = hiscoreView(d);
  if (hs.msg) {
    txt(port, hs.msg, "n", C.grey, W >> 1, 160, "c");
  } else {
    well(port, 5, 145, 28, 28);
    icon(port, hs.icon, 9, 149, 2);
    txt(port, hs.title, "m", C.yellow, 40, 146, "l");
    // total level as trophy + number, only when it clears the title (long skill names win)
    if (hs.right) {
      const rw = tw(port, hs.right, "n");
      if (40 + tw(port, hs.title, "m") + 8 + 12 + rw <= W - 7) {
        icon(port, "total", W - 7 - rw - 12, 148, 1);
        txt(port, hs.right, "n", C.white, W - 7, 148, "r");
      }
    }
    // XP bar toward the next level (gold when maxed)
    const bx = 40, by = 164, bw = W - 47, bh = 6, fw = Math.round(bw * hs.frac);
    port.fillColor(C.stoneLo, bx - 1, by - 1, bw + 2, bh + 2);
    port.fillColor(C.xpBack, bx, by, bw, bh);
    port.fillColor(hs.max ? "#AAAA00" : C.xpFill, bx, by, fw, bh);
    port.fillColor(hs.max ? C.yellow : "#55FF55", bx, by, fw, 1);
    txt(port, hs.sub, "n", C.white, bx, 175, "l");
    if (bx + tw(port, hs.sub, "n") + 10 + tw(port, hs.name, "n") <= W - 7) txt(port, hs.name, "n", C.cyan, W - 7, 175, "r");
  }

  // ---- chatbox ----
  port.fillColor(C.parchLo, 0, 192, W, H - 192);
  port.fillColor(C.parch, 2, 194, W - 4, H - 196);
  const who = "Gielinor: ", whoW = tw(port, who, "n");
  const lines = wrap(port, chatMessage(d, b, h, hs), W - 12, whoW);
  txtFlat(port, who, "n", C.inkBlue, 6, 198, "l");
  if (lines[0]) txtFlat(port, lines[0], "n", C.ink, 6 + whoW, 198, "l");
  if (lines[1]) txtFlat(port, lines[1], "n", C.ink, 6, 212, "l");
}

// What the hiscores panel shows, per mode: title / right / sub / bar fraction / icon, or a msg.
// The phone sends finished numbers per skill: l = level, r = xp to next level (0 = maxed),
// f = % through the level, g = xp gained today.
// Which game's block the panel shows now. With both games on: alternate every minute ("min"), at
// the rotate speed ("rot"), or keep Old School in the panel and put RS3 in the chatbox ("chat").
function rotSlot(d) { return Math.floor((d.getHours() * 60 + d.getMinutes()) / Math.max(1, cfg.rotMin)); }
// true when the game switch ticks on the same clock as the skill rotation
function sameTick(n) { return n > 1 && (cfg.swap === "rot" || (cfg.swap === "min" && cfg.rotMin <= 1)); }
function blockIndex(d, n) {
  if (n < 2 || cfg.swap === "chat") return 0;
  return cfg.swap === "rot" ? rotSlot(d) % n : d.getMinutes() % n;
}
function hiscoreView(d) {
  const bl = data.hs || [];
  if (!bl.length) return { msg: "Set name in Settings" };
  const s = bl[blockIndex(d, bl.length)];
  const v = blockView(d, s, sameTick(bl.length) ? bl.length : 1);
  const tag = s && s.gm === "rs3" ? "RS3" : "OSRS";
  if (bl.length > 1) { if (v.msg) v.msg = tag + ": " + v.msg; else v.name = tag; }   // tag which game this is
  return v;
}
// share = how many games take turns on the rotation clock. Each game's skill moves on once per
// full round of games; otherwise with two games Old School only ever showed the even skills.
function blockView(d, s, share) {
  if (!s) return { msg: "Set name in Settings" };
  if (s.err) return { msg: s.n + ": " + s.err };
  if (!s.l || !s.r) return { msg: "Hiscores loading..." };
  const n = s.l.length;
  let i = s.gm === "rs3" ? cfg.skill3 : cfg.skill;
  if (cfg.hsMode === "rotate") i = Math.floor(rotSlot(d) / (share || 1)) % n;
  else if (cfg.hsMode === "next") {                 // furthest through its level, not maxed
    let best = -1; i = 0;
    for (let k = 0; k < n; k++) if (s.r[k] > 0 && s.f[k] > best) { best = s.f[k]; i = k; }
  }
  if (cfg.hsMode === "today") {
    let tot = 0, top = -1, topG = 0;
    const g = s.g || [];
    for (let k = 0; k < g.length; k++) { tot += g[k]; if (g[k] > topG) { topG = g[k]; top = k; } }
    if (top < 0) return { icon: "total", title: "No xp yet today", right: "" + s.tot, sub: "Go train something!", name: s.n, frac: 0, gm: s.gm };
    return { icon: skIcon(s, top), title: "+" + kfmt(tot) + " xp today", right: "",
      sub: skName(s, top) + " +" + kfmt(topG), name: s.n, frac: s.f[top] / 100, max: s.r[top] === 0, gm: s.gm };
  }
  if (i < 0 || i >= n) i = 0;
  const lv = s.l[i], max = s.r[i] === 0;
  return { icon: skIcon(s, i), title: skName(s, i) + " " + lv, right: "" + s.tot,
    sub: max ? "Maxed!" : kfmt(s.r[i]) + " xp to " + (lv + 1),
    name: s.n, frac: max ? 1 : s.f[i] / 100, max: max, skill: i, rem: s.r[i], gm: s.gm, blk: s };
}

// Chatbox: the most urgent message wins; otherwise rotate useful ones each minute.
function chatMessage(d, b, h, hs) {
  if (!btOk) return "Phone link lost. Data will wait.";
  if (b && !b.chg && b.pct <= 15) return "Low hitpoints! Charge your watch.";
  if (h.lock === "off") return "Turn on Pebble Health in the Pebble app.";
  if (h.lock === "perm") return "Allow Health for this face in the Pebble app.";
  if (!cfg.chat) return DAYS[d.getDay()] + ", " + d.getDate() + " " + MON[d.getMonth()] + " " + d.getFullYear() + ".";
  const msgs = [];
  if (data.w && data.w.rt) msgs.push((data.w.c === "snow" ? "Snow" : "Rain") + " likely around " + data.w.rt + ".");
  if (h.steps >= cfg.stepGoal) msgs.push("Step goal reached. Nice work!");
  else if (h.steps) msgs.push(h.steps + " steps today, " + (cfg.stepGoal - h.steps) + " to go.");
  const bl = data.hs || [];
  if (cfg.swap === "chat" && bl.length > 1) {          // RS3 lives in the chatbox in this mode
    const r = blockView(d, bl[1]);
    return r.msg ? "RS3: " + r.msg : "RS3 " + r.title + ". " + r.sub + ".";
  }
  if (hs && hs.rem) msgs.push(kfmt(hs.rem) + " xp to " + skName(hs.blk, hs.skill) + " " + (hs.blk.l[hs.skill] + 1) + ".");
  if (b && b.chg) msgs.push("Hitpoints regenerating (charging).");
  msgs.push("Welcome to Gielinor.");
  return msgs[d.getMinutes() % msgs.length];
}

// Word-wrap into two lines; the first line is shorter by `indent` (the speaker's name).
function wrap(port, s, maxW, indent) {
  const words = s.split(" "), out = ["", ""];
  let li = 0;
  for (let k = 0; k < words.length; k++) {
    const tryS = out[li] ? out[li] + " " + words[k] : words[k];
    if (tw(port, tryS, "n") <= maxW - (li === 0 ? indent : 0)) out[li] = tryS;
    else if (li === 0) { li = 1; out[1] = words[k]; }
    else { out[1] += "..."; break; }
  }
  return out;
}

// false until the saved settings + data are restored. Before that the face shows only its still
// parts (the C start frame's picture), not placeholders like "Fetching weather..." or a blank.
let booted = false;
class FaceBehavior extends Behavior {
  onDraw(port) {
    try { if (booted) drawFace(port); else drawStill(port); } catch (e) { console.log("draw err " + e); }
  }
}

const app = new Application(null, { skin: new Skin({ fill: C.bg }) });
const face = new Port(null, { left: 0, right: 0, top: 0, bottom: 0, Behavior: FaceBehavior });
app.add(face);
function redraw() { face.invalidate(); }

// ---------------------------------------------------------------- phone link
let lastData = "", lastCfg = "", wantAsk = true, lastRx = Date.now(), lastPoke = 0;
// Android Doze can freeze the phone's timers; when DATA is overdue the watch pokes (RDY 2) over
// the same channel, which revives pkjs (ClaudeUsageRings' watch-driven backup poll).
function maybePoke() {
  const t = Date.now();
  if (!btOk || t - lastRx < 45 * 60000 || t - lastPoke < 5 * 60000) return;
  lastPoke = t;
  try { const m = new Map(); m.set("RDY", 2); message.write(m); } catch (e) { console.log("poke fail " + e); }
}
const message = new Message({
  keys: ["DATA", "CFG", "RDY"], input: 2048, output: 32,   // two games' hiscores + weather can pass 1 KB
  onReadable() {
    const map = this.read();
    let touched = false;
    const cf = map.get("CFG");
    if (cf && cf !== lastCfg) {
      lastCfg = cf; touched = true;
      try { const k = JSON.parse(cf); for (const key in cfg) if (key in k) cfg[key] = k[key]; } catch (e) { console.log("cfg err " + e); }
      try { localStorage.setItem("c", cf); } catch (e) {}
    }
    const dd = map.get("DATA");
    if (dd) {
      touched = true; lastRx = Date.now();
      try {
        const j = JSON.parse(dd);
        if (j && j.v === 2) {
          if (DEMO) { if (!j.w) j.w = DEMO_DATA.w; if (!j.hs || !j.hs.length) j.hs = DEMO_DATA.hs; }   // keep sample panels in renders
          data = j;
        }
      } catch (e) { console.log("data err " + e); }
      if (dd !== lastData) { lastData = dd; try { localStorage.setItem("d", dd); } catch (e) {} }
    }
    if (touched) redraw();
  },
  // Guarded handshake write: a throw escaping onWritable is fatal (sad-watch), see ClaudeUsageRings.
  onWritable() {
    if (!wantAsk) return; wantAsk = false;
    const m = new Map(); m.set("RDY", 1);
    try { this.write(m); } catch (e) { wantAsk = true; console.log("rdy fail " + e); }
  },
});

// Restore + listeners run off the module-init stack (ClaudeUsageRings v032/v039 lessons): the first
// localStorage access opens flash and overflows the boot stack, and registering minutechange at
// module scope paints un-restored defaults first.
setTimeout(() => {
  watch.addEventListener("minutechange", () => { maybePoke(); redraw(); });
  watch.addEventListener("connected", () => { let ok = btOk; try { ok = !!watch.connected.app; } catch (e) {} if (ok !== btOk) { btOk = ok; redraw(); } });
  watch.addEventListener("health", redraw);
  try { const pc = localStorage.getItem("c"); if (pc) { const k = JSON.parse(pc); for (const key in cfg) if (key in k) cfg[key] = k[key]; lastCfg = pc; } } catch (e) {}
  if (!DEMO) { try { const pd = localStorage.getItem("d"); if (pd) { const j = JSON.parse(pd); if (j && j.v === 2) { data = j; lastData = pd; } } } catch (e) {} }
  booted = true;
  redraw();
}, 0);

console.log("GielinorHUD v" + VERSION);
