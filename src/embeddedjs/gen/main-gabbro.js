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

const VERSION = "26.11.2";
// DEMO fills every panel with sample values so emulator renders show a full board. The phone
// sends real weather + hiscores; battery/health switch to live sensors when DEMO is false.
const DEMO = false;

// ==== preview: begin ==== tools/gen_settings.py copies everything down to "preview: end" into the
// settings page, which runs it on a canvas as the live preview. Keep it free of watch-only calls
// outside functions (the page stubs Battery, Health, watch, Style and screen).
const W = screen.width, H = screen.height;

// ---------------------------------------------------------------- colours (64-colour grid)
// C holds the live palette; applyTheme() overwrites the themed keys. Text that sits in a dark well
// (clock, date, orb numbers) keeps the fixed colours; text drawn straight on a panel uses the p*
// keys, so a light theme can turn it dark. The C start frame paints the Classic (stone) theme.
const C = {
  bg: "#000000",
  stone: "#555500", stoneHi: "#AAAA55", stoneLo: "#000000", stoneMid: "#555555",
  inset: "#000000",
  parch: "#FFFFAA", parchLo: "#AA5500", ink: "#000000", inkBlue: "#0000AA",
  yellow: "#FFFF00", orange: "#FFAA00", white: "#FFFFFF", green: "#00FF00", red: "#FF0000",
  cyan: "#00FFFF", grey: "#AAAAAA", shadow: "#000000",
  xpFill: "#00AA00", xpBack: "#550000",
  pTitle: "#FFFF00", pText: "#FFFFFF", pAccent: "#FFAA00", pCool: "#00FFFF", pDim: "#AAAAAA", pShadow: "#000000",
  grain: "#555555",   // round layout: the scatter of darker pixels that makes the stone look like stone
};
const THEMES = {
  stone: {},
  // the modern game client's dark interface: black panels, grey bevels, a dark chatbox
  dark: { bg: "#000000", stone: "#000000", stoneHi: "#555555", stoneMid: "#555555", parch: "#000000", parchLo: "#555555",
    ink: "#FFFFFF", inkBlue: "#55AAFF", grain: "#000000" },
  // light panels for bright daylight on the reflective screen: dark text, white chatbox
  bright: { bg: "#FFFFFF", stone: "#FFFFFF", stoneHi: "#FFFFFF", stoneMid: "#AAAAAA", parch: "#FFFFFF", parchLo: "#000000",
    ink: "#000000", inkBlue: "#0000AA", xpBack: "#AAAAAA", grain: "#FFFFFF",
    pTitle: "#000000", pText: "#000000", pAccent: "#AA5500", pCool: "#0055AA", pDim: "#555555", pShadow: "#FFFFFF" },   // no shadow: it blurs dark text
};
const BASE = {};
for (const k in C) BASE[k] = C[k];
function applyTheme(name) {
  const t = THEMES[name] || THEMES.stone;
  for (const k in BASE) C[k] = k in t ? t[k] : BASE[k];
}

// ---------------------------------------------------------------- fonts
// [style, scale]: scale = art-pixel size, used for the drop-shadow offset.
const F = {
  n: [new Style({ font: "px-n" }), 2],   // capitals 3x5 at 2x: 10 px caps, the small text
  m: [new Style({ font: "px-m" }), 2],
  c: [new Style({ font: "px-clk" }), 4],
  // Pebble Round 2 only (each watch's build carries just its own fonts, see manifest.json)
  r: [new Style({ font: "px-n3" }), 3],   // capitals 3x5 at 3x: 15 px caps, the round layout's text
  k: [new Style({ font: "px-c5" }), 5],   // digits at 5x: 35 px, the round clock and big numbers
};

// ---------------------------------------------------------------- icons
// Palette chars -> colour. "." is transparent. Each icon is one string: a 2-digit width, then
// the rows concatenated and run-length coded (see icon()). One string per icon keeps them in the
// archive, not the slot heap. tools/icon_sheet.py decodes them the same way.
const PAL = {
  W: "#FFFFFF", K: "#000000", Y: "#FFFF00", O: "#FFAA00", R: "#FF0000", r: "#AA0000",
  G: "#AAAAAA", D: "#555555", B: "#55AAFF", b: "#0055AA", N: "#AA5500", n: "#550000",
  T: "#00AAAA", L: "#55FF55", g: "#00AA00", P: "#AA55FF", p: "#5500AA", S: "#55FFFF",
};
const ICONS = {
  // ---- orb glyphs, 7x7, white on the orb fluid
  heart: "07.2W.2W.9W9W3W.5W3.3W5.W3.",
  pray: "073.W5.3W2.7W.5W3.3W3.2W.2W.W5.W",
  boot: "07.3W4.3W4.3W4.4W3.9W9W2W",
  moon: "072.3W3.3W3.3W4.3W4.3W5.3W5.3W2.",
  // ---- small marks: minimap compass, account helm (tinted per account type)
  north: "079..R5.3R3.2RW2R4.W6.W9..",
  helm: "072.3W3.5W.8W5.8W.W.W.W8.",
  // ---- hiscores extras: level-up fireworks, clue scroll, boss swords, GE coins (10x10, 2x)
  levelup: "104.Y6.Y2.Y2.Y4.Y.O.Y6.OYO4.2YOYWYO2Y4.OYO6.Y.O.Y4.Y2.Y2.Y6.Y9.6.",
  clue: "109.2.8N.N8WN.N2W2K2WN2.N4WKWN2.N3WK2WN2.N6WN2.N3WK2WN.N8WN.8N.",
  boss: "10G8.G.G6.G3.G4.G5.G2.G7.2G8.2G7.N2.N5.N4.N3.2O4.2O.2O6.2O",
  coins: "104.4Y5.Y4OY4.6Y.4Y4OY.Y4O4Y.6Y2OY.Y4O4Y.6Y5.4O9.6.",
  // ---- precipitation markers, drawn at 2x beside the % chance
  drop:   "03.B.BBBBBB.B.",
  flake:  "03W.W.W.W.W",
  // ---- weather, 12x12, drawn at 2x
  sun: "124.O2.O5.O8.O5.4Y7.6Y3.O.8Y.O2.8Y4.7YO2.O.6Y2O.O3.3Y3O7.4O5.O8.O5.O2.O4.",
  moonw: "129.7.3Y8.3Y8.3Y9.3Y8.4Y8.4Y8.5Y4.Y3.8Y4.O6YO5.6O9.6.",
  cloud: "129.9.9..3W8.5W6.8W3.9WW.9W9W6WG9WWG.9GG9.9.7.",
  pcloud: "126.Y2.Y9.3Y8.5Y5.3W5Y3.5W3Y3.8W3.9WW.9W9W6WG9WWG.9GG9.4.",
  rain: "124.3G8.5G6.8G3.9GG.9G3GD9GGD.9DD9.5.B3.B3.B2.B3.B3.B6.B3.B3.B2.B3.B3.B.",
  snow: "124.3G8.5G6.8G3.9GG.9G3GD9GGD.9DD9.5.W3.W3.W2.3W.3W.3W2.W3.W3.W9.5.",
  storm: "124.3D8.5D6.8D3.9DD.9D3DK9DDK.4K2Y4K6.2Y9.4Y9..Y9..Y9..Y7.",
  fog: "129.9.6.9G9.8.9GG9.3.9GG9.8.9G9.3.9G9.6.",
  // ---- skills, 10x10, drawn at 2x. Original symbols, one per hiscores skill (SKILLS order).
  total: "10Y.6Y.9Y2Y.8Y3.6Y5.4Y7.2O8.2O7.4O5.6N9.3.",
  attack: "108.2W7.WGW6.WGW6.WGW2.O3.WGW4.O.WGW6.O2W7.NO7.N2.O5.N9.",
  defence: "10.8O.O8G2OG6BG2OG6BG2OG6BGO.OG4BGO2.OG4BGO3.OG2BGO5.O2GO7.2O4.",
  strength: "109.2.2D4.2D.D2GD2.D2G2D2GD2.D2G2D8G2D2GD2.D2G2D2GD2.D2GD.2D4.2D9.9.3.",
  hitpoints: "10.2R3.2R2.RW2R.4R.9R.9R2.7R4.5R6.3R8.R9.9.7.",
  ranged: "104.2NG5.2N2.G4.N4.G3.N5.G3.2O7GWN5.G4.N4.G5.2N2.G7.2NG9.4.",
  prayer: "104.S8.SWS7.SWS4.3S3W3S2.S5WS4.S3WS4.SWS.SWS2.2S5.2S9.9.3.",
  magic: "104.2b7.3b7.bYb6.5b5.3bY2b3.7b3.2bY5b.9bb9BB9..",
  cooking: "102.W2.W7.W2.W5.W2.W9.5.D8GD.8G2.G6DG2.G6DG3.6G9.3.",
  woodcutting: "103.g2Lg5.g4Lg3.g2Lg3Lg.g6LgLg.g6Lg3.6g6.2N8.2N7.4N9.4.",
  fletching: "106.3G8.2G7.N.G6.N8.N8.N6.2RN7.3R8.2R9.8.",
  fishing: "109.4.4B4.7B.2BK9B9B.7B.B3.4B9.9.9.6.",
  firemaking: "104.R8.2R8.ROR6.R2OR.R4.R3O2R3.R2OY2OR3.RO3YOR3.RO3YOR4.R3OR5.5N3.",
  crafting: "109.3.6S3.SW4SWS.9SS.B6SB3.B4SB5.B2SB7.2B9.9.6.",
  smithing: "109.9.2.D8G2.D8G2.2D4G6.2G8.2G7.4G5.6D9.3.",
  mining: "102.5G4.G5.2G.G4.N2.G6.N8.N9.N8.N9.N8.N8.N8.",
  herblore: "106.2L7.4L5.Lg3L4.2Lg2L4.2Lg3L3.2Lg3L5.g2L6.g8.g9.9..",
  agility: "105.2W8.2W6.3W6.W.3W.W5.W2.W5.3W6.W3.W4.W5.W2.W9.9..",
  thieving: "109.9.2.9P2P2K4P2K2P2K4P2KP.8P3.2P2.2P9.9.9.5.",
  slayer: "102.6W3.8W.9W2W2K4W2K2W2K4W2K5W2K4W.8W3.WKWKWK4.6W9.3.",
  farming: "103.L2.L5.3L.2L4.6L6.2L8.g9.g8.3g4.9NN.8n9.2.",
  runecraft: "103.4G4.2G4D2G2.G2DY3DG.G2D3Y3D2G3DY4D2G3DY4DG.G2DY3DG2.2G4D2G4.4G9.4.",
  hunter: "102.2N2.2N4.2N2.2N2.N8.3N.4N.2N2.6N3.8N2.8N3.2N2.2N9.9.4.",
  construction: "102.5D4.D5GD3.D5G3D2.2DN2D7.N9.N9.N9.N8.3N9.5.",
  // RuneScape 3's extra skills
  summoning: "104.2N7.N2nN7.2N6.6N3.8N.3N4S5N2S2W2S5N4S3N.8N3.6N2.",
  dungeoneering: "102.6G3.G6NG2.G6NG2.G6NG2.G4NYNG2.G6NG2.G6NG2.G6NG2.G6NG.9GG",
  divination: "104.Y8.YSY6.YSWSY6.YSY8.S8.S9..S9..S8.S9.6.",
  invention: "103.4Y5.Y2W3Y3.YW6Y2.8Y2.8Y3.6Y5.4Y6.4G6.4D7.2G4.",
  archaeology: "106.2G7.GW2G5.GW3G4.5G4.N4G4.2N7.2N8.N9.9.9.2.",
  necromancy: "103.4P5.P4WP3.P6WP2.PWK2WKWP2.PWK2WKWP2.P6WP3.PW2KWP5.P2WP5.P.2P.P9.3.",
  sailing: "104.2G7.G2.G7.2G6.6G6.2G8.2G4.G3.2G3.3G2.2G2.2G.8G4.4G3.",
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

// Draw an icon at (x, y) with integer scale s. Icons are run-length coded: a digit 2-9 repeats
// the next character, so each run becomes one fillColor (split where a row ends).
// tint, when given, paints every opaque pixel that one colour (used for the glyph outlines).
function icon(port, name, x, y, s, tint) {
  const ic = ICONS[name]; if (!ic) return;
  const w = parseInt(ic.slice(0, 2), 10), len = ic.length;
  let col = 0, row = 0;
  for (let p = 2; p < len; p++) {
    let ch = ic[p], n = 1;
    if (ch >= "2" && ch <= "9") { n = ch.charCodeAt(0) - 48; ch = ic[++p]; }
    while (n > 0) {
      const take = n < w - col ? n : w - col;
      if (ch !== ".") port.fillColor(tint || PAL[ch], x + col * s, y + row * s, take * s, s);
      col += take; n -= take;
      if (col === w) { col = 0; row++; }
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
// text drawn straight on a panel: the theme's panel shadow (a light theme has no black shadow)
function ptxt(port, s, f, col, x, y, align) {
  const st = F[f][0], o = F[f][1];
  if (align === "c") x -= tw(port, s, f) >> 1;
  else if (align === "r") x -= tw(port, s, f);
  if (C.pShadow !== C.stone) port.drawString(s, st, C.pShadow, x + o, y + o);
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
// flip puts the plate on the right of the orb (the round layout's right-hand orbs); the orb then
// sits at x+10 and the plate at x+22..x+61, so both layouts span the same 62 px.
function orb(port, x, y, frac, fluid, fluidLo, glyph, label, labelCol, flip) {
  const r = 9, cx = flip ? x + 10 : x + 50, cy = y + 10, px = flip ? x + 22 : x - 1;
  // value plate
  // plate y+1..y+19 is centred on the orb (cy = y+10); the 14 px digits plus their 2 px shadow
  // sit inside it, and it is wide enough for "100"
  well(port, px, y + 1, 40, 19);                    // 40 wide: fits "5.1k" and "100"
  // right edge px+38: measured widths include each glyph's 2 px trailing gap, so ink ends 2 px in
  const rx = px + 38;
  if (label.length > 1 && label[label.length - 1] === "k") {   // "5.1k": number + a small K suffix
    txt(port, "k", "n", labelCol, rx, y + 7, "r");
    txt(port, label.slice(0, -1), "m", labelCol, rx - tw(port, "k", "n"), y + 3, "r");
  } else txt(port, label, "m", labelCol, rx, y + 3, "r");
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

// What each orb shows (cfg.orbs, top to bottom). An orb always keeps its game look (Hitpoints,
// Prayer, Run energy, Special attack): the C start frame draws those glyphs before it can know the
// settings, so a look that followed the metric would swap glyphs on every launch.
const ORB_DEFAULT = ["batt", "hr", "steps", "sleep"];
const ORB_LOOK = [["#FF5555", "#AA0000", "heart"], ["#55FFFF", "#00AAAA", "pray"], ["#FFFF55", "#AAAA00", "boot"], ["#55FFAA", "#00AA55", "moon"]];
// orb fill (f, 0..1), number (l) and number colour (c) for metric m
function orbValue(m, b, h) {
  const lock = h.lock ? { f: 0, l: "--", c: C.grey } : null;
  if (m === "batt") return b ? { f: b.pct / 100, l: "" + b.pct, c: b.chg ? C.cyan : levelCol(b.pct / 100) } : { f: 0, l: "--", c: C.grey };
  if (m === "hr") return { f: h.hr ? Math.min(1, h.hr / 180) : 0, l: h.hr ? "" + h.hr : "--", c: C.cyan };
  if (lock) return lock;
  if (m === "sleep") { const s = h.sleep / 3600, f = s / cfg.sleepGoal; return { f: f, l: s ? Math.floor(s) + "h" : "--", c: levelCol(f) }; }
  if (m === "active") { const n = Math.floor(h.active / 60), f = n / cfg.activeGoal; return { f: f, l: n + "m", c: levelCol(f) }; }
  if (m === "dist") {                                  // km, or miles with Fahrenheit
    const d = h.dist / (cfg.units === "F" ? 1609.34 : 1000), f = d / cfg.distGoal;
    return { f: f, l: d < 10 ? (Math.floor(d * 10) / 10) + "" : "" + Math.floor(d), c: levelCol(f) };
  }
  if (m === "cal") { const f = h.cal / cfg.calGoal; return { f: f, l: stepsLabel(h.cal), c: levelCol(f) }; }
  const f = h.steps / cfg.stepGoal;
  return { f: f, l: stepsLabel(h.steps), c: levelCol(f) };
}

// ---------------------------------------------------------------- data
// skill = the Old School pick, skill3 = the RuneScape 3 pick; swap = how two games share the panel
// orbs = what each orb shows, top to bottom; cm = which chatbox messages run (letters: see
// chatMessage), empty = the date only; theme = stone | dark | bright; helm = account-type helm
// (tools/shots.sh patches hsMode and skill on the first line)
const cfg = { hsMode: "pick", skill: 18, skill3: 18, swap: "min", rotMin: 5, units: "C",
  stepGoal: 8000, sleepGoal: 8, activeGoal: 30, distGoal: 5, calGoal: 400, orbs: ORB_DEFAULT, cm: "rsxlcw",
  theme: "stone", helm: true };
// demoData() builds the sample panels for emulator renders and the settings preview; real phone
// DATA replaces them as it arrives. Built only when asked: a release build never pays the slots.
// DEMO_LU (patched by tools/shots.sh) adds a fresh Woodcutting level-up.
const DEMO_LU = false;
function demoData() {
  const b = { gm: "osrs", n: "Zezima", tot: 1873, ac: "iron", kc: { l: "Zulrah", s: 1204, k: 5123, n: "Zulrah" },
    l: [92, 88, 95, 93, 90, 77, 94, 85, 81, 82, 86, 80, 74, 70, 77, 72, 71, 75, 87, 79, 66, 78, 70, 41],
    g: [0, 0, 0, 12500, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 41200, 0, 0, 0, 0, 0] };
  // % through each level (f) and xp left (r), as the phone sends them; r follows the game's level
  // curve (xp from lv to lv+1 = floor(lv + 300 * 2^(lv/7)) / 4)
  b.f = b.l.map((lv, k) => (k * 37 + 11) % 97);
  b.r = b.l.map((lv, k) => Math.round((100 - b.f[k]) / 100 * Math.floor(lv + 300 * Math.pow(2, lv / 7)) / 4));
  if (DEMO_LU) b.lu = [8, 82, Math.floor(Date.now() / 1000)];
  return { v: 2, at: 0, w: { t: 12, hi: 14, lo: 7, c: "rain", p: 40, d: "Light rain", rt: "15:00" }, hs: [b],
    ge: { n: "Abyssal whip", p: 691188, c: 1.2 } };
}
let data = DEMO ? demoData() : { v: 2, at: 0, hs: [] };   // v2: hs = one hiscores block per game

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
  if (DEMO) return { steps: 5120, hr: 72, sleep: 7 * 3600 + 25 * 60, active: 34 * 60, dist: 3800, cal: 312, lock: "", acc: 15 };
  const h = { steps: 0, hr: 0, sleep: 0, active: 0, dist: 0, cal: 0, lock: "", acc: -1 };
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
  // today's totals, only for metrics an orb shows
  const on = (m) => cfg.orbs.indexOf(m) >= 0;
  if (on("active")) try { h.active = Health.metric.query({ metric: "active seconds" }); } catch (e) {}
  if (on("dist")) try { h.dist = Health.metric.query({ metric: "walked distance" }); } catch (e) {}
  if (on("cal")) try { h.cal = Health.metric.query({ metric: "active calories" }); } catch (e) {}
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
// Two layouts share every helper below: the Time 2's game screen (200x228) and, on the round
// Pebble Round 2 (260x260), a minimap layout: clock on top, weather inside a minimap circle, two
// orbs either side of it, then the hiscores band and the chatbox following the screen's curve.
const ROUND = W === H;
const RC = W >> 1;                                     // round: screen centre
// half the width of a circle of radius r (default: the screen) centred on the screen, at row y
function chord(y, r) {
  if (r === undefined) r = RC;
  const dy = y + 0.5 - RC; return dy * dy >= r * r ? 0 : Math.floor(Math.sqrt(r * r - dy * dy));
}
// Timeline Quick View covers the bottom of the screen; peek = how many pixels (0 when hidden),
// set from the app's height by the resize listener
let peek = 0;

function clockString(d) {
  let hh = d.getHours();
  if (hour12()) { hh = hh % 12; if (hh === 0) hh = 12; }
  return (hour12() ? "" + hh : pad(hh)) + ":" + pad(d.getMinutes());
}
function dateString(d) { return DOW[d.getDay()] + " " + d.getDate() + " " + MON[d.getMonth()]; }
const ORB_GLYPHS = ["heart", "pray", "boot", "moon"];
// weather older than 3 hours (phone offline, API refusing) greys out and says how old
function weatherAge(w) { const age = w && w.at ? Date.now() / 1000 - w.at : 0; return [age, age > 3 * 3600]; }














































































































// ==== layout: round begin ====
// ================================================================ Pebble Round 2 (260x260)
// The minimap layout, drawn bigger than the Time 2's: text is 15 px capitals (px-n3) and the
// clock 35 px (px-c5). Top to bottom:
//   the clock and date in a viewport shaped like the top of the screen;
//   the minimap: your hiscore at a glance (skill icon, big level), with the XP to the next level
//   as a ring round its rim, like the game's XP orb; two orbs either side of it;
//   the chatbox across the wide middle of the screen, then the weather in the bottom band.
// Every pixel belongs to the stone frame, so nothing floats on bare black.
const CV_Y0 = 15, CV_Y1 = 85, CV_HW = 84;               // clock viewport rows, widest half-width
const MM_Y = 132, MM_R = 44;                            // minimap centre and outer radius
const CH_Y = 179, WX_Y = 213;                           // chatbox band, weather band (top rows)
// round orb: socket radius 12 with a 2x glyph, a value plate 46x23 beside it
const RO_R = 12, RO_PW = 46, RO_PH = 23;
// orb i: [x, y] of its plate+socket box (74 wide), and whether the plate is on the right
function roundOrbSpot(i) {
  const left = i < 2;                                   // Hitpoints and Prayer left, Run and Special right
  return [left ? 10 : 176, i % 2 ? 142 : 98, !left];
}
function roundBand(port, y0, y1, fill, edge, hi) {      // rows y0..y1 clipped to the circle
  for (let y = y0; y <= y1; y++) {
    const h = chord(y);
    if (h) port.fillColor(y === y0 || y === y1 ? edge : hi && y === y0 + 1 ? hi : fill, RC - h, y, 2 * h, 1);
  }
}
// the stone frame: dark outer line, lit edge, stone, a fixed scatter of grain
function roundBackdrop(port) {
  port.fillColor(C.bg, 0, 0, W, H);
  disc(port, RC, RC, RC - 1, C.stoneLo);
  disc(port, RC, RC, RC - 2, C.stoneHi);
  disc(port, RC, RC, RC - 4, C.stone);
  for (let k = 0; k < 150; k++) {
    const x = (k * 97 + 13) % 236 + 12, y = (k * 61 + 7) % 236 + 12, dx = x - RC, dy = y - RC;
    if (dx * dx + dy * dy < (RC - 8) * (RC - 8)) port.fillColor(C.grain, x, y, 2, 1);
  }
}
function roundViewport(port) {
  for (let y = CV_Y0; y <= CV_Y1; y++) {
    const h = Math.min(CV_HW, chord(y, RC - 8));
    if (!h) continue;
    const edge = y === CV_Y0 || y === CV_Y1;
    port.fillColor(edge ? C.stoneLo : C.stoneMid, RC - h - 1, y, 2 * h + 2, 1);
    if (!edge) port.fillColor(C.inset, RC - h, y, 2 * h, 1);
  }
}
function roundClock(port, d) {
  roundViewport(port);
  txt(port, clockString(d), "k", C.yellow, RC, 25, "c");
  txt(port, dateString(d), "r", C.orange, RC, 65, "c");
}
// the minimap: stone rim (which carries the XP ring) round a dark well, compass on the rim
function roundMinimap(port) {
  disc(port, RC, MM_Y, MM_R, C.stoneLo);
  disc(port, RC, MM_Y, MM_R - 1, C.stoneHi);
  disc(port, RC, MM_Y, MM_R - 2, C.stone);
  disc(port, RC, MM_Y, MM_R - 7, C.stoneLo);
  disc(port, RC, MM_Y, MM_R - 8, C.inset);
}
// the XP ring: rows of the annulus between radii r0 and r1, lit clockwise from 12 o'clock up to
// frac of the way round; the rest is the bar's dark red
function xpRing(port, frac, max) {
  const r0 = MM_R - 6, r1 = MM_R - 2, lit = max ? "#AAAA00" : C.xpFill, rest = C.xpBack;
  const end = frac * 2 * Math.PI;
  for (let dy = -r1; dy <= r1; dy++) {
    for (let dx = -r1; dx <= r1; dx++) {
      const d2 = dx * dx + dy * dy;
      if (d2 > r1 * r1 + r1 || d2 < r0 * r0) continue;
      let a = Math.atan2(dx, -dy); if (a < 0) a += 2 * Math.PI;   // 0 at 12 o'clock, clockwise
      port.fillColor(a <= end ? lit : rest, RC + dx, MM_Y + dy, 1, 1);
    }
  }
}
// one round orb: value plate beside a bigger socket, fluid level, 2x glyph with a dark outline
function roundOrb(port, x, y, frac, fluid, fluidLo, glyph, label, labelCol, plateRight) {
  const cy = y + (RO_PH >> 1), cx = plateRight ? x + RO_R : x + RO_PW + 3 + RO_R, px = plateRight ? x + 2 * RO_R + 4 : x;
  well(port, px, y, RO_PW, RO_PH);
  if (label) txt(port, label, "r", labelCol, px + RO_PW - 3 + 3, y + 3, "r");
  disc(port, cx, cy, RO_R + 1, C.stoneLo);
  disc(port, cx, cy, RO_R, C.stoneMid);
  disc(port, cx, cy, RO_R - 1, "#000055");
  const f = frac < 0 ? 0 : frac > 1 ? 1 : frac;
  if (f > 0) {
    const top = cy + (RO_R - 1) - Math.round(f * (2 * (RO_R - 1) + 1)) + 1;
    disc(port, cx, cy, RO_R - 1, fluidLo, top);
    disc(port, cx - 1, cy - 1, RO_R - 4, fluid, top);
  }
  const gx = cx - 7, gy = cy - 6;
  icon(port, glyph, gx - 1, gy, 2, "#000000"); icon(port, glyph, gx + 1, gy, 2, "#000000");
  icon(port, glyph, gx, gy - 1, 2, "#000000"); icon(port, glyph, gx, gy + 1, 2, "#000000");
  icon(port, glyph, gx, gy, 2);
}
// The still frame, exactly as the C start frame paints it (src/c/mdbl.c, PBL_ROUND)
function roundStill(port) {
  roundBackdrop(port);
  roundClock(port, new Date());
  roundMinimap(port);
  for (let i = 0; i < 4; i++) { const o = roundOrbSpot(i); roundOrb(port, o[0], o[1], 0, C.grey, C.grey, ORB_GLYPHS[i], "", C.grey, o[2]); }
  roundBand(port, CH_Y, WX_Y - 2, C.parch, C.parchLo);
  roundBand(port, WX_Y, H - 1, C.stone, C.stoneLo, C.stoneHi);
}
function roundFace(port, d, b, h, hs) {
  roundBackdrop(port);
  roundClock(port, d);
  roundMinimap(port);
  if (hs.frac !== undefined && !hs.msg) xpRing(port, hs.frac, hs.max);
  roundHiscore(port, hs);
  for (let i = 0; i < 4; i++) {
    const m = cfg.orbs[i] || ORB_DEFAULT[i], v = orbValue(m, b, h), o = roundOrbSpot(i);
    roundOrb(port, o[0], o[1], v.f, ORB_LOOK[i][0], ORB_LOOK[i][1], ORB_LOOK[i][2], v.l, v.c, o[2]);
  }
  roundChat(port, d, b, h, hs);
  roundWeather(port);
}
// inside the minimap's well (radius MM_R - 8): the icon, then the level (or kill count, price,
// today's xp) as big as fits, and the game's tag when two games share the panel
function roundHiscore(port, hs) {
  if (hs.msg) {                                         // notices: up to three centred lines
    const words = hs.msg.split(" "), lines = [""];
    for (let k = 0; k < words.length; k++) {
      const t = lines[lines.length - 1], tryS = t ? t + " " + words[k] : words[k];
      if (!t || tw(port, tryS, "n") <= 64) lines[lines.length - 1] = tryS;
      else if (lines.length < 3) lines.push(words[k]);
      else { lines[2] += "..."; break; }
    }
    lines.forEach((l, k) => txt(port, l, "n", C.grey, RC, MM_Y - 7 * lines.length + 14 * k + 1, "c"));
    return;
  }
  icon(port, hs.icon, RC - 10, MM_Y - 33, 2);
  const big = hs.big || "";
  // 35 px digits for a value of up to two digits (a level); otherwise 15 px capitals
  if (/^[0-9]{1,2}$/.test(big)) txt(port, big, "k", hs.max ? C.yellow : C.white, RC, MM_Y - 11, "c");
  else txt(port, big, "r", C.white, RC, MM_Y - 4, "c");
  // a label under the number: the game (with both on), or which boss / item, cut to fit
  let tag = hs.tag || (hs.icon === "boss" || hs.icon === "clue" || hs.icon === "coins" ? hs.title : "");
  while (tag && tw(port, tag, "n") > 52) tag = tag.slice(0, -1);
  if (tag) txt(port, tag, "n", C.cyan, RC, MM_Y + 24, "c");
}
// the weather band: icon, temperature, high/low and rain chance in one row, dropping the least
// important parts when the row is too wide for the curve
function roundWeather(port) {
  roundBand(port, WX_Y, H - 1, C.stone, C.stoneLo, C.stoneHi);
  const w = data.w, y = WX_Y + 6;
  if (!w) { ptxt(port, "Weather...", "r", C.pDim, RC, y, "c"); return; }
  const stale = weatherAge(w)[1];
  const parts = [[w.t + "°", stale ? C.pDim : C.pTitle], ["H" + w.hi + " L" + w.lo, stale ? C.pDim : C.pAccent], [w.p + "%", stale ? C.pDim : C.pCool]];
  const room = 2 * chord(y + 15) - 12, gap = 6, ic = 25, mk = 10;
  let keep = [0, 1, 2];
  const width = (k) => ic + k.reduce((a, i) => a + gap + tw(port, parts[i][0], "r") + (i === 2 ? mk : 0), 0);
  if (width(keep) > room) keep = [0, 2];
  if (width(keep) > room) keep = [0];
  let x = RC - (width(keep) >> 1);
  icon(port, w.c || "cloud", x, y - 4, 2);
  x += ic;
  keep.forEach((i) => {
    x += gap;
    if (i === 2) { icon(port, w.c === "snow" ? "flake" : "drop", x, y + 2, 2, stale ? C.pDim : undefined); x += mk; }
    ptxt(port, parts[i][0], "r", parts[i][1], x, y, "l"); x += tw(port, parts[i][0], "r");
  });
}
// the chatbox: one message in 15 px capitals across the curve, wrapped to two lines if needed
function roundChat(port, d, b, h, hs) {
  roundBand(port, CH_Y, WX_Y - 2, C.parch, C.parchLo);
  const l1 = CH_Y + 1, l2 = CH_Y + 17;
  const lines = wrap(port, chatMessage(d, b, h, hs), [2 * chord(l1 + 15) - 14, 2 * chord(l2 + 15) - 14], "r");
  if (lines[0]) txtFlat(port, lines[0], "r", C.ink, RC, l1, "c");
  if (lines[1]) txtFlat(port, lines[1], "r", C.ink, RC, l2, "c");
}
// ==== layout: round end ====

// The still parts of the face (the C start frame's picture, see roundStill / squareStill), and
// the whole face; each watch's build carries only its own layout.
function drawStill(port) { if (ROUND) roundStill(port); else squareStill(port); }
function drawFace(port) {
  const d = new Date(), b = batt(), h = health(), hs = hiscoreView(d);
  if (ROUND) roundFace(port, d, b, h, hs); else squareFace(port, d, b, h, hs);
}

// What the hiscores panel shows, per mode: title / right / sub / bar fraction / icon, or a msg.
// The phone sends finished numbers per skill: l = level, r = xp to next level (0 = maxed),
// f = % through the level, g = xp gained today; plus ac (account type), lu (latest level-up:
// [skill, level, unix time]) and kc (the chosen boss or clue: {l label, s score, k rank}).
// Which game's block the panel shows now. With both games on: alternate every minute ("min"), at
// the rotate speed ("rot"), or keep Old School in the panel and put RS3 in the chatbox ("chat").
function rotSlot(d) { return Math.floor((d.getHours() * 60 + d.getMinutes()) / Math.max(1, cfg.rotMin)); }
// true when the game switch ticks on the same clock as the skill rotation
function sameTick(n) { return n > 1 && (cfg.swap === "rot" || (cfg.swap === "min" && cfg.rotMin <= 1)); }
function blockIndex(d, n) {
  if (n < 2 || cfg.swap === "chat") return 0;
  return cfg.swap === "rot" ? rotSlot(d) % n : d.getMinutes() % n;
}
// a level-up from the last hour, if level-up moments are on
function freshLevelUp(s) {
  return cfg.cm.indexOf("l") >= 0 && s && s.lu && Date.now() / 1000 - s.lu[2] < 3600 ? s.lu : null;
}
function hiscoreView(d) {
  if (cfg.hsMode === "ge") return geView();
  const bl = data.hs || [];
  if (!bl.length) return { msg: "Set name in Settings" };
  if (cfg.hsMode === "kc") return kcView(bl);
  const s = bl[blockIndex(d, bl.length)];
  const v = blockView(d, s, sameTick(bl.length) ? bl.length : 1);
  const tag = s && s.gm === "rs3" ? "RS3" : "OSRS";
  if (bl.length > 1) { if (v.msg) v.msg = tag + ": " + v.msg; else v.name = v.tag = tag; }   // tag which game this is
  return v;
}
// share = how many games take turns on the rotation clock. Each game's skill moves on once per
// full round of games; otherwise with two games Old School only ever showed the even skills.
function blockView(d, s, share) {
  if (!s) return { msg: "Set name in Settings" };
  if (s.err) return { msg: s.n + ": " + s.err };
  if (!s.l || !s.r) return { msg: "Hiscores loading..." };
  const n = s.l.length, lu = freshLevelUp(s);
  if (lu && lu[0] < n) {                               // a new level wins the panel for an hour
    return { icon: "levelup", big: "" + lu[1], max: true, title: skName(s, lu[0]) + " " + lu[1], right: "", sub: "Level up!", subCol: C.pTitle,
      name: s.n, ac: s.ac, frac: s.f[lu[0]] / 100, gm: s.gm };
  }
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
    if (top < 0) return { icon: "total", big: "+0", title: "No xp yet today", right: "" + s.tot, rIcon: "total", sub: "Go train something!", name: s.n, ac: s.ac, frac: 0, gm: s.gm };
    return { icon: skIcon(s, top), big: "+" + kfmt(tot), title: "+" + kfmt(tot) + " xp today", right: "",
      sub: skName(s, top) + " +" + kfmt(topG), name: s.n, ac: s.ac, frac: s.f[top] / 100, max: s.r[top] === 0, gm: s.gm };
  }
  if (i < 0 || i >= n) i = 0;
  const lv = s.l[i], max = s.r[i] === 0;
  return { icon: skIcon(s, i), big: "" + lv, title: skName(s, i) + " " + lv, right: "" + s.tot, rIcon: "total",
    sub: max ? "Maxed!" : kfmt(s.r[i]) + " xp to " + (lv + 1),
    name: s.n, ac: s.ac, frac: max ? 1 : s.f[i] / 100, max: max, skill: i, rem: s.r[i], gm: s.gm, blk: s };
}
// boss kill count or clue total (Old School hiscores only)
function kcView(bl) {
  let s = null;
  for (let k = 0; k < bl.length; k++) if (bl[k] && bl[k].gm !== "rs3") s = bl[k];
  if (!s) return { msg: "Kill counts need an Old School name" };
  if (s.err) return { msg: s.n + ": " + s.err };
  const kc = s.kc;
  if (!kc) return { msg: "Pick a boss or clue in Settings" };
  const clue = kc.l.indexOf("lue") >= 0;
  return { icon: clue ? "clue" : "boss", big: kc.s > 0 ? kfmt(kc.s) : "0", title: kc.l, right: kc.s > 0 ? kfmt(kc.s) : "0",
    sub: kc.s > 0 ? (kc.k > 0 ? "Rank " + kfmt(kc.k) : "Ranked") : "Not ranked yet", name: s.n, ac: s.ac };
}
// Grand Exchange price watch: {n name, p price, c % change on yesterday}
function geView() {
  const g = data.ge;
  if (!g) return { msg: "Set a GE item in Settings" };
  if (g.err) return { msg: "GE: " + g.err };
  const up = g.c >= 0;
  // the price goes under the name: a long item name leaves no room beside it
  return { icon: "coins", big: kfmt(g.p), title: g.n, right: "", sub: kfmt(g.p) + " gp, " + (up ? "+" : "") + g.c + "% today",
    subCol: g.c > 0 ? C.green : g.c < 0 ? C.red : C.pText, name: "GE" };
}

// Chatbox: a warning always wins; then a fresh level-up gets every other minute; otherwise the
// messages chosen in cfg.cm take turns each minute, and with none (or nothing to say) the date.
// cm letters: r rain, u sunrise/sunset, f feels like, d wind, s steps, x xp, l level-ups,
// g GE price, c charging, w welcome.
function chatMessage(d, b, h, hs) {
  if (!btOk) return "Phone link lost. Data will wait.";
  if (b && !b.chg && b.pct <= 15) return "Low hitpoints! Charge your watch.";
  if (h.lock === "off") return "Turn on Pebble Health in the Pebble app.";
  if (h.lock === "perm") return "Allow Health for this face in the Pebble app.";
  const bl = data.hs || [];
  for (let k = 0; k < bl.length; k++) {
    const lu = freshLevelUp(bl[k]);
    if (lu && d.getMinutes() % 2 === 0) return "Level up! " + skName(bl[k], lu[0]) + " " + lu[1] + ".";
  }
  if (cfg.swap === "chat" && bl.length > 1 && cfg.hsMode !== "kc" && cfg.hsMode !== "ge") {   // RS3 lives in the chatbox
    const r = blockView(d, bl[1]);
    return r.msg ? "RS3: " + r.msg : "RS3 " + r.title + ". " + r.sub + ".";
  }
  const on = (k) => cfg.cm.indexOf(k) >= 0, msgs = [], w = data.w, t = Date.now() / 1000;
  const wind = cfg.units === "F" ? " mph" : " km/h";
  if (on("r") && w) {
    const mins = w.rs ? Math.round((w.rs - t) / 60) : -1;
    const what = w.c === "snow" ? "Snow" : "Rain";
    if (w.rs && mins > 0 && mins < 120) msgs.push(what + " likely in " + mins + " min.");
    else if (w.rs && mins <= 0 && mins > -60) msgs.push(what + " likely this hour.");
    else if (w.rt) msgs.push(what + " likely around " + w.rt + ".");
  }
  if (on("u") && w && w.sr) {
    if (t < w.srT) msgs.push("Sunrise at " + w.sr + ".");
    else if (t < w.ssT) msgs.push("Sunset at " + w.ss + ".");
    else if (w.sr2) msgs.push("Sunrise at " + w.sr2 + " tomorrow.");
  }
  if (on("f") && w && w.fl !== undefined) msgs.push("Feels like " + w.fl + "°.");
  if (on("d") && w && w.ws !== undefined) msgs.push("Wind " + w.ws + wind + (w.wd ? " from the " + w.wd : "") + ".");
  if (on("s") && h.steps >= cfg.stepGoal) msgs.push("Step goal reached. Nice work!");
  else if (on("s") && h.steps) msgs.push(h.steps + " steps today, " + (cfg.stepGoal - h.steps) + " to go.");
  if (on("x") && hs && hs.rem) msgs.push(kfmt(hs.rem) + " xp to " + skName(hs.blk, hs.skill) + " " + (hs.blk.l[hs.skill] + 1) + ".");
  if (on("g") && data.ge && !data.ge.err) msgs.push("GE: " + data.ge.n + " " + kfmt(data.ge.p) + " (" + (data.ge.c >= 0 ? "+" : "") + data.ge.c + "%).");
  if (on("c") && b && b.chg) msgs.push("Hitpoints regenerating (charging).");
  if (on("w")) msgs.push("Welcome to Gielinor.");
  if (!msgs.length) return DAYS[d.getDay()] + ", " + d.getDate() + " " + MON[d.getMonth()] + " " + d.getFullYear() + ".";
  return msgs[d.getMinutes() % msgs.length];
}

// Word-wrap into two lines no wider than widths[0] and widths[1] in font f; "..." marks a cut.
function wrap(port, s, widths, f) {
  const words = s.split(" "), out = ["", ""];
  let li = 0;
  for (let k = 0; k < words.length; k++) {
    const tryS = out[li] ? out[li] + " " + words[k] : words[k];
    if (tw(port, tryS, f) <= widths[li]) out[li] = tryS;
    else if (li === 0) { li = 1; out[1] = words[k]; }
    else { out[1] += "..."; break; }
  }
  return out;
}
// ==== preview: end ====

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
      try { const k = JSON.parse(cf); for (const key in cfg) if (key in k) cfg[key] = k[key]; applyTheme(cfg.theme); } catch (e) { console.log("cfg err " + e); }
      try { localStorage.setItem("c", cf); } catch (e) {}
    }
    const dd = map.get("DATA");
    if (dd) {
      touched = true; lastRx = Date.now();
      try {
        const j = JSON.parse(dd);
        if (j && j.v === 2) {
          if (DEMO) { const dd = demoData(); if (!j.w) j.w = dd.w; if (!j.hs || !j.hs.length) j.hs = dd.hs; if (!j.ge) j.ge = dd.ge; }   // keep sample panels in renders
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
  // Timeline Quick View: the event carries no value, but Piu shrinks the app to the part of the
  // screen still visible (228 -> 170 on the Time 2 emulator: a 58 px peek), so read that
  watch.addEventListener("resize", () => {
    const p = H - app.height;
    if (p !== peek) { peek = p > 0 ? p : 0; redraw(); }
  });
  try { const pc = localStorage.getItem("c"); if (pc) { const k = JSON.parse(pc); for (const key in cfg) if (key in k) cfg[key] = k[key]; lastCfg = pc; applyTheme(cfg.theme); } } catch (e) {}
  if (!DEMO) { try { const pd = localStorage.getItem("d"); if (pd) { const j = JSON.parse(pd); if (j && j.v === 2) { data = j; lastData = pd; } } } catch (e) {} }
  booted = true;
  redraw();
}, 0);

console.log("GielinorHUD v" + VERSION);
