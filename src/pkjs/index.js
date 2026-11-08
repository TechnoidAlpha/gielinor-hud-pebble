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
 * 3. Grand Exchange price watch from the OSRS Wiki's real-time prices API (keyless; it asks for
 *    a descriptive User-Agent, which the phone's own browser agent satisfies): the item name is
 *    matched once against /mapping (cached id), then /latest and the daily /timeseries.
 * 4. Settings page: a data-URI HTML page (house pattern, no hosting, no Clay).
 *
 * Message contract (JSON strings): CFG = display settings, DATA = {v:1, at, w:{...}, h:{...}}.
 * The watch sends RDY 1 on launch (resend everything) or RDY 2 as an overdue-data poke.
 */
var APP_VERSION = "26.11.2";
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
  // chatbox messages: r rain, u sunrise/sunset, f feels like, d wind, s steps, x xp to level,
  // l level-ups, g GE price, c charging, w welcome; "" = the date only
  cm: "rsxlcw",
  theme: "stone",   // stone (classic) | dark | bright
  helm: true,       // account-type helm beside your name
  kcName: "",       // the boss or clue for the kill-count panel (a hiscores activity name)
  geItem: "",       // the Grand Exchange item for the price watch
  cmv: 2,           // settings version: 2 added the level-up message to existing chatbox choices
};   // (no clock option: the clock follows the watch's 12/24-hour setting)
var ORB_METRICS = ["batt", "hr", "steps", "sleep", "active", "dist", "cal"];
var CM_LETTERS = "rufdsxlgcw";
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
  if (("cm" in s) && !s.cmv) { if (s.cm && s.cm.indexOf("l") < 0) s.cm += "l"; s.cmv = 2; }   // v26.11.2 level-ups
  for (var k in DEFAULTS) c[k] = (k in s && s[k] !== undefined) ? s[k] : DEFAULTS[k];
  return c;
}
function setCfg(c) { localStorage.setItem("cfg", JSON.stringify(c)); }
function cfgForWatch(c) {
  return { stepGoal: c.stepGoal, sleepGoal: c.sleepGoal, activeGoal: c.activeGoal, distGoal: c.distGoal, calGoal: c.calGoal,
    orbs: c.orbs, cm: c.cm, theme: c.theme, helm: c.helm,
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
      "&current=temperature_2m,apparent_temperature,weather_code,is_day,wind_speed_10m,wind_direction_10m" +
      "&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset" +
      "&hourly=precipitation_probability&forecast_hours=12&forecast_days=2&timezone=auto&timeformat=unixtime" +
      (c.units === "F" ? "&temperature_unit=fahrenheit&wind_speed_unit=mph" : "");
    get(u, function (j) {
      var cur = j.current || {}, dly = j.daily || {}, hr = j.hourly || {};
      var w = wmo(cur.weather_code, cur.is_day === 1);
      // times come back as unix seconds; hhmm() shows them in the forecast place's own time zone
      var off = j.utc_offset_seconds || 0;
      function hhmm(t) { var d = new Date((t + off) * 1000); var h = d.getUTCHours(), m = d.getUTCMinutes(); return (h < 10 ? "0" : "") + h + ":" + (m < 10 ? "0" : "") + m; }
      var rt = "", rs = 0;
      var pp = hr.precipitation_probability || [], tt = hr.time || [];
      for (var i = 0; i < pp.length; i++) if (pp[i] >= 50) { rs = tt[i] || 0; rt = rs ? hhmm(rs) : ""; break; }
      var sr = dly.sunrise || [], ss = dly.sunset || [];
      var DIRS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
      data.w = {
        t: Math.round(cur.temperature_2m), c: w[0], d: w[1],
        hi: Math.round((dly.temperature_2m_max || [0])[0]), lo: Math.round((dly.temperature_2m_min || [0])[0]),
        p: (dly.precipitation_probability_max || [0])[0] || 0, rt: rt, rs: rs, u: c.units, at: now(),
        fl: Math.round(cur.apparent_temperature), ws: Math.round(cur.wind_speed_10m || 0),
        wd: typeof cur.wind_direction_10m === "number" ? DIRS[Math.round(cur.wind_direction_10m / 45) % 8] : "",
        sr: sr[0] ? hhmm(sr[0]) : "", srT: sr[0] || 0, ss: ss[0] ? hhmm(ss[0]) : "", ssT: ss[0] || 0, sr2: sr[1] ? hhmm(sr[1]) : "",
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
  // level-ups: compare with the levels from the last refresh of the same character
  var key = "lv_" + game, prev = null, lu = null;
  try { prev = JSON.parse(localStorage.getItem(key) || "null"); } catch (e) {}
  if (prev && prev.rsn === c.rsn && prev.l && prev.l.length === lv.length) {
    for (var q = 0; q < lv.length; q++) if (lv[q] > prev.l[q]) lu = [q, lv[q], now()];
    if (!lu && prev.lu && now() - prev.lu[2] < 3600) lu = prev.lu;   // keep a recent one for the hour
  }
  localStorage.setItem(key, JSON.stringify({ rsn: c.rsn, l: lv, lu: lu }));
  var b = { gm: game, n: c.rsn, ac: c.acct, tot: tot, l: lv, r: r, f: f, g: g };
  if (lu) b.lu = lu;
  if (c.kc) b.kc = c.kc;
  then(b);
}
// the chosen boss or clue from the hiscores' activities, with a short label for the watch
function kcLabel(n) {
  var m = /^Clue Scrolls \((\w+)\)$/.exec(n);
  if (m) return m[1] === "all" ? "All clues" : m[1].charAt(0).toUpperCase() + m[1].slice(1) + " clues";
  n = n.replace(/^The /, "").replace(/: Challenge Mode$/, " CM").replace(/: Hard Mode$/, " HM").replace(/: Expert Mode$/, " Expert");
  n = n.replace("Theatre of Blood", "ToB").replace("Chambers of Xeric", "CoX").replace("Tombs of Amascut", "ToA").replace("Thermonuclear Smoke Devil", "Thermy");
  return n.length > 13 ? n.slice(0, 12) + "." : n;
}
function pickKc(acts, name) {
  if (!name || !acts) return null;
  for (var i = 0; i < acts.length; i++) if (acts[i].name === name) return { l: kcLabel(name), s: acts[i].score, k: acts[i].rank, n: name };
  return null;
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
    // the activity names (bosses, clues, minigames) for the settings page's kill-count picker
    var acts = j.activities || [];
    if (acts.length) try { localStorage.setItem("acts", JSON.stringify(acts.map(function (a) { return a.name; }))); } catch (e) {}
    c.kc = pickKc(acts, getCfg().kcName);
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

// ---------------------------------------------------------------- Grand Exchange price watch
var WIKI = "https://prices.runescape.wiki/api/v1/osrs/";
var lastGe = 0;
function geNeeded(c) { return !!c.geItem && (c.hsMode === "ge" || c.cm.indexOf("g") >= 0); }
function geId(name, ok, fail) {
  var cache = null; try { cache = JSON.parse(localStorage.getItem("geId") || "null"); } catch (e) {}
  if (cache && cache.q === name.toLowerCase()) { ok(cache.id, cache.n); return; }
  get(WIKI + "mapping", function (list) {
    var q = name.toLowerCase(), hit = null, part = null;
    for (var i = 0; i < list.length; i++) {
      var nm = String(list[i].name).toLowerCase();
      if (nm === q) { hit = list[i]; break; }
      if (!part && nm.indexOf(q) >= 0) part = list[i];
    }
    hit = hit || part;
    if (!hit) { fail("item not found"); return; }
    localStorage.setItem("geId", JSON.stringify({ q: q, id: hit.id, n: hit.name }));
    ok(hit.id, hit.name);
  }, function () { fail(null); });
}
function fetchGe(then) {
  var c = getCfg();
  if (!geNeeded(c)) { data.ge = null; if (then) then(); return; }
  geId(c.geItem, function (id, name) {
    get(WIKI + "latest?id=" + id, function (j) {
      var it = (j.data || {})[id] || {}, p = it.high || it.low || 0;
      get(WIKI + "timeseries?timestep=24h&id=" + id, function (ts) {
        var pts = (ts.data || []).filter(function (x) { return x.avgHighPrice; }), y = pts.length > 1 ? pts[pts.length - 2].avgHighPrice : 0;
        data.ge = { n: name.length > 13 ? name.slice(0, 12) + "." : name, p: p, c: y ? Math.round((p - y) * 1000 / y) / 10 : 0, at: now() };
        lastGe = now(); if (then) then();
      }, function () { data.ge = { n: name, p: p, c: 0, at: now() }; lastGe = now(); if (then) then(); });
    }, function (e) { console.log("ge price failed " + e); if (then) then(); });
  }, function (err) {
    if (err) data.ge = { err: err };              // a real "not found"; network trouble keeps the last price
    if (then) then();
  });
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
  var c = getCfg(), pending = 3;
  function done() {
    if (--pending || busy !== round) return;
    busy = 0; sendData();
    if (again) { again = false; refresh(false); }
  }
  if (force || now() - lastWx >= c.wxMin * 60 - 30) fetchWeather(done); else done();
  if (force || now() - lastHs >= 3 * 3600 - 60) fetchHiscores(done); else done();
  if (force || now() - lastGe >= 30 * 60 - 30 || (geNeeded(c) && !data.ge)) fetchGe(done); else done();
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
    .replace("__ACTS__", function () { var a = null; try { a = JSON.parse(localStorage.getItem("acts") || "null"); } catch (e) {} return json(a); })
    .replace("__PLATFORM__", function () { var p = "emery"; try { p = Pebble.getActiveWatchInfo().platform || p; } catch (e) {} return json(p); })
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
  c.cm = String(c.cm).replace(new RegExp("[^" + CM_LETTERS + "]", "g"), "");
  if (["stone", "dark", "bright"].indexOf(c.theme) < 0) c.theme = "stone";
  c.helm = c.helm !== false;
  c.kcName = String(c.kcName || ""); c.geItem = String(c.geItem || "").trim();
  c.cmv = 2;
  if (!c.osrsOn && !c.rs3On) c.osrsOn = true;
  setCfg(c);
  sendCfg();
  if (c.osrsName !== old.osrsName || c.osrsAcct !== old.osrsAcct || c.osrsOn !== old.osrsOn ||
      c.rs3Name !== old.rs3Name || c.rs3Acct !== old.rs3Acct || c.rs3On !== old.rs3On) lastHs = 0;
  if (c.loc !== old.loc || c.city !== old.city || c.units !== old.units) lastWx = 0;
  if (c.kcName !== old.kcName) lastHs = 0;
  if (c.geItem !== old.geItem || geNeeded(c) !== geNeeded(old)) { lastGe = 0; localStorage.removeItem("geId"); if (!c.geItem) data.ge = null; }
  refresh(false);
});
