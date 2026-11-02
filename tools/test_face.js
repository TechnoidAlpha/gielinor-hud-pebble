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
const face = new Function("screen", "Style", "Battery", "Health", "watch", "DEMO",
  body + "\nreturn { cfg, chatMessage, hiscoreView, orbValue, health, setData(d) { data = d; } };")(
  { width: 200, height: 228 }, function (o) { this.font = o.font; },
  function () { this.sample = () => ({ percent: 87, charging: false }); },
  { access: { available: 1, permission: 2 }, metric: { accessible: () => 3, query: (o) => SENSOR[o.metric] || 0, get: () => 72 } },
  { hour12: false, connected: { app: true } }, false);
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

console.log(fails ? `${fails} FAILED` : "all passed");
process.exit(fails ? 1 : 0);
