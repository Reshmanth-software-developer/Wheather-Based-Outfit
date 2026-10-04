const $ = s => document.querySelector(s);
const WMO = {0:["Clear sky","☀️"],1:["Mostly clear","🌤️"],2:["Partly cloudy","⛅"],3:["Overcast","☁️"],45:["Fog","🌫️"],48:["Fog","🌫️"],
 51:["Light drizzle","🌦️"],53:["Drizzle","🌦️"],55:["Heavy drizzle","🌧️"],61:["Light rain","🌦️"],63:["Rain","🌧️"],65:["Heavy rain","🌧️"],
 71:["Light snow","🌨️"],73:["Snow","❄️"],75:["Heavy snow","❄️"],80:["Showers","🌦️"],81:["Showers","🌧️"],82:["Violent showers","⛈️"],
 95:["Thunderstorm","⛈️"],96:["Thunderstorm, hail","⛈️"],99:["Severe thunderstorm","⛈️"]};
const wmo = c => WMO[c] || WMO[Object.keys(WMO).filter(k => k <= c).pop()] || ["Unknown","🌡️"];
const PRESETS = [["Hyderabad",17.385,78.4867],["New Delhi",28.6139,77.209],["Mumbai",19.076,72.8777],["Bengaluru",12.9716,77.5946],["Chennai",13.0827,80.2707],["Kolkata",22.5726,88.3639]];
const CLIMATE = {
 Hyderabad:{avg:"26.6°C",rain:"~800 mm/yr",season:"Hot summers, monsoon Jun–Sep, mild winters",warm:"+0.8°C since 1980",risk:"Urban flooding, heatwaves",
  t:[22,25,29,32,34,30,27,26,26,25,23,21],r:[5,8,12,25,35,100,150,140,150,90,25,5]},
 "New Delhi":{avg:"25.2°C",rain:"~790 mm/yr",season:"Extreme summers, monsoon Jul–Sep, cold foggy winters",warm:"+0.9°C since 1980",risk:"Heatwaves, cold waves, smog",
  t:[14,17,23,29,33,34,31,30,29,26,20,15],r:[20,20,15,10,20,70,210,230,120,15,5,10]},
 Mumbai:{avg:"27.2°C",rain:"~2,400 mm/yr",season:"Humid, heavy monsoon Jun–Sep",warm:"+0.7°C since 1980",risk:"Flooding, cyclones, sea-level rise",
  t:[24,25,27,29,30,29,27,27,27,28,27,25],r:[1,1,1,2,15,520,710,430,320,70,15,3]},
 Bengaluru:{avg:"24.1°C",rain:"~970 mm/yr",season:"Pleasant year-round, two rainy peaks",warm:"+0.6°C since 1980",risk:"Flash floods, water stress",
  t:[22,24,26,28,27,25,24,24,24,24,22,21],r:[2,5,8,45,110,80,110,140,180,160,60,15]}};
const MONTHS = "JFMAMJJASOND".split("");
let state = {unit:"C", w:null, place:"", activity:"Casual", sim:null};
let history = [];

const conv = c => state.unit === "C" ? Math.round(c) : Math.round(c * 9 / 5 + 32);
const deg = c => conv(c) + "°" + state.unit;
const hhmm = s => new Date(s).toLocaleTimeString([], {hour:"2-digit", minute:"2-digit"});
const isRain = c => (c >= 51 && c <= 67) || (c >= 80 && c <= 82) || c >= 95;
const isSnow = c => (c >= 71 && c <= 77) || c === 85 || c === 86;
function sky(code, day) {
  let [label, ico] = wmo(code);
  if (!day) { if (code <= 1) { ico = "🌙"; label = code ? "Mostly clear night" : "Clear night"; } else if (code === 2) ico = "☁️"; }
  return [label, ico];
}
function dayAt(t) { const d = state.w.daily, i = d.time.indexOf(t.slice(0, 10)); return i < 0 ? true : t >= d.sunrise[i] && t < d.sunset[i]; }
const humLabel = h => h < 30 ? "Dry" : h < 60 ? "Comfortable" : h < 80 ? "Humid" : "Very humid";
const compass = d => ["N","NE","E","SE","S","SW","W","NW"][Math.round(d / 45) % 8];

async function getJSON(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error("Weather service is unreachable. Try again shortly."); return r.json();
}
async function geocode(q) {
  if (q.trim().length < 2) return [];
  const d = await getJSON("https://geocoding-api.open-meteo.com/v1/search" + "?count=5&language=en&name=" + encodeURIComponent(q));
  return (d.results || []).map(i => ({name:i.name, region:i.admin1 || "", country:i.country || "", lat:i.latitude, lon:i.longitude}));
}
function weatherApi(lat, lon) {
  const p = new URLSearchParams({latitude:lat, longitude:lon, timezone:"auto", forecast_days:7,
    current:"temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,wind_direction_10m,surface_pressure,is_day,visibility,precipitation",
    hourly:"temperature_2m,precipitation_probability,weather_code,wind_speed_10m",
    daily:"weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max,sunrise,sunset,uv_index_max"});
  return getJSON("https://api.open-meteo.com/v1/forecast?" + p);
}
function answer(msg, c) {
  const m = msg.toLowerCase(), t = c.temp, rain = c.rain || 0, wind = c.wind || 0, place = c.place || "your location";
  if (t === undefined) return "Load a city first, then ask me again.";
  if (/humid|moist|dry/.test(m)) return `Humidity in ${place} is ${c.humidity}% (${humLabel(c.humidity)}).`;
  if (/rain|umbrella/.test(m)) return `Rain chance in ${place} is ${rain}% today. ` + (rain >= 40 ? "Carry an umbrella." : "You can probably skip the umbrella.");
  if (/wear|outfit|cloth/.test(m)) { const o = outfit(); return `It is ${t}°C. Suggested: ` + o.map(x => x[0]).join(", ") + "."; }
  if (/travel|safe/.test(m)) return c.alerts[0] === "No active hazards" ? "Conditions look fine for travel right now." : "Be careful: " + c.alerts.join(", ") + ". Check the Alerts section before travelling.";
  if (/weekend|week|forecast/.test(m)) return "Upcoming days: " + c.weekend.slice(0, 7).map(d => `${new Date(d.day).toLocaleDateString([], {weekday:"short"})} ${Math.round(d.max)}°C, ${d.rain}% rain`).join("; ") + ".";
  if (/tomorrow/.test(m)) return `Tomorrow in ${place}: ${Math.round(c.tomorrow.min)}–${Math.round(c.tomorrow.max)}°C with ${c.tomorrow.rain}% chance of rain.`;
  if (/climate/.test(m)) { const k = Object.keys(CLIMATE).find(n => m.includes(n.toLowerCase())) || "Hyderabad"; const x = CLIMATE[k]; return `${k}: average ${x.avg}, rainfall ${x.rain}. ${x.season}. Risks: ${x.risk}.`; }
  return `${place}: ${t}°C (feels ${c.feels}°C), ${c.condition}, rain chance ${rain}%, wind ${wind} km/h, humidity ${c.humidity}%. Ask about rain, clothing, travel or climate.`;
}
function status(msg, err) { const s = $("#status"); s.textContent = msg; s.className = "status" + (err ? " err" : ""); s.hidden = !msg; }

const KEY = "wg_loc", REFRESH_MS = 60 * 1000;
let cur = null, lastOk = 0, syncErr = false, prevTemp = null;
const saved = () => { try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; } };
const save = o => { try { localStorage.setItem(KEY, JSON.stringify(o)); } catch {} };

async function loadWeather(lat, lon, name, o = {}) {
  lat = +lat; lon = +lon;
  if (!o.silent) { status("Loading weather…"); $("#liveBox").hidden = true; }
  try {
    state.w = await weatherApi(lat, lon); state.place = name || state.place; lastOk = Date.now(); syncErr = false;
    cur = {lat, lon, name: state.place};
    if (!o.silent) save({...cur, auto: !!o.auto});
    status(""); $("#liveBox").hidden = false; renderAll();
    if (!o.silent && o.scroll !== false) $("#live").scrollIntoView({behavior:"smooth"});
  } catch (e) {
    if (o.silent) syncErr = true;
    else status(e.message, true);
  }
}
const refresh = () => cur && loadWeather(cur.lat, cur.lon, cur.name, {silent:true});

async function revName(lat, lon) {
  try { const d = await getJSON(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`);
    return [d.city || d.locality, d.countryName].filter(Boolean).join(", ") || "Your location"; } catch { return "Your location"; }
}

function tickClock() {
  if (!state.w) return;
  const tz = state.w.timezone, f = o => new Date().toLocaleString([], {timeZone: tz, ...o});
  $("#date").textContent = f({weekday:"long", day:"numeric", month:"long", hour:"2-digit", minute:"2-digit", second:"2-digit"});
  const hc = $("#heroClock"); if (hc) hc.textContent = f({hour:"2-digit", minute:"2-digit", second:"2-digit"}) + " local";
  const left = Math.max(0, Math.ceil((lastOk + REFRESH_MS - Date.now()) / 1000));
  $("#updated").textContent = syncErr ? "Sync failed. Retrying automatically…"
    : `Synced ${new Date(lastOk).toLocaleTimeString([], {hour:"2-digit", minute:"2-digit", second:"2-digit"})} · next sync in ${left}s`;
}

function renderAll() { renderLive(); renderMap(); renderForecast(); renderAlerts(); renderOutfit(); }

function renderLive() {
  const c = state.w.current, d = state.w.daily, [label, ico] = sky(c.weather_code, c.is_day);
  applyTheme(c);
  $("#place").textContent = state.place;
  $("#temp").textContent = deg(c.temperature_2m); $("#cond").textContent = label;
  $("#icon").textContent = ico;
  $("#heroNow").hidden = false;
  $("#heroNow").innerHTML = `<div class="n-ico">${ico}</div><div><b>${deg(c.temperature_2m)}</b><span>${state.place}</span><small>💧 ${c.relative_humidity_2m}% humidity</small><small id="heroClock"></small></div>`;
  const tNow = deg(c.temperature_2m);
  if (prevTemp !== null && prevTemp !== tNow) document.querySelectorAll("#temp,#heroNow b").forEach(e => { e.classList.remove("flash"); void e.offsetWidth; e.classList.add("flash"); });
  prevTemp = tNow;
  tickClock();
  $("#hilo").textContent = `High ${deg(d.temperature_2m_max[0])} · Low ${deg(d.temperature_2m_min[0])}`;
  const rain = d.precipitation_probability_max[0];
  const items = [["Feels like", deg(c.apparent_temperature)],["Humidity", c.relative_humidity_2m],
    ["Wind", `${c.wind_speed_10m} km/h ${compass(c.wind_direction_10m)}`],["Rain probability", rain + "%"],
    ["Visibility", (c.visibility / 1000).toFixed(1) + " km"],["Pressure", Math.round(c.surface_pressure) + " hPa"],
    ["Sunrise", hhmm(d.sunrise[0])],["Sunset", hhmm(d.sunset[0])],["UV index", d.uv_index_max[0]]];
  $("#cards").innerHTML = items.map(([k, v]) => k === "Humidity"
    ? `<div class="card hum"><small>💧 Humidity · ${humLabel(v)}</small><b>${v}%</b><div class="meter"><i style="width:${v}%"></i></div></div>`
    : `<div class="card"><small>${k}</small><b>${v}</b></div>`).join("");
}

function line(svg, vals, labels, fmt) {
  const W = 600, H = 200, p = 28, mn = Math.min(...vals), mx = Math.max(...vals), rg = mx - mn || 1;
  const pts = vals.map((v, i) => [p + i * (W - 2 * p) / (vals.length - 1), H - p - (v - mn) / rg * (H - 2 * p)]);
  const path = pts.map((q, i) => (i ? "L" : "M") + q[0].toFixed(1) + " " + q[1].toFixed(1)).join(" ");
  const area = path + ` L${pts.at(-1)[0]} ${H - p} L${pts[0][0]} ${H - p} Z`;
  svg.innerHTML = `<path d="${area}" fill="rgba(29,111,232,.15)"/><path d="${path}" fill="none" stroke="#1d6fe8" stroke-width="3"/>` +
    pts.map((q, i) => `<circle cx="${q[0]}" cy="${q[1]}" r="4" fill="#1d6fe8"><title>${labels[i]}: ${fmt(vals[i])}</title></circle>` +
      (i % 4 === 0 ? `<text x="${q[0]}" y="${H - 8}" text-anchor="middle">${labels[i]}</text>` : "")).join("");
}

function renderForecast() {
  const h = state.w.hourly, now = state.w.current.time.slice(0, 13);
  let i0 = h.time.findIndex(t => t.slice(0, 13) >= now); if (i0 < 0) i0 = 0;
  const idx = [...Array(24).keys()].map(i => i0 + i).filter(i => i < h.time.length);
  $("#hourly").innerHTML = idx.map(i => `<div class="card"><small>${hhmm(h.time[i])}</small><div>${sky(h.weather_code[i], dayAt(h.time[i]))[1]}</div>
    <b>${deg(h.temperature_2m[i])}</b><small>💧${h.precipitation_probability[i]}% · ${Math.round(h.wind_speed_10m[i])} km/h</small></div>`).join("");
  const labels = idx.map(i => hhmm(h.time[i]));
  if (idx.length > 1) {
    line($("#tempChart"), idx.map(i => conv(h.temperature_2m[i])), labels, v => v + "°" + state.unit);
    const W = 600, H = 200, p = 28, bw = (W - 2 * p) / idx.length;
    $("#rainChart").innerHTML = idx.map((i, k) => { const v = h.precipitation_probability[i], bh = v / 100 * (H - 2 * p);
      return `<rect x="${p + k * bw + 2}" y="${H - p - bh}" width="${bw - 4}" height="${bh}" rx="3" fill="#5fb3ff"><title>${labels[k]}: ${v}%</title></rect>` +
        (k % 4 === 0 ? `<text x="${p + k * bw}" y="${H - 8}">${labels[k]}</text>` : ""); }).join("");
  }
  const d = state.w.daily;
  $("#daily").innerHTML = d.time.map((t, i) => `<div class="card"><small>${i ? new Date(t).toLocaleDateString([], {weekday:"short", day:"numeric"}) : "Today"}</small>
    <div style="font-size:1.8rem">${wmo(d.weather_code[i])[1]}</div><b>${deg(d.temperature_2m_max[i])}</b><small>Low ${deg(d.temperature_2m_min[i])}</small>
    <div class="bar"></div><small>💧 ${d.precipitation_probability_max[i]}% · 🌬 ${Math.round(d.wind_speed_10m_max[i])} km/h</small></div>`).join("");
}

function buildAlerts() {
  const c = state.w.current, d = state.w.daily, out = [], rain = d.precipitation_probability_max[0], t = c.temperature_2m;
  const wind = Math.max(c.wind_speed_10m, d.wind_speed_10m_max[0]), code = c.weather_code, vis = c.visibility / 1000;
  if (code >= 95) out.push(["severe","Thunderstorm", "Thunderstorm activity detected. Stay indoors, avoid open fields and tall trees."]);
  if (rain >= 80 || c.precipitation >= 7) out.push(["severe","Heavy rainfall / flood risk", "Avoid low-lying areas and flooded roads. Keep emergency supplies ready."]);
  else if (rain >= 50) out.push(["warning","Rain likely", "Carry an umbrella and allow extra travel time."]);
  if (wind >= 60) out.push(["severe","Cyclone-level winds", "Secure loose objects and avoid coastal travel."]);
  else if (wind >= 35) out.push(["warning","Strong winds", "Take care when riding or driving high-sided vehicles."]);
  if (t >= 42) out.push(["severe","Heatwave", "Stay hydrated, avoid outdoor work 11am–4pm."]);
  else if (t >= 36) out.push(["warning","High heat", "Drink water often and wear light clothing."]);
  if (t <= 4) out.push(["severe","Cold wave", "Layer up, protect elderly people and limit time outdoors."]);
  else if (t <= 10) out.push(["warning","Cold weather", "Wear warm layers."]);
  if (vis < 1) out.push(["warning","Poor visibility", "Use low-beam lights and slow down."]);
  if (d.uv_index_max[0] >= 8) out.push(["warning","Very high UV", "Use sunscreen and sunglasses."]);
  if (!out.length) out.push(["info","No active hazards", "Conditions are normal for " + state.place + "."]);
  return out;
}
let sev = "all";
function renderAlerts() {
  if (!state.w) { $("#alertList").innerHTML = `<div class="status">Load a city to see alerts.</div>`; return; }
  const list = buildAlerts().filter(a => sev === "all" || a[0] === sev);
  $("#alertList").innerHTML = list.length ? list.map(([s, ti, tx]) => `<div class="alert ${s}"><span class="dot"></span><div><b>${ti}</b><br>${tx}</div></div>`).join("")
    : `<div class="status">No ${sev} alerts for ${state.place}.</div>`;
}

const OUTFITS = {Casual:"Everyday comfort", Formal:"Office or events", Sports:"Active wear", Travel:"On the move"};
function outfit() {
  const t = state.sim ? state.sim.t : (state.w ? state.w.current.temperature_2m : null);
  if (t === null) return null;
  const rain = state.sim ? state.sim.r : state.w.daily.precipitation_probability_max[0];
  const wind = state.w ? state.w.current.wind_speed_10m : 0, items = [];
  if (t >= 30) items.push(["T-shirt","Light cotton keeps you cool"], ["Cap","Shade from strong sun"]);
  else if (t >= 22) items.push(["T-shirt","Comfortable at this temperature"]);
  else if (t >= 15) items.push(["Shirt","Long sleeves for mild weather"]);
  else if (t >= 5) items.push(["Sweater","Warm mid-layer"], ["Jacket","Block the chill"]);
  else items.push(["Thermal wear","Base layer for freezing weather"], ["Jacket","Insulated outer layer"], ["Gloves","Protect your hands"], ["Scarf","Keep your neck warm"], ["Boots","Warm, grippy footwear"]);
  items.push(t >= 25 ? ["Shorts or light trousers","Breathable"] : ["Jeans","Good for cool days"]);
  if (rain >= 40) items.push(["Umbrella", rain + "% chance of rain"], ["Waterproof shoes","Keep feet dry"]);
  if (wind >= 30) items.push(["Windcheater","Strong wind expected"]);
  if (state.activity === "Formal") items.push(["Blazer or formal shirt","Suits the occasion"]);
  if (state.activity === "Sports") items.push(["Sports shoes","Grip and support"]);
  if (state.activity === "Travel") items.push(["Light backpack","Carry water and a rain cover"]);
  return items;
}
function renderOutfit() {
  const sims = [["Live",null],["Freezing 1°C",{t:1,r:10}],["Monsoon rain",{t:24,r:90}],["Heatwave 41°C",{t:41,r:0}]];
  $("#activity").innerHTML = Object.keys(OUTFITS).map(a => `<button class="chip ${a === state.activity ? "on" : ""}" data-act="${a}" title="${OUTFITS[a]}">${a}</button>`).join("") +
    sims.map(([n, v]) => `<button class="chip ${(state.sim === v || (!state.sim && !v)) ? "on" : ""}" data-sim="${n}">${n}</button>`).join("");
  const o = outfit();
  $("#outfitCards").innerHTML = o ? o.map(([n, w]) => `<div class="card"><b>${n}</b><small>${w}</small></div>`).join("")
    : `<div class="status">Load a city or pick a test preset to get recommendations.</div>`;
  $("#activity").dataset.sims = JSON.stringify(sims);
}
$("#activity").onclick = e => {
  const b = e.target.closest("button"); if (!b) return;
  if (b.dataset.act) state.activity = b.dataset.act;
  if (b.dataset.sim) state.sim = JSON.parse($("#activity").dataset.sims).find(s => s[0] === b.dataset.sim)[1];
  renderOutfit();
};

let cityKey = "Hyderabad";
function renderClimate() {
  $("#climateTabs").innerHTML = Object.keys(CLIMATE).map(k => `<button class="chip ${k === cityKey ? "on" : ""}" data-c="${k}">${k}</button>`).join("");
  const c = CLIMATE[cityKey];
  $("#climateCards").innerHTML = [["Average temperature", c.avg],["Rainfall trends", c.rain],["Seasonal pattern", c.season],["Climate change", c.warm],["Extreme weather risk", c.risk]]
    .map(([k, v]) => `<div class="card"><small>${k}</small><b style="font-size:1.05rem">${v}</b></div>`).join("");
  const W = 600, H = 220, p = 30, bw = (W - 2 * p) / 12, mr = Math.max(...c.r), mn = Math.min(...c.t) - 2, mx = Math.max(...c.t) + 2;
  const ty = v => H - p - (v - mn) / (mx - mn) * (H - 2 * p);
  $("#climateChart").innerHTML = c.r.map((v, i) => `<rect x="${p + i * bw + 5}" y="${H - p - v / mr * (H - 2 * p)}" width="${bw - 10}" height="${v / mr * (H - 2 * p)}" rx="3" fill="#8ebcf5"><title>${MONTHS[i]}: ${v} mm</title></rect><text x="${p + i * bw + bw / 2}" y="${H - 10}" text-anchor="middle">${MONTHS[i]}</text>`).join("") +
    `<path d="${c.t.map((v, i) => (i ? "L" : "M") + (p + i * bw + bw / 2) + " " + ty(v)).join(" ")}" fill="none" stroke="#f59e0b" stroke-width="3"/>` +
    c.t.map((v, i) => `<circle cx="${p + i * bw + bw / 2}" cy="${ty(v)}" r="3.5" fill="#f59e0b"><title>${MONTHS[i]}: ${v}°C</title></circle>`).join("");
}
$("#climateTabs").onclick = e => { const b = e.target.closest("[data-c]"); if (b) { cityKey = b.dataset.c; renderClimate(); } };
$("#sevTabs").onclick = e => { const b = e.target.closest("[data-sev]"); if (!b) return; sev = b.dataset.sev;
  document.querySelectorAll("#sevTabs .chip").forEach(x => x.classList.toggle("on", x === b)); renderAlerts(); };

/* Chat */
const QUICK = ["Will it rain today?","What should I wear tomorrow?","Is it safe to travel today?","What will the weather be this weekend?","Should I carry an umbrella?","Tell me about the climate in Hyderabad."];
function addMsg(text, who) {
  const d = document.createElement("div"); d.className = "m " + who; d.textContent = text;
  if (who === "b" && "speechSynthesis" in window) {
    const s = document.createElement("button"); s.textContent = "🔊 Read aloud"; s.onclick = () => { speechSynthesis.cancel(); speechSynthesis.speak(new SpeechSynthesisUtterance(text)); }; d.append(s);
    const c = document.createElement("button"); c.textContent = "Copy"; c.onclick = () => navigator.clipboard.writeText(text); d.append(c);
  }
  $("#log").append(d); $("#log").scrollTop = 1e9; return d;
}
function context() {
  if (!state.w) return {place:"unknown (no city loaded)"};
  const c = state.w.current, d = state.w.daily;
  return {place:state.place, temp:Math.round(c.temperature_2m), feels:Math.round(c.apparent_temperature), condition:sky(c.weather_code, c.is_day)[0],
    rain:d.precipitation_probability_max[0], wind:c.wind_speed_10m, humidity:c.relative_humidity_2m, uv:d.uv_index_max[0],
    tomorrow:{max:d.temperature_2m_max[1], min:d.temperature_2m_min[1], rain:d.precipitation_probability_max[1]},
    weekend:d.time.map((t, i) => ({day:t, max:d.temperature_2m_max[i], rain:d.precipitation_probability_max[i]})), alerts:buildAlerts().map(a => a[1])};
}
async function send(text) {
  text = (text || $("#msg").value).trim(); if (!text) return; $("#msg").value = "";
  addMsg(text, "u"); const wait = addMsg("Thinking…", "b");
  try {
    const r = answer(text, context());
    await new Promise(z => setTimeout(z, 350)); wait.remove(); addMsg(r, "b");
  } catch (e) { wait.remove(); addMsg("Sorry, I could not answer: " + e.message, "b"); }
}
function resetChat() { $("#log").innerHTML = ""; addMsg("Hi, I am WeatherGPT. Ask me about rain, clothing, travel or climate.", "b"); }

/* Search + init */
let timer;
$("#q").oninput = e => { clearTimeout(timer); const v = e.target.value;
  timer = setTimeout(async () => { try { const r = await geocode(v);
    $("#suggest").innerHTML = r.map(i => `<li data-lat="${i.lat}" data-lon="${i.lon}" data-n="${i.name}, ${i.country}">${i.name}, ${i.region} ${i.country}</li>`).join("");
    if (r.length && v.trim().length >= 3 && v === $("#q").value) loadWeather(r[0].lat, r[0].lon, `${r[0].name}, ${r[0].country}`, {scroll:false}); } catch {} }, 600); };
$("#suggest").onclick = e => { const li = e.target.closest("li"); if (!li) return; $("#suggest").innerHTML = ""; $("#q").value = li.dataset.n; loadWeather(li.dataset.lat, li.dataset.lon, li.dataset.n); };
function gps() {
  if (!navigator.geolocation) return status("Geolocation is not supported. Search for a city instead.", true);
  status("Detecting your location…");
  navigator.geolocation.getCurrentPosition(async p => loadWeather(p.coords.latitude, p.coords.longitude, await revName(p.coords.latitude, p.coords.longitude), {auto:true}),
    () => status("Location permission denied. Search for a city instead.", true), {timeout:10000});
}
async function searchFirst() {
  const v = $("#q").value.trim(); if (!v) return gps();
  try { const r = await geocode(v); if (!r.length) return status("No city found for “" + v + "”.", true);
    loadWeather(r[0].lat, r[0].lon, `${r[0].name}, ${r[0].country}`); } catch (e) { status(e.message, true); }
}
$("#gps").onclick = gps; $("#checkLive").onclick = $("#navGet").onclick = searchFirst;
$("#q").onkeydown = e => { if (e.key === "Enter") { $("#suggest").innerHTML = ""; searchFirst(); } };
$("#presets").innerHTML = PRESETS.map(p => `<button class="chip" data-p="${p}">${p[0]}</button>`).join("");
$("#presets").onclick = e => { const b = e.target.closest("[data-p]"); if (!b) return; const [n, la, lo] = b.dataset.p.split(","); loadWeather(la, lo, n); };
document.querySelector(".toggle").onclick = e => { const b = e.target.closest("[data-unit]"); if (!b) return; state.unit = b.dataset.unit;
  document.querySelectorAll(".toggle button").forEach(x => x.classList.toggle("on", x === b)); if (state.w) renderAll(); };
$("#burger").onclick = () => $("#menu").classList.toggle("open");
$("#menu").onclick = () => $("#menu").classList.remove("open");
$("#quick").innerHTML = QUICK.map(q => `<button class="chip">${q}</button>`).join("");
$("#quick").onclick = e => { if (e.target.classList.contains("chip")) send(e.target.textContent); };
$("#sendBtn").onclick = () => send(); $("#msg").onkeydown = e => { if (e.key === "Enter") send(); }; $("#reset").onclick = resetChat;
resetChat(); renderClimate(); renderAlerts(); renderOutfit();

/* Auto-open current weather + auto-update */
function fallback(s) { s ? loadWeather(s.lat, s.lon, s.name, {auto:true, scroll:false}) : loadWeather(17.385, 78.4867, "Hyderabad, India", {auto:true, scroll:false}); }
function boot() {
  const s = saved();
  if (s && !s.auto) return loadWeather(s.lat, s.lon, s.name, {scroll:false});
  if (!navigator.geolocation) return fallback(s);
  status("Detecting your location…");
  navigator.geolocation.getCurrentPosition(async p => loadWeather(p.coords.latitude, p.coords.longitude, await revName(p.coords.latitude, p.coords.longitude), {auto:true, scroll:false}),
    () => fallback(s), {timeout:8000, maximumAge:600000});
}
$("#refreshBtn").onclick = refresh;
setInterval(refresh, REFRESH_MS);
setInterval(tickClock, 1000);
document.addEventListener("visibilitychange", () => { if (!document.hidden && cur && Date.now() - lastOk > 30000) refresh(); });
boot();

/* Sky theme: day sun / night moon / rain / snow effects */
function applyTheme(c) {
  const wx = isRain(c.weather_code) ? "rain" : isSnow(c.weather_code) ? "snow" : c.weather_code >= 3 ? "cloud" : "clear";
  const skyName = c.is_day ? "day" : "night";
  document.body.dataset.sky = skyName; document.body.dataset.wx = wx;
  const key = skyName + wx; if (applyTheme.k === key) return; applyTheme.k = key;
  const n = wx === "rain" ? 90 : wx === "snow" ? 60 : skyName === "night" && wx !== "cloud" ? 45 : 0, parts = [];
  for (let i = 0; i < n; i++) {
    const r = Math.random(), L = (r * 100).toFixed(1), dl = (Math.random() * 3).toFixed(2);
    if (wx === "rain") parts.push(`<i class="drop" style="left:${L}%;animation-delay:-${dl}s;animation-duration:${(0.55 + Math.random() * 0.4).toFixed(2)}s"></i>`);
    else if (wx === "snow") parts.push(`<i class="flake" style="left:${L}%;animation-delay:-${dl * 3}s;animation-duration:${(5 + Math.random() * 5).toFixed(1)}s"></i>`);
    else parts.push(`<i class="star" style="left:${L}%;top:${(Math.random() * 60).toFixed(1)}%;animation-delay:-${dl}s"></i>`);
  }
  $("#fx").innerHTML = parts.join("");
}

/* Google Maps sync */
let mapT = "m", mapZ = 11, mapKey = "";
function renderMap() {
  if (!cur) return;
  const c = state.w.current, [label, ico] = sky(c.weather_code, c.is_day), q = `${cur.lat},${cur.lon}`;
  const k = `${q},${mapT},${mapZ}`;
  if (k !== mapKey) { mapKey = k; $("#gmap").src = `https://www.google.com/maps?q=${q}&z=${mapZ}&t=${mapT}&output=embed`; }
  $("#mapEmpty").hidden = true; $("#mapPin").hidden = false;
  $("#mapPin").innerHTML = `<span class="n-ico">${ico}</span><div><b>${deg(c.temperature_2m)}</b><span>${state.place}</span><small>${label} · 💧 ${c.relative_humidity_2m}%</small></div>`;
  $("#gOpen").href = `https://www.google.com/maps/search/?api=1&query=${q}`;
  $("#gDir").href = `https://www.google.com/maps/dir/?api=1&destination=${q}`;
}
$("#mapType").onclick = e => { const b = e.target.closest("[data-t]"); if (!b) return; mapT = b.dataset.t;
  document.querySelectorAll("#mapType .chip").forEach(x => x.classList.toggle("on", x === b)); renderMap(); };
$("#zIn").onclick = () => { mapZ = Math.min(18, mapZ + 1); renderMap(); };
$("#zOut").onclick = () => { mapZ = Math.max(3, mapZ - 1); renderMap(); };
