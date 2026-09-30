/* Bus 2358 tracker. Pure logic is exported for tests; browser code runs only when `document` exists. */
(function (root) {
  "use strict";

  const CONFIG = {
    BUS_ID: "2358",
    // CapMetro vehicle positions (JSON, refreshed about every 15 seconds)
    LIVE_URL: "https://data.austintexas.gov/download/cuc7-ywmd/application/json",
    // CORS proxy (see worker/proxy.js) — the direct call below is blocked by browsers
    PROXY_URL: "https://bus2358-feed.kevin-sinkar.workers.dev",
    // A position older than this is treated as "not in service"
    STALE_SECONDS: 600,
  };

  const pick = (o, ...keys) => {
    for (const k of keys) if (o && o[k] !== undefined && o[k] !== null) return o[k];
    return undefined;
  };

  const num = (x) => {
    if (x && typeof x === "object" && "low" in x) x = x.low; // protobuf-style int64
    const n = Number(x);
    return Number.isFinite(n) ? n : null;
  };

  /** Find the vehicle with the given fleet id in a GTFS-realtime JSON feed. */
  function findVehicle(feed, busId) {
    const entities = Array.isArray(feed) ? feed : pick(feed, "entity", "entities") || [];
    for (const e of entities) {
      const v = pick(e, "vehicle") || {};
      const desc = pick(v, "vehicle") || {};
      const ids = [pick(desc, "id"), pick(desc, "label")].map((x) => (x == null ? "" : String(x).trim()));
      if (!ids.includes(String(busId))) continue;
      const trip = pick(v, "trip") || {};
      const pos = pick(v, "position") || {};
      const lat = num(pick(pos, "latitude", "lat"));
      const lon = num(pick(pos, "longitude", "lon", "lng"));
      if (lat === null || lon === null) continue;
      return {
        id: String(busId),
        tripId: pick(trip, "tripId", "trip_id") != null ? String(pick(trip, "tripId", "trip_id")) : null,
        routeId: pick(trip, "routeId", "route_id") != null ? String(pick(trip, "routeId", "route_id")) : null,
        lat, lon,
        bearing: num(pick(pos, "bearing")),
        speed: num(pick(pos, "speed")),
        timestamp: num(pick(v, "timestamp")),
      };
    }
    return null;
  }

  /** Decide status from a found vehicle (or null). nowSec is injectable for tests. */
  function classify(vehicle, nowSec, staleSeconds) {
    if (!vehicle) return { inService: false, reason: "missing" };
    if (vehicle.timestamp !== null && nowSec - vehicle.timestamp > staleSeconds) {
      return { inService: false, reason: "stale", ageSeconds: nowSec - vehicle.timestamp };
    }
    return { inService: true, ageSeconds: vehicle.timestamp === null ? null : nowSec - vehicle.timestamp };
  }

  /** Pick the shapes to draw: the trip's own shape (primary) plus other variants of the route. */
  function chooseShapes(routeInfo, tripShapeId) {
    if (!routeInfo || !routeInfo.shapes) return { primary: null, others: [] };
    const ids = Object.keys(routeInfo.shapes);
    const primaryId = tripShapeId && routeInfo.shapes[tripShapeId] ? tripShapeId : null;
    return {
      primary: primaryId ? routeInfo.shapes[primaryId] : null,
      others: ids.filter((i) => i !== primaryId).map((i) => routeInfo.shapes[i]),
    };
  }

  const api = { CONFIG, findVehicle, classify, chooseShapes };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.Bus2358 = api;

  if (typeof document === "undefined") return;

  // ---------------- Browser part ----------------
  const $ = (id) => document.getElementById(id);
  const btn = $("locate"), statusEl = $("status"), detailEl = $("detail");
  // ?bus=1234 overrides the tracked bus (handy for testing with a bus that's in service)
  const busId = new URLSearchParams(location.search).get("bus") || busId;
  document.title = "Bus " + busId + " Tracker";
  document.querySelector("h1").textContent = "Bus " + busId;
  const map = L.map("map", { zoomControl: true }).setView([30.2672, -97.7431], 11);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(map);
  let layer = L.layerGroup().addTo(map);

  let routesP = null, tripsP = null;
  const loadJson = (p) => fetch(p, { cache: "force-cache" }).then((r) => (r.ok ? r.json() : Promise.reject(new Error(p + " " + r.status))));
  const getRoutes = () => (routesP = routesP || loadJson("data/routes.json").catch(() => null));
  const getTrips = () => (tripsP = tripsP || loadJson("data/trips.json").catch(() => null));

  async function fetchFeed() {
    // The direct call is usually blocked by CORS (the feed's redirect lacks the header),
    // so a configured proxy goes first; the local dev server's /feed goes first on localhost.
    const urls = [];
    if (CONFIG.PROXY_URL) urls.push(CONFIG.PROXY_URL);
    if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) urls.push("feed");
    urls.push(CONFIG.LIVE_URL);
    const errors = [];
    for (const u of urls) {
      try {
        const r = await fetch(u, { cache: "no-store" });
        if (!r.ok) throw new Error("HTTP " + r.status);
        return await r.json();
      } catch (e) {
        errors.push(u + ": " + e.message);
      }
    }
    const err = new Error("Could not load the live feed.");
    err.details = errors;
    throw err;
  }

  function setStatus(text, kind) {
    statusEl.textContent = text;
    statusEl.className = "status " + (kind || "");
  }
  function setDetail(html) { detailEl.innerHTML = html || ""; }
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  async function locate() {
    btn.disabled = true;
    setStatus("Checking…", "");
    setDetail("");
    layer.clearLayers();
    try {
      const feed = await fetchFeed();
      const nowSec = Math.floor(Date.now() / 1000);
      const v = findVehicle(feed, busId);
      const c = classify(v, nowSec, CONFIG.STALE_SECONDS);
      if (!c.inService) {
        setStatus("Bus " + busId + " is not in service right now.", "off");
        setDetail(c.reason === "stale"
          ? "Its last reported position is " + Math.round(c.ageSeconds / 60) + " minutes old."
          : "It is not reporting a position in CapMetro's live feed. Checked " + new Date().toLocaleTimeString() + ".");
        map.setView([30.2672, -97.7431], 11);
        return;
      }

      const [routes, trips] = await Promise.all([getRoutes(), getTrips()]);
      const routeId = v.routeId;
      const routeInfo = routes && routeId ? routes[routeId] : null;
      const tripShape = trips && v.tripId ? trips[v.tripId] : null;
      const color = routeInfo && routeInfo.color ? "#" + routeInfo.color : "#c0392b";
      const { primary, others } = chooseShapes(routeInfo, tripShape);

      others.forEach((s) => L.polyline(s, { color, weight: 3, opacity: primary ? 0.25 : 0.6 }).addTo(layer));
      if (primary) L.polyline(primary, { color, weight: 6, opacity: 0.9 }).addTo(layer);

      const dot = L.circleMarker([v.lat, v.lon], {
        radius: 10, color: "#ffffff", weight: 3, fillColor: "#e11d48", fillOpacity: 1,
      }).addTo(layer);
      const label = routeInfo ? (routeInfo.name + (routeInfo.long ? " – " + routeInfo.long : "")) : (routeId ? "Route " + routeId : "Route unknown");
      dot.bindPopup("<b>Bus " + busId + "</b><br>" + esc(label)).openPopup();

      const bounds = L.latLngBounds([[v.lat, v.lon]]);
      [primary].concat(others).filter(Boolean).forEach((s) => s.forEach((p) => bounds.extend(p)));
      map.fitBounds(bounds.pad(0.1));

      setStatus("Bus " + busId + " is on " + label, "on");
      const bits = [];
      if (c.ageSeconds !== null) bits.push("Position is " + Math.max(0, Math.round(c.ageSeconds)) + "s old");
      if (v.speed !== null) bits.push(Math.round(v.speed * 2.23694) + " mph");
      if (!routeInfo) bits.push("Route shape data not loaded, so only the bus is shown");
      else if (!primary) bits.push("Exact trip not found; showing all variants of the route");
      setDetail(bits.map(esc).join(" · "));
    } catch (e) {
      setStatus("Couldn't reach CapMetro's live feed.", "err");
      setDetail("Your browser may be blocking the request (CORS). See the README for the one-step proxy fix. " +
        (e.details ? "<br><small>" + e.details.map(esc).join("<br>") + "</small>" : ""));
    } finally {
      btn.disabled = false;
    }
  }

  btn.addEventListener("click", locate);
})(typeof window !== "undefined" ? window : globalThis);
