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
  stepGoal: 8000, sleepGoal: 8, chat: true,   // the clock follows the watch's 12/24-hour setting
};
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
  for (var k in DEFAULTS) c[k] = (k in s && s[k] !== undefined) ? s[k] : DEFAULTS[k];
  return c;
}
function setCfg(c) { localStorage.setItem("cfg", JSON.stringify(c)); }
function cfgForWatch(c) {
  return { stepGoal: c.stepGoal, sleepGoal: c.sleepGoal,
    hsMode: c.hsMode, skill: c.osrsSkill, skill3: c.rs3Skill, swap: c.swap, rotMin: c.rotMin, chat: c.chat, units: c.units };
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
// Every choice is a row of buttons in the page, not a <select>: the webview's own pop-up opened
// at the top of the screen and then jumped to the field. The skill list (24 or 29 names) opens as
// a grid in place under its button. Anything that appears or hides sits below the control that
// changes it, so nothing above your finger moves.
function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;"); }
// A row of buttons for setting k. opts = [[value, label], ...]; cls "seg" = side by side, "list" =
// stacked; after[value] = html placed straight after that option's button.
function choice(k, opts, cls, after) {
  var b = '<div class="' + (cls || "seg") + '" data-k="' + k + '">';
  for (var i = 0; i < opts.length; i++) {
    b += '<button type="button" data-v="' + opts[i][0] + '">' + opts[i][1] + "</button>";
    if (after && after[opts[i][0]]) b += after[opts[i][0]];
  }
  return b + "</div>";
}
function configHtml(c) {
  var ROT = [[1, "1 min"], [5, "5 min"], [15, "15 min"], [60, "1 hour"]];
  var h = '<!DOCTYPE html><html><head><meta charset="utf-8">';
  h += '<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">';
  h += "<style>";
  h += "html{scroll-padding:60px 0 90px}";   // scrolling a skill grid into view clears the sticky tabs and Save bar
  h += "*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}body{margin:0;background:#1b1712;color:#f4e9c8;font:15px/1.35 -apple-system,Roboto,sans-serif}";
  h += "header{background:#3e3529;border-bottom:3px solid #000;padding:14px 16px}h1{margin:0;font-size:19px;color:#ff0;text-shadow:2px 2px 0 #000}.sub{color:#ff981f;font-size:12px}";
  h += "button{font:inherit;color:inherit;touch-action:manipulation;cursor:pointer}";
  h += ".tabs{display:flex;position:sticky;top:0;z-index:2;background:#2b2620;border-bottom:2px solid #000}";
  h += ".tabs button{flex:1;padding:11px 4px;background:none;border:0;border-right:1px solid #000;color:#c8b98f;font-weight:600}.tabs button.on{background:#5a4f3c;color:#ff0}";
  h += ".pane{display:none;padding:2px 16px 16px}.pane.on{display:block}label,.lab{display:block;margin:14px 0 6px;color:#ff981f;font-size:13px;font-weight:600}";
  h += "input{width:100%;padding:10px;background:#0f0d0a;color:#f4e9c8;border:1px solid #5a4f3c;border-radius:4px;font:inherit}";
  h += ".seg{display:flex;border:2px solid #000;border-radius:4px;overflow:hidden}.seg button{flex:1;min-width:0;padding:10px 2px;background:#0f0d0a;border:0;border-left:1px solid #3e3529;color:#c8b98f;font-size:14px}.seg button:first-child{border-left:0}";
  h += ".list>button{display:block;width:100%;text-align:left;padding:10px 12px;margin-top:4px;background:#0f0d0a;border:2px solid #000;border-radius:4px;color:#c8b98f}";
  h += ".seg button.on,.list>button.on{background:#5a4f3c;color:#ff0;font-weight:600}.list>button.on{box-shadow:inset 5px 0 0 #ff981f}";
  h += ".inl{margin:6px 0 8px 14px}.inl .lab{margin:0 0 4px}";
  h += ".game{background:#2b2620;border:1px solid #000;border-radius:4px;padding:2px 12px 12px;margin:16px 0 0}";
  h += ".tog{display:flex;align-items:center;gap:10px;color:#ff0;font-size:15px;margin:10px 0 2px}.tog input{width:22px;height:22px;margin:0;accent-color:#ff0}";
  h += ".pick{display:block;width:100%;text-align:left;padding:10px;background:#0f0d0a;border:1px solid #5a4f3c;border-radius:4px}.pick:after{content:'';float:right;margin-top:7px;border:6px solid transparent;border-top-color:#ff981f}";
  h += ".grid{display:none;grid-template-columns:repeat(3,1fr);gap:4px;margin-top:6px}.grid.open{display:grid}";
  h += ".grid button{padding:9px 2px;background:#0f0d0a;border:1px solid #3e3529;border-radius:3px;color:#c8b98f;font-size:12px;overflow-wrap:anywhere}.grid button.on{background:#5a4f3c;color:#ff0}";
  h += ".mini{color:#9c8f6e;font-size:12px;margin-top:8px}";
  h += ".foot{position:sticky;bottom:0;padding:10px 16px 14px;background:#1b1712;border-top:2px solid #000}";
  h += "#save{display:block;width:100%;padding:13px;background:#ff0;color:#000;font-weight:700;border:2px solid #000;border-radius:4px;font-size:16px}";
  h += "</style></head><body>";
  h += '<header><h1>Gielinor HUD</h1><div class="sub">v' + APP_VERSION + " - fan-made, not affiliated with Jagex</div></header>";
  h += '<div class="tabs"><button type="button" class="on" data-p="hs">Hiscores</button><button type="button" data-p="wx">Weather</button>' +
    '<button type="button" data-p="hl">Health</button><button type="button" data-p="fc">Face</button></div>';
  // hiscores: what the panel shows, a card per game, then how two games share the panel
  function gameBlock(g, title, accts, on, name, note) {
    var b = '<div class="game"><label class="tog"><input type="checkbox" id="' + g + 'On"' + (on ? " checked" : "") + "> " + title + "</label>";
    b += '<div id="' + g + 'Box"><label for="' + g + 'Name">Character name</label><input id="' + g + 'Name" maxlength="12" value="' + esc(name) +
      '" placeholder="e.g. Zezima" autocapitalize="off" autocorrect="off" spellcheck="false">';
    b += '<div class="lab">Account type</div>' + choice(g + "Acct", accts);
    b += '<div class="skRow"><div class="lab">Skill</div><button type="button" class="pick" data-g="' + g + '"></button><div class="grid" id="' + g + 'Grid"></div></div>';
    if (note) b += '<div class="mini">' + note + "</div>";
    return b + "</div></div>";
  }
  var AC = [["main", "Regular"], ["iron", "Ironman"], ["hcim", "Hardcore"]];
  h += '<div class="pane on" id="hs">';
  h += '<div class="lab">Panel shows</div>' + choice("hsMode", [["pick", "One skill and your total level"], ["rotate", "Rotate through skills"],
    ["next", "Skill closest to a level-up"], ["today", "XP gained today"]], "list",
    { rotate: '<div class="inl" id="rotA"><div class="lab">Every</div>' + choice("rotMin", ROT) + "</div>" });
  h += gameBlock("osrs", "Old School RuneScape", AC.concat([["uim", "Ultimate"]]), c.osrsOn, c.osrsName, "");
  h += gameBlock("rs3", "RuneScape 3", AC, c.rs3On, c.rs3Name, "Reads your RuneMetrics profile (set it to public in RuneScape), then the hiscores.");
  h += '<div id="swapRow"><div class="lab">With both games on</div>' + choice("swap", [["min", "Switch game every minute"],
    ["rot", "Switch game at the rotate speed"], ["chat", "Old School in the panel, RS3 in the chatbox"]], "list",
    { rot: '<div class="inl" id="rotB"><div class="lab">Every</div>' + choice("rotMin", ROT) + "</div>" }) + "</div>";
  h += '<div class="mini">Hiscores refresh every 3 hours. "XP gained today" counts from your first refresh after midnight.</div>';
  h += "</div>";
  // weather
  h += '<div class="pane" id="wx">';
  h += '<div class="lab">Location</div>' + choice("loc", [["gps", "Phone GPS"], ["city", "A city I type"]]);
  h += '<div id="cityRow"><label for="city">City</label><input id="city" value="' + esc(c.city) + '" placeholder="e.g. Varrock... or London"></div>';
  h += '<div class="lab">Units</div>' + choice("units", [["C", "Celsius"], ["F", "Fahrenheit"]]);
  h += '<div class="lab">Refresh every</div>' + choice("wxMin", [[15, "15 min"], [30, "30 min"], [60, "1 hour"]]);
  h += '<div class="mini">Weather by Open-Meteo.com (CC BY 4.0).</div></div>';
  // health
  h += '<div class="pane" id="hl">';
  h += '<label for="stepGoal">Daily step goal (Run orb)</label><input id="stepGoal" type="number" inputmode="numeric" min="1000" step="500" value="' + c.stepGoal + '">';
  h += '<label for="sleepGoal">Sleep goal in hours (Special orb)</label><input id="sleepGoal" type="number" inputmode="decimal" min="4" max="12" step="0.5" value="' + c.sleepGoal + '">';
  h += '<div class="mini">HP orb = battery, Prayer orb = heart rate, Run orb = steps toward your goal, Special orb = sleep.</div></div>';
  // face
  h += '<div class="pane" id="fc">';
  h += '<div class="lab">Chatbox</div>' + choice("chat", [["true", "Messages"], ["false", "Date only"]]);
  h += "</div>";
  h += '<div class="foot"><button type="button" id="save">Save</button></div>';
  // S = the settings being edited; buttons change it, Save sends it back with the typed fields
  h += "<script>";
  h += "var S=" + JSON.stringify(c).replace(/</g, "\\u003c") + ",SK={osrs:" + JSON.stringify(SKILLS) + ",rs3:" + JSON.stringify(RS3_SKILLS) + "};";
  h += "function $(i){return document.getElementById(i)}function all(q){return document.querySelectorAll(q)}function show(i,on){$(i).style.display=on?'':'none'}";
  h += "function paint(){var g=all('[data-k]'),i,j;for(i=0;i<g.length;i++){var k=g[i].getAttribute('data-k'),c=g[i].children;";
  h += "for(j=0;j<c.length;j++){var v=c[j].getAttribute('data-v');if(v!==null)c[j].className=v===String(S[k])?'on':''}}";
  h += "var p=all('.pick');for(i=0;i<p.length;i++){var n=p[i].getAttribute('data-g');p[i].textContent=SK[n][S[n+'Skill']]||SK[n][0]}";
  h += "var m=S.hsMode,o=$('osrsOn').checked,r=$('rs3On').checked;show('rotA',m=='rotate');show('rotB',o&&r&&S.swap=='rot'&&m!='rotate');";
  h += "show('swapRow',o&&r);show('osrsBox',o);show('rs3Box',r);show('cityRow',S.loc=='city');";
  h += "var s=all('.skRow');for(i=0;i<s.length;i++)s[i].style.display=m=='pick'?'':'none'}";
  h += "function grid(n){var el=$(n+'Grid'),open=el.className!='grid open',gs=all('.grid'),i,h='';for(i=0;i<gs.length;i++)gs[i].className='grid';if(!open)return;";
  h += "for(i=0;i<SK[n].length;i++)h+='<button type=\"button\" data-s=\"'+i+'\"'+(i==S[n+'Skill']?' class=\"on\"':'')+'>'+SK[n][i]+'</button>';el.innerHTML=h;el.className='grid open';";
  h += "if(el.scrollIntoView)el.scrollIntoView({block:'nearest',behavior:'smooth'})}";
  h += "document.addEventListener('click',function(e){var b=e.target.closest?e.target.closest('button'):null;if(!b)return;var t=b.parentNode,k=t.getAttribute('data-k'),v=b.getAttribute('data-v'),i;";
  h += "if(b.hasAttribute('data-p')){var tb=all('.tabs button');for(i=0;i<tb.length;i++){tb[i].className='';$(tb[i].getAttribute('data-p')).className='pane'}";
  h += "b.className='on';$(b.getAttribute('data-p')).className='pane on';return}";
  h += "if(k&&v!==null){S[k]=typeof S[k]=='number'?+v:typeof S[k]=='boolean'?v=='true':v;paint();return}";
  h += "if(b.hasAttribute('data-g')){grid(b.getAttribute('data-g'));return}";
  h += "if(b.hasAttribute('data-s')){S[t.id.slice(0,-4)+'Skill']=+b.getAttribute('data-s');t.className='grid';paint()}});";
  h += "$('osrsOn').onchange=$('rs3On').onchange=paint;paint();";
  h += "$('save').onclick=function(){var o={},k;for(k in S)o[k]=S[k];o.osrsOn=$('osrsOn').checked;o.osrsName=$('osrsName').value.trim();";
  h += "o.rs3On=$('rs3On').checked;o.rs3Name=$('rs3Name').value.trim();o.city=$('city').value.trim();o.stepGoal=+$('stepGoal').value;o.sleepGoal=+$('sleepGoal').value;";
  h += "location.href='pebblejs://close#'+encodeURIComponent(JSON.stringify(o))}";
  h += "</script></body></html>";
  return h;
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
  c.stepGoal = Math.min(100000, Math.max(1000, Math.round(+c.stepGoal) || DEFAULTS.stepGoal));
  c.sleepGoal = Math.min(12, Math.max(4, +c.sleepGoal || DEFAULTS.sleepGoal));
  setCfg(c);
  sendCfg();
  if (c.osrsName !== old.osrsName || c.osrsAcct !== old.osrsAcct || c.osrsOn !== old.osrsOn ||
      c.rs3Name !== old.rs3Name || c.rs3Acct !== old.rs3Acct || c.rs3On !== old.rs3On) lastHs = 0;
  if (c.loc !== old.loc || c.city !== old.city || c.units !== old.units) lastWx = 0;
  refresh(false);
});
