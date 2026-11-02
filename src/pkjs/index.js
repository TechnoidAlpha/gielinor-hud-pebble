/*
 * GielinorHUD - phone side (PebbleKit JS).
 *
 * 1. Weather from Open-Meteo (keyless): GPS by default, or a city typed in settings (geocoded
 *    once with Open-Meteo's geocoding API and cached). Current temp + WMO code, today's hi/lo,
 *    max rain chance, and the first hour in the next 12 with a >= 50% rain chance.
 * 2. Hiscores from the official Old School hiscores JSON (keyless, public):
 *    secure.runescape.com/m=hiscore_oldschool[_ironman|_hardcore_ironman|_ultimate]/index_lite.json
 *    Sends every skill's level + xp so the watch can rotate / pick / find the next level itself
 *    without another fetch. A local-midnight snapshot gives "XP gained today".
 * 3. Settings page: a data-URI HTML page (house pattern, no hosting, no Clay).
 *
 * Message contract (JSON strings): CFG = display settings, DATA = {v:1, at, w:{...}, h:{...}}.
 * The watch sends RDY 1 on launch (resend everything) or RDY 2 as an overdue-data poke.
 */
var APP_VERSION = "26.11.1";
// MOCK: screenshots only (tools/shots.sh patches these two lines). Sends MOCK_W as the weather and
// no hiscores, so a DEMO watch build keeps its sample hiscores. Never ship with MOCK = true.
var MOCK = false;
var MOCK_W = { t: 12, hi: 14, lo: 7, c: "rain", p: 40, d: "Light rain", rt: "15:00" };

var DEFAULTS = {
  osrsOn: true, osrsName: "", osrsAcct: "main", osrsSkill: 18,
  rs3On: false, rs3Name: "", rs3Acct: "main", rs3Skill: 18,
  swap: "min", hsMode: "pick", rotMin: 5,
  loc: "gps", city: "", units: "C", wxMin: 30,
  stepGoal: 8000, sleepGoal: 8, activeGoal: 30, distGoal: 5, calGoal: 400,
  orbs: ["batt", "hr", "steps", "sleep"],   // what each orb shows, top to bottom
  cm: "rsxcw",   // chatbox messages: r rain, s steps, x xp, c charging, w welcome; "" = the date only
};   // (no clock option: the clock follows the watch's 12/24-hour setting)
var ORB_METRICS = ["batt", "hr", "steps", "sleep", "active", "dist", "cal"];
var SKILLS = ["Attack", "Defence", "Strength", "Hitpoints", "Ranged", "Prayer", "Magic", "Cooking",
  "Woodcutting", "Fletching", "Fishing", "Firemaking", "Crafting", "Smithing", "Mining", "Herblore",
  "Agility", "Thieving", "Slayer", "Farming", "Runecraft", "Hunter", "Construction", "Sailing"];
// RS3's list: same order through Construction, two renamed, then its six extra skills
var RS3_SKILLS = SKILLS.slice(0, 23).concat(["Summoning", "Dungeoneering", "Divination", "Invention", "Archaeology", "Necromancy"]);
RS3_SKILLS[3] = "Constitution"; RS3_SKILLS[20] = "Runecrafting";
var ACCT_PATH = { main: "hiscore_oldschool", iron: "hiscore_oldschool_ironman",
  hcim: "hiscore_oldschool_hardcore_ironman", uim: "hiscore_oldschool_ultimate" };

function now() { return Math.floor(Date.now() / 1000); }
function getCfg() {
  var c = {}; var s = {};
  try { s = JSON.parse(localStorage.getItem("cfg") || "{}"); } catch (e) { s = {}; }
  // settings saved by the one-game test builds (game/rsn/acct/skill) move into that game's slot
  if (s.rsn && !("osrsName" in s) && !("rs3Name" in s)) {
    var g = s.game === "rs3" ? "rs3" : "osrs";
    s[g + "On"] = true; s[g + "Name"] = s.rsn; s[g + "Acct"] = s.acct || "main"; s[g + "Skill"] = s.skill;
    if (g === "rs3") s.osrsOn = false;
  }
  if (s.chat === false && !("cm" in s)) s.cm = "";   // the old chatbox on/off switch
  if (!s.osrsOn && !s.rs3On && ("osrsOn" in s)) s.osrsOn = true;   // one game is always on now
  for (var k in DEFAULTS) c[k] = (k in s && s[k] !== undefined) ? s[k] : DEFAULTS[k];
  return c;
}
function setCfg(c) { localStorage.setItem("cfg", JSON.stringify(c)); }
function cfgForWatch(c) {
  return { stepGoal: c.stepGoal, sleepGoal: c.sleepGoal, activeGoal: c.activeGoal, distGoal: c.distGoal, calGoal: c.calGoal,
    orbs: c.orbs, cm: c.cm,
    hsMode: c.hsMode, skill: c.osrsSkill, skill3: c.rs3Skill, swap: c.swap, rotMin: c.rotMin, units: c.units };
}

function get(url, ok, fail) {
  var x = new XMLHttpRequest();
  x.open("GET", url, true);
  x.timeout = 20000;
  x.onload = function () {
    if (x.status >= 200 && x.status < 300) { try { ok(JSON.parse(x.responseText)); } catch (e) { fail("parse"); } }
    else fail(x.status);
  };
  x.onerror = function () { fail("net"); };
  x.ontimeout = function () { fail("timeout"); };
  x.send();
}

// ---------------------------------------------------------------- AppMessage (one in flight)
var queue = [], sending = false;
function send(obj) { queue.push(obj); pump(); }
function pump() {
  if (sending || !queue.length) return;
  sending = true;
  var m = queue.shift();
  Pebble.sendAppMessage(m, function () { sending = false; pump(); },
    function (e) { sending = false; console.log("send failed " + JSON.stringify(e)); pump(); });
}
function sendCfg() { send({ CFG: JSON.stringify(cfgForWatch(getCfg())) }); }

var data = null;
try { data = JSON.parse(localStorage.getItem("data") || "null"); } catch (e) { data = null; }
if (!data || data.v !== 2) data = { v: 2, at: 0, w: null, hs: [] };   // v2: one hiscores block per game
function sendData() {
  data.at = now();
  var s = JSON.stringify(data);
  try { localStorage.setItem("data", s); } catch (e) {}
  send({ DATA: s });
}

// ---------------------------------------------------------------- weather
// WMO weather code -> [icon, words]. Icons are the names in main.js ICONS.
function wmo(code, day) {
  if (code === 0) return [day ? "sun" : "moonw", "Clear"];
  if (code === 1) return [day ? "sun" : "moonw", "Mostly clear"];
  if (code === 2) return ["pcloud", "Partly cloudy"];
  if (code === 3) return ["cloud", "Overcast"];
  if (code === 45 || code === 48) return ["fog", "Fog"];
  if (code >= 51 && code <= 57) return ["rain", "Drizzle"];
  if (code === 61 || code === 80) return ["rain", "Light rain"];
  if (code === 63 || code === 81) return ["rain", "Rain"];
  if (code === 65 || code === 82) return ["rain", "Heavy rain"];
  if (code === 66 || code === 67) return ["rain", "Freezing rain"];
  if (code >= 71 && code <= 77) return ["snow", code === 75 ? "Heavy snow" : "Snow"];
  if (code === 85 || code === 86) return ["snow", "Snow showers"];
  if (code >= 95) return ["storm", "Thunderstorm"];
  return ["cloud", "Cloudy"];
}
function withLocation(cb, fail) {
  var c = getCfg();
  if (c.loc === "city" && c.city) {
    var cache = null; try { cache = JSON.parse(localStorage.getItem("geo") || "null"); } catch (e) {}
    if (cache && cache.q === c.city) { cb(cache.lat, cache.lon); return; }
    get("https://geocoding-api.open-meteo.com/v1/search?count=1&name=" + encodeURIComponent(c.city), function (j) {
      if (!j.results || !j.results.length) { fail("city not found"); return; }
      var r = j.results[0];
      localStorage.setItem("geo", JSON.stringify({ q: c.city, lat: r.latitude, lon: r.longitude }));
      cb(r.latitude, r.longitude);
    }, fail);
    return;
  }
  navigator.geolocation.getCurrentPosition(function (p) {
    localStorage.setItem("lastPos", JSON.stringify({ lat: p.coords.latitude, lon: p.coords.longitude }));
    cb(p.coords.latitude, p.coords.longitude);
  }, function () {
    var lp = null; try { lp = JSON.parse(localStorage.getItem("lastPos") || "null"); } catch (e) {}
    if (lp) cb(lp.lat, lp.lon); else fail("no location");
  }, { timeout: 15000, maximumAge: 30 * 60 * 1000 });
}
var lastWx = 0;
function fetchWeather(then) {
  var c = getCfg();
  withLocation(function (lat, lon) {
    var u = "https://api.open-meteo.com/v1/forecast?latitude=" + lat.toFixed(3) + "&longitude=" + lon.toFixed(3) +
      "&current=temperature_2m,weather_code,is_day&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max" +
      "&hourly=precipitation_probability&forecast_hours=12&forecast_days=1&timezone=auto" +
      (c.units === "F" ? "&temperature_unit=fahrenheit" : "");
    get(u, function (j) {
      var cur = j.current || {}, dly = j.daily || {}, hr = j.hourly || {};
      var w = wmo(cur.weather_code, cur.is_day === 1);
      var rt = "";
      var pp = hr.precipitation_probability || [], tt = hr.time || [];
      for (var i = 0; i < pp.length; i++) if (pp[i] >= 50) { rt = (tt[i] || "").slice(11, 16); break; }
      data.w = {
        t: Math.round(cur.temperature_2m), c: w[0], d: w[1],
        hi: Math.round((dly.temperature_2m_max || [0])[0]), lo: Math.round((dly.temperature_2m_min || [0])[0]),
        p: (dly.precipitation_probability_max || [0])[0] || 0, rt: rt, u: c.units, at: now(),
      };
      lastWx = now();
      if (then) then();
    }, function (e) { console.log("weather failed " + e); if (then) then(); });
  }, function (e) { console.log("location failed " + e); if (then) then(); });
}

// ---------------------------------------------------------------- hiscores
// Old School: the official hiscores JSON. RuneScape 3: RuneMetrics first (it also covers
// accounts the RS3 hiscores leave out, as long as the profile is public), then the RS3 hiscores.
// RS3's skill order matches Old School's through Construction (index 22); RS3 then adds six.
// The phone works out each skill's progress (levels go to 120 in RS3), so the watch gets finished
// numbers: l = level, r = xp left to the next level (0 = maxed), f = % through the level,
// g = xp gained since the first refresh after midnight.
var RS3_COUNT = 29;
var RS3_PATH = { main: "hiscore", iron: "hiscore_ironman", hcim: "hiscore_hardcore_ironman" };
var XPT = [0, 0];
(function () { var pts = 0; for (var l = 1; l < 126; l++) { pts += Math.floor(l + 300 * Math.pow(2, l / 7)); XPT[l + 1] = Math.floor(pts / 4); } })();
function progress(lv, xp, max) {
  if (lv >= max || !XPT[lv + 1]) return [0, 100];
  var a = XPT[lv], b = XPT[lv + 1];
  return [Math.max(0, b - xp), Math.max(0, Math.min(99, Math.floor((xp - a) * 100 / (b - a))))];
}
var lastHs = 0;
function dayKey() { var d = new Date(); return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate(); }
function getText(url, ok, fail) {
  var x = new XMLHttpRequest();
  x.open("GET", url, true); x.timeout = 20000;
  x.onload = function () { if (x.status >= 200 && x.status < 300) ok(x.responseText); else fail(x.status); };
  x.onerror = function () { fail("net"); }; x.ontimeout = function () { fail("timeout"); };
  x.send();
}
function hsDone(c, game, lv, xp, tot, then) {   // c = {rsn, acct} for this game
  var max = game === "rs3" ? 120 : 99, r = [], f = [];
  for (var k = 0; k < lv.length; k++) { var p = progress(lv[k], xp[k], max); r[k] = p[0]; f[k] = p[1]; }
  var snap = null; try { snap = JSON.parse(localStorage.getItem("snap_" + game) || "null"); } catch (e) {}
  if (!snap || snap.day !== dayKey() || snap.rsn !== c.rsn || snap.game !== game || (snap.acct || "main") !== c.acct) {
    snap = { day: dayKey(), rsn: c.rsn, acct: c.acct, game: game, xp: xp.slice() };
    localStorage.setItem("snap_" + game, JSON.stringify(snap));
  }
  var g = []; for (var m = 0; m < xp.length; m++) g[m] = Math.max(0, xp[m] - (snap.xp[m] || 0));
  then({ gm: game, n: c.rsn, tot: tot, l: lv, r: r, f: f, g: g });
}
function hsFail(c, game, e, then) {
  console.log(game + " hiscores failed " + e);
  if (e === 404 || e === "not found") then({ gm: game, n: c.rsn, err: "not found" });
  else then(null);                                  // network trouble: keep the last good block
}
function fetchOsrs(c, then) {
  var url = "https://secure.runescape.com/m=" + (ACCT_PATH[c.acct] || ACCT_PATH.main) +
    "/index_lite.json?player=" + encodeURIComponent(c.rsn);
  get(url, function (j) {
    var sk = j.skills || [], lv = [], xp = [], tot = 0;
    for (var i = 0; i < sk.length; i++) {
      if (sk[i].name === "Overall") { tot = sk[i].level; continue; }
      var idx = SKILLS.indexOf(sk[i].name);
      if (idx < 0) continue;
      lv[idx] = Math.max(1, sk[i].level); xp[idx] = Math.max(0, sk[i].xp);   // unranked = -1
    }
    for (var k = 0; k < SKILLS.length; k++) { if (lv[k] === undefined) { lv[k] = 1; xp[k] = 0; } }
    hsDone(c, "osrs", lv, xp, tot, then);
  }, function (e) { hsFail(c, "osrs", e, then); });
}
function fetchRs3Hiscores(c, then) {
  var url = "https://secure.runescape.com/m=" + (RS3_PATH[c.acct] || RS3_PATH.main) +
    "/index_lite.ws?player=" + encodeURIComponent(c.rsn);
  getText(url, function (t) {
    var rows = t.trim().split("\n"), lv = [], xp = [], tot = 0;
    for (var i = 0; i <= RS3_COUNT && i < rows.length; i++) {
      var p = rows[i].split(","), L = parseInt(p[1], 10), X = parseInt(p[2], 10);
      if (i === 0) { tot = L; continue; }
      lv[i - 1] = L > 0 ? L : 1; xp[i - 1] = X > 0 ? X : 0;
    }
    hsDone(c, "rs3", lv, xp, tot, then);
  }, function (e) { hsFail(c, "rs3", e, then); });
}
function fetchRs3(c, then) {
  get("https://apps.runescape.com/runemetrics/profile/profile?activities=0&user=" + encodeURIComponent(c.rsn), function (j) {
    if (!j || j.error || !j.skillvalues) {
      // NO_PROFILE / PROFILE_PRIVATE: the hiscores may still have them
      fetchRs3Hiscores(c, function (b) {
        if (b && b.err && j && j.error === "PROFILE_PRIVATE") b.err = "profile private";
        then(b);
      });
      return;
    }
    var lv = [], xp = [];
    for (var k = 0; k < RS3_COUNT; k++) { lv[k] = 1; xp[k] = 0; }
    for (var i = 0; i < j.skillvalues.length; i++) {
      var sv = j.skillvalues[i];
      if (sv.id >= 0 && sv.id < RS3_COUNT) { lv[sv.id] = Math.max(1, sv.level); xp[sv.id] = Math.floor(sv.xp / 10); }   // RuneMetrics xp is in tenths
    }
    hsDone(c, "rs3", lv, xp, j.totalskill || 0, then);
  }, function () { fetchRs3Hiscores(c, then); });
}
// Fetch every enabled game (Old School first), then hand data.hs to the watch in that order.
function fetchHiscores(then) {
  var c = getCfg(), jobs = [];
  if (c.osrsOn && c.osrsName) jobs.push(["osrs", { rsn: c.osrsName, acct: c.osrsAcct }]);
  if (c.rs3On && c.rs3Name) jobs.push(["rs3", { rsn: c.rs3Name, acct: c.rs3Acct }]);
  var old = data.hs || [], out = [];
  function next(i) {
    if (i >= jobs.length) { data.hs = out; lastHs = now(); if (then) then(); return; }
    var game = jobs[i][0];
    (game === "rs3" ? fetchRs3 : fetchOsrs)(jobs[i][1], function (b) {
      if (!b) for (var k = 0; k < old.length; k++) if (old[k] && old[k].gm === game) b = old[k];
      if (b) out.push(b);
      next(i + 1);
    });
  }
  next(0);
}

// ---------------------------------------------------------------- refresh
var timer = null;
// One fetch round at a time: launch fires `ready` and the watch's RDY together, which used to
// fetch everything twice in parallel. An ask during a round runs once more when it ends, so a
// settings change saved mid-round still gets fetched with the new settings.
// A round older than 2 minutes counts as lost (a location call that never answers), so it can't
// block refreshes for good.
var busy = 0, again = false;
function refresh(force) {
  if (MOCK) { MOCK_W.at = now(); MOCK_W.u = "C"; data.w = MOCK_W; data.hs = null; sendData(); return; }
  if (busy && now() - busy < 120) { again = true; return; }   // the follow-up skips what this round fetched
  var round = busy = now();
  var c = getCfg(), pending = 2;
  function done() {
    if (--pending || busy !== round) return;
    busy = 0; sendData();
    if (again) { again = false; refresh(false); }
  }
  if (force || now() - lastWx >= c.wxMin * 60 - 30) fetchWeather(done); else done();
  if (force || now() - lastHs >= 3 * 3600 - 60) fetchHiscores(done); else done();
}
function schedule() {
  if (timer) clearInterval(timer);
  timer = setInterval(function () { refresh(false); }, 10 * 60 * 1000);
}

var lastAsk = 0;
Pebble.addEventListener("ready", function () {
  console.log("pkjs ready " + APP_VERSION);
  sendCfg();
  if (data.at) send({ DATA: JSON.stringify(data) });
  refresh(true); schedule();
});
Pebble.addEventListener("appmessage", function (ev) {
  var p = (ev && ev.payload) || {};
  if (!p.RDY || now() - lastAsk < 5) return;
  lastAsk = now();
  sendCfg();
  if (data.at) send({ DATA: JSON.stringify(data) });
  refresh(p.RDY === 2); schedule();
});

// ---------------------------------------------------------------- settings page
// The page is src/settings/settings.html. tools/gen_settings.py builds it into settings_page.js
// with the face's drawing code (the live preview) and fonts; this fills in the settings and data.
var PAGE = require("./settings_page.js");
function json(v) { return JSON.stringify(v).replace(/</g, "\u003c"); }   // safe inside <script>
function configHtml(c) {
  return PAGE.replace("__CFG__", function () { return json(c); })
    .replace("__DATA__", function () { return json(data); })
    .replace("__VERSION__", APP_VERSION);
}
Pebble.addEventListener("showConfiguration", function () {
  Pebble.openURL("data:text/html;charset=utf-8," + encodeURIComponent(configHtml(getCfg())));
});
Pebble.addEventListener("webviewclosed", function (e) {
  if (!e || !e.response) return;
  var o; try { o = JSON.parse(decodeURIComponent(e.response)); } catch (err) { return; }
  var old = getCfg(), c = getCfg();
  for (var k in DEFAULTS) if (k in o) c[k] = o[k];
  // goals divide the orb fills on the watch: keep them in a sane range
  function clamp(k, lo, hi) { c[k] = Math.min(hi, Math.max(lo, +c[k] || DEFAULTS[k])); }
  clamp("stepGoal", 1000, 100000); clamp("sleepGoal", 4, 12); clamp("activeGoal", 5, 300);
  clamp("distGoal", 0.5, 50); clamp("calGoal", 50, 3000);
  if (!(c.orbs instanceof Array) || c.orbs.length !== 4) c.orbs = DEFAULTS.orbs;
  c.orbs = c.orbs.map(function (m, i) { return ORB_METRICS.indexOf(m) >= 0 ? m : DEFAULTS.orbs[i]; });
  c.cm = String(c.cm).replace(/[^rsxcw]/g, "");
  if (!c.osrsOn && !c.rs3On) c.osrsOn = true;
  setCfg(c);
  sendCfg();
  if (c.osrsName !== old.osrsName || c.osrsAcct !== old.osrsAcct || c.osrsOn !== old.osrsOn ||
      c.rs3Name !== old.rs3Name || c.rs3Acct !== old.rs3Acct || c.rs3On !== old.rs3On) lastHs = 0;
  if (c.loc !== old.loc || c.city !== old.city || c.units !== old.units) lastWx = 0;
  refresh(false);
});
