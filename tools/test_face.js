#!/usr/bin/env node
// Tests the face's logic without a watch: node tools/test_face.js
// Loads the drawing section of main.js (between the "preview" markers, as the settings page does)
// with stub sensors, then checks skill rotation, orb values and chatbox messages.
"use strict";
const fs = require("fs"), path = require("path");
const src = fs.readFileSync(path.join(__dirname, "..", "src", "embeddedjs", "main.js"), "utf8");
const body = src.slice(src.indexOf("// ==== preview: begin ===="), src.indexOf("// ==== preview: end ===="));
let fails = 0;
function check(name, ok) { console.log((ok ? "PASS " : "FAIL ") + name); if (!ok) fails++; }

const SENSOR = { "step count": 5120, "sleep seconds": 26700, "active seconds": 2040, "walked distance": 3800, "active calories": 312 };
function makeFace(w, h) {
  return new Function("screen", "Style", "Battery", "Health", "watch", "DEMO",
    body + "\nreturn { cfg, chatMessage, hiscoreView, orbValue, health, drawFace, drawStill, applyTheme, C, DEMO_DATA: demoData(), setData(d) { data = d; }, setPeek(p) { peek = p; } };")(
    { width: w, height: h }, function (o) { this.font = o.font; },
    function () { this.sample = () => ({ percent: 87, charging: false }); },
    { access: { available: 1, permission: 2 }, metric: { accessible: () => 3, query: (o) => SENSOR[o.metric] || 0, get: () => 72 } },
    { hour12: false, connected: { app: true } }, false);
}
const face = makeFace(200, 228);
const blk = (gm, n) => ({ gm, n: gm, tot: 1, l: Array(n).fill(50), r: Array(n).fill(9), f: Array(n).fill(5), g: Array(n).fill(0) });

// rotation: with both games on, every skill of each game comes round in a day
face.cfg.hsMode = "rotate";
face.setData({ v: 2, hs: [blk("osrs", 24), blk("rs3", 29)] });
for (const [swap, rot] of [["rot", 1], ["rot", 5], ["min", 1], ["min", 5]]) {
  face.cfg.swap = swap; face.cfg.rotMin = rot;
  const seen = { OSRS: new Set(), RS3: new Set() };
  for (let m = 0; m < 1440; m++) { const v = face.hiscoreView(new Date(2026, 10, 2, 0, m)); seen[v.name].add(v.title); }
  check(`rotation swap=${swap} every ${rot} min: OSRS ${seen.OSRS.size}/24, RS3 ${seen.RS3.size}/29`, seen.OSRS.size === 24 && seen.RS3.size === 29);
}

// orbs: each metric reads the right sensor, against the right goal
face.cfg.orbs = ["batt", "active", "dist", "cal"];
const h = face.health(), b = { pct: 87, chg: false };
const want = { batt: ["87", 0.87], hr: ["72", 0.4], steps: ["5.1k", 0.64], sleep: ["7h", 26700 / 3600 / 8], active: ["34m", 34 / 30], dist: ["3.8", 3.8 / 5], cal: ["312", 312 / 400] };
check("health reads active/dist/cal only when an orb shows them", h.active === 2040 && h.dist === 3800 && h.cal === 312);
for (const m in want) {
  const v = face.orbValue(m, b, h);
  check(`orb ${m}: "${v.l}" fill ${v.f.toFixed(2)}`, v.l === want[m][0] && Math.abs(v.f - want[m][1]) < 0.01);
}
face.cfg.units = "F";
check("distance in miles with Fahrenheit", face.orbValue("dist", b, h).l === "2.3");
face.cfg.units = "C";
check("orbs grey out when Health is off", face.orbValue("steps", b, Object.assign({}, h, { lock: "off" })).l === "--");

// chatbox: only the chosen messages, the date when none, warnings always
face.cfg.hsMode = "pick"; face.cfg.swap = "min";
face.setData({ v: 2, w: { rt: "15:00", c: "rain" }, hs: [blk("osrs", 24)] });
const at = (m) => new Date(2026, 10, 2, 12, m), hs = () => face.hiscoreView(at(0));
const msgs = (cm) => { face.cfg.cm = cm; const s = new Set(); for (let m = 0; m < 10; m++) s.add(face.chatMessage(at(m), b, h, hs())); return [...s]; };
check("all messages take turns", msgs("rsxcw").length === 4);   // charging needs b.chg
check("rain only", msgs("r").join() === "Rain likely around 15:00.");
check("none chosen shows the date", /^Monday, 2 Nov 2026\.$/.test(msgs("").join()));
check("a warning beats the toggles", face.chatMessage(at(0), { pct: 10, chg: false }, h, hs()) === "Low hitpoints! Charge your watch.");

// themes: Bright turns panel text dark, and switching back restores Classic exactly
face.applyTheme("bright");
check("bright theme: dark panel text", face.C.pTitle === "#000000" && face.C.stone === "#FFFFFF");
face.applyTheme("stone");
check("classic theme restored", face.C.pTitle === "#FFFF00" && face.C.stone === "#555500" && face.C.parch === "#FFFFAA");

// kill count and GE price panels
const osrs = Object.assign(blk("osrs", 24), { kc: { l: "Zulrah", s: 1204, k: 5123, n: "Zulrah" }, ac: "iron" });
face.cfg.hsMode = "kc"; face.setData({ v: 2, hs: [osrs] });
let v = face.hiscoreView(at(0));
check(`kill count: ${v.title} ${v.right}, ${v.sub}`, v.title === "Zulrah" && v.right === "1204" && v.sub === "Rank 5123" && v.icon === "boss");
face.setData({ v: 2, hs: [blk("rs3", 29)] });
check("kill count needs an Old School name", /Old School/.test(face.hiscoreView(at(0)).msg));
face.cfg.hsMode = "ge"; face.setData({ v: 2, hs: [], ge: { n: "Abyssal whip", p: 691188, c: 1.2 } });
v = face.hiscoreView(at(0));
check(`GE price: ${v.title}, ${v.sub}`, v.title === "Abyssal whip" && v.sub === "691k gp, +1.2% today");

// level-ups: an hour long, in the panel and every other minute in the chatbox, only when on
const now = Math.floor(Date.now() / 1000);
face.cfg.hsMode = "pick"; face.cfg.cm = "wl";
face.setData({ v: 2, hs: [Object.assign(blk("osrs", 24), { lu: [8, 51, now - 60] })] });
v = face.hiscoreView(new Date());
check("a fresh level-up takes the panel", v.title === "Woodcutting 51" && v.sub === "Level up!");
check("and the chatbox on even minutes", face.chatMessage(at(0), b, h, v) === "Level up! Woodcutting 51.");
face.cfg.cm = "w";
check("level-up moments can be switched off", face.hiscoreView(new Date()).title !== "Woodcutting 51");
face.cfg.cm = "wl"; face.setData({ v: 2, hs: [Object.assign(blk("osrs", 24), { lu: [8, 51, now - 7200] })] });
check("an old level-up is ignored", face.hiscoreView(new Date()).title !== "Woodcutting 51");

// weather messages: rain countdown, next sunrise or sunset, feels like, wind in the right units
const tnow = Date.now() / 1000, wmsg = (cm, w) => { face.cfg.cm = cm; face.setData({ v: 2, w, hs: [] }); return face.chatMessage(at(0), b, h, null); };
check("rain countdown", wmsg("r", { c: "rain", rs: tnow + 40 * 60, rt: "15:00" }) === "Rain likely in 40 min.");
check("sunset after sunrise", wmsg("u", { sr: "07:00", srT: tnow - 3600, ss: "16:30", ssT: tnow + 3600, sr2: "07:02" }) === "Sunset at 16:30.");
check("tomorrow's sunrise after sunset", wmsg("u", { sr: "07:00", srT: tnow - 9000, ss: "16:30", ssT: tnow - 60, sr2: "07:02" }) === "Sunrise at 07:02 tomorrow.");
check("feels like", wmsg("f", { fl: 6 }) === "Feels like 6°.");
face.cfg.units = "F";
check("wind in mph with Fahrenheit", wmsg("d", { ws: 11, wd: "SW" }) === "Wind 11 mph from the SW.");
face.cfg.units = "C";

// every layout, theme and mode draws without error and stays on the screen (Quick View too)
const round = makeFace(260, 260);
for (const [f, W, H] of [[face, 200, 228], [round, 260, 260]]) {
  f.setData(JSON.parse(JSON.stringify(Object.assign({}, f.DEMO_DATA, { w: { t: 12, hi: 14, lo: 7, c: "rain", p: 40, d: "Light rain", rt: "15:00", at: tnow } }))));
  let bad = 0, calls = 0;
  const port = { fillColor(c, x, y, w, hh) { calls++; if (x < 0 || y < 0 || x + w > W || y + hh > H || !/^#[0-9A-F]{6}$/.test(c)) bad++; },
    drawString(s, st, c, x, y) { calls++; if (x < -2 || y < 0 || x > W || y > H) bad++; }, measureString: (s) => ({ width: s.length * 8 }) };
  for (const theme of ["stone", "dark", "bright"]) for (const mode of ["pick", "rotate", "next", "today", "kc", "ge"]) for (const pk of [0, 58]) {
    f.cfg.theme = theme; f.applyTheme(theme); f.cfg.hsMode = mode; f.setPeek(pk); f.cfg.cm = "rufdsxlgcw";
    try { f.drawFace(port); f.drawStill(port); } catch (e) { bad++; console.log("  draw threw: " + e); }
  }
  f.applyTheme("stone"); f.setPeek(0);
  check(`${W}x${H}: all themes x modes x Quick View draw on screen (${calls} calls)`, bad === 0 && calls > 0);
}

// each watch builds main.js without the other watch's layout (tools/gen_layouts.py): a layout
// block may only use what the shared code defines, never the other block
function block(n) { const a = src.indexOf(`// ==== layout: ${n} begin ====`), b = src.indexOf(`// ==== layout: ${n} end ====`); return src.slice(a, b); }
const defs = (t) => new Set([...t.matchAll(/^(?:function|const|let)\s+(\w+)/gm)].map((m) => m[1]));
for (const [mine, other] of [["round", "square"], ["square", "round"]]) {
  const used = new Set([...block(mine).matchAll(/\b([A-Za-z_]\w*)\b/g)].map((m) => m[1])), own = defs(block(mine));
  const bad = [...defs(block(other))].filter((d) => used.has(d) && !own.has(d));
  check(`${mine} layout uses nothing from the ${other} layout${bad.length ? ": " + bad.join(", ") : ""}`, bad.length === 0);
}

console.log(fails ? `${fails} FAILED` : "all passed");
process.exit(fails ? 1 : 0);
