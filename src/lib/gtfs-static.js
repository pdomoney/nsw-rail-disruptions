// Builds compact route → line and trip → line lookups from TfNSW static GTFS bundles.
import path from 'node:path';
import { readZip, zipEntries } from './zip.js';
import { parseCsv, forEachCsvRow } from './csv.js';
import { matchGtfsRoute } from './lines.js';
import { tfnswGetFirst } from './http.js';
import { readJson, writeJson } from './store.js';
import { TrackBuilder } from './geo.js';

// Bump when the map format changes, so cached maps are rebuilt.
export const MAP_VERSION = 9;

// "25:13:00" → 90780 (seconds after the start of the service day; may pass 24 hours)
export function gtfsTime(t) {
  const m = /^\s*(\d+):(\d{2}):(\d{2})\s*$/.exec(t || '');
  return m ? +m[1] * 3600 + +m[2] * 60 + +m[3] : null;
}

// Extra files in the Sydney Trains bundle: occupancy forecasts and train consists.
const EXTRA = ['occupancies.txt', 'vehicle_categories.txt', 'vehicle_couplings.txt'];
const SAMPLED = ['occupancies.txt', 'vehicle_categories.txt', 'vehicle_couplings.txt'];

// "Central Station, Platform 18" → "Central Station"
function stationName(name) {
  return String(name || '').replace(/,\s*(Platform|Stand|Side|Wharf)\b.*$/i, '').trim();
}

export function buildRouteMap(zipBuf, feed) {
  const files = readZip(zipBuf, ['routes.txt', 'trips.txt', 'stops.txt', 'stop_times.txt', 'calendar.txt', 'calendar_dates.txt', 'shapes.txt', ...EXTRA]);
  if (!files['routes.txt']) throw new Error('routes.txt missing from bundle');
  const routes = parseCsv(files['routes.txt'].toString('utf8'),
    ['route_id', 'route_short_name', 'route_long_name', 'route_desc', 'route_color']);
  const routeMap = {};
  const colors = {};
  const unmatched = [];
  for (const r of routes) {
    const line = matchGtfsRoute(r, feed.defaultLine);
    routeMap[r.route_id] = line;
    if (line && r.route_color && !colors[line]) colors[line] = '#' + r.route_color.replace(/^#/, '').toUpperCase();
    if (!line) unmatched.push([r.route_id, r.route_short_name, r.route_long_name].join(' | '));
  }

  // Service calendars: which days each service_id runs.
  // services[sid] = [startYmd, endYmd, weekdayMask (bit 0 = Monday), datesAdded[], datesRemoved[]]
  const services = {};
  if (files['calendar.txt']) {
    const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    forEachCsvRow(files['calendar.txt'], ['service_id', ...days, 'start_date', 'end_date'], row => {
      let mask = 0;
      for (let i = 0; i < 7; i++) if (row[1 + i] === '1') mask |= 1 << i;
      services[row[0]] = [row[8], row[9], mask, [], []];
    });
  }
  let calendarDates = 0;
  if (files['calendar_dates.txt']) {
    forEachCsvRow(files['calendar_dates.txt'], ['service_id', 'date', 'exception_type'], ([sid, date, type]) => {
      const svc = (services[sid] ||= ['', '', 0, [], []]);
      if (type === '1') svc[3].push(date); else if (type === '2') svc[4].push(date);
      calendarDates++;
    });
  }

  // Train lengths: vehicle categories (e.g. "B8", an 8-car Waratah Series 2) and their carriages.
  const carsOf = {};
  if (files['vehicle_couplings.txt']) {
    forEachCsvRow(files['vehicle_couplings.txt'], ['parent_id', 'child_id'], ([parent]) => { carsOf[parent] = (carsOf[parent] || 0) + 1; });
  }

  // trips[tripId] = [line, serviceId, startSec, endSec, directionId, cars, forecast, category, headsign,
  // origin] for every trip on a tracked line. category is the train type (e.g. "B8"), cars its number of
  // carriages (null if unknown); forecast and origin (the first station's id) are filled in below.
  const trips = {};
  const shapeLines = new Map(); // shape_id → lines whose passenger trips use it
  if (files['trips.txt']) {
    forEachCsvRow(files['trips.txt'], ['route_id', 'service_id', 'trip_id', 'direction_id', 'vehicle_category_id', 'trip_headsign', 'shape_id'], ([routeId, sid, tripId, dir, cat, head, shape]) => {
      const line = routeMap[routeId];
      if (!line) return;
      trips[tripId] = [line, sid, null, null, dir === '' || dir == null ? null : +dir, carsOf[cat] || null, null, cat || null, head || null, null];
      if (shape && !/^empty train$/i.test(head || '')) {
        if (!shapeLines.has(shape)) shapeLines.set(shape, new Set());
        shapeLines.get(shape).add(line);
      }
    });
  }

  // Track geometry for the network map, from the shapes the lines' trips follow.
  let network = {};
  if (files['shapes.txt'] && shapeLines.size) {
    const pts = new Map();
    forEachCsvRow(files['shapes.txt'], ['shape_id', 'shape_pt_lat', 'shape_pt_lon', 'shape_pt_sequence'], ([id, la, lo, seq]) => {
      if (!shapeLines.has(id)) return;
      if (!pts.has(id)) pts.set(id, []);
      pts.get(id).push([+seq, +la, +lo]);
    });
    const tb = new TrackBuilder();
    for (const [id, list] of pts) {
      list.sort((a, b) => a[0] - b[0]);
      const line = list.map(([, la, lo]) => [la, lo]).filter(([la, lo]) => Number.isFinite(la) && Number.isFinite(lo) && la && lo);
      if (line.length < 2) continue;
      for (const l of shapeLines.get(id)) tb.add(l, line);
    }
    network = tb.chains();
  }

  // Forecast occupancy (occupancies.txt, Sydney Trains): the average level over a trip's stops for
  // each day of the week, times 10 (so 15 = between "many seats" and "few seats"), or null.
  let forecastTrips = 0;
  if (files['occupancies.txt']) {
    const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    const acc = new Map(); // tripId → [sum×7, count×7]
    forEachCsvRow(files['occupancies.txt'], ['trip_id', 'occupancy_status', ...days], row => {
      if (!trips[row[0]]) return;
      const level = row[1] === '' ? NaN : +row[1];
      if (!(level >= 0 && level <= 5)) return;
      let a = acc.get(row[0]);
      if (!a) acc.set(row[0], (a = [new Array(7).fill(0), new Array(7).fill(0)]));
      for (let i = 0; i < 7; i++) if (row[2 + i] === '1') { a[0][i] += level; a[1][i]++; }
    });
    for (const [tripId, [sum, n]] of acc) {
      trips[tripId][6] = sum.map((x, i) => (n[i] ? Math.round((x / n[i]) * 10) : null));
      forecastTrips++;
    }
  }

  // One pass over stop_times: first departure and last arrival of each trip, and the stations
  // each line stops at (platforms are folded into their parent station).
  const stations = {};
  if (files['stop_times.txt']) {
    const stops = new Map();
    if (files['stops.txt']) {
      forEachCsvRow(files['stops.txt'], ['stop_id', 'stop_name', 'parent_station', 'location_type', 'stop_lat', 'stop_lon'],
        ([id, name, parent, type, lat, lon]) => stops.set(id, { name, parent, type, lat: +lat, lon: +lon }));
    }
    // station id → line → number of trips stopping there (rare ones are trackwork or special events)
    const servedBy = new Map();
    const seqs = new Map(); // tripId → [firstSeq, lastSeq]
    forEachCsvRow(files['stop_times.txt'], ['trip_id', 'stop_id', 'arrival_time', 'departure_time', 'stop_sequence'], ([tripId, stopId, arr, dep, seqStr]) => {
      const t = trips[tripId];
      if (!t) return;
      const seq = +seqStr;
      const stop = stops.get(stopId);
      const station = stop?.parent && stops.has(stop.parent) ? stop.parent : stopId;
      let s = seqs.get(tripId);
      if (!s) seqs.set(tripId, (s = [Infinity, -Infinity]));
      if (seq < s[0]) { const v = gtfsTime(dep) ?? gtfsTime(arr); if (v != null) { s[0] = seq; t[2] = v; t[9] = station; } }
      if (seq > s[1]) { const v = gtfsTime(arr) ?? gtfsTime(dep); if (v != null) { s[1] = seq; t[3] = v; } }
      if (stops.size) {
        let counts = servedBy.get(station);
        if (!counts) servedBy.set(station, (counts = {}));
        counts[t[0]] = (counts[t[0]] || 0) + 1;
      }
    });
    for (const [id, counts] of servedBy) {
      const st = stops.get(id) || {};
      const n = stationName(st.name) || id;
      stations[id] = { n, l: Object.keys(counts).sort(), c: counts };
      if (Number.isFinite(st.lat) && st.lat) { stations[id].la = Math.round(st.lat * 1e5) / 1e5; stations[id].lo = Math.round(st.lon * 1e5) / 1e5; }
    }
  }

  // What the bundle holds, and the dates its calendars cover.
  let from = null, to = null;
  for (const [s, e, , add] of Object.values(services)) {
    for (const d of [s, ...add]) if (d && (!from || d < from)) from = d;
    for (const d of [e, ...add]) if (d && (!to || d > to)) to = d;
  }
  let listing = [];
  try { listing = zipEntries(zipBuf).map(x => [x.name, x.size]); } catch { /* already read above */ }
  // The first lines of files this project does not use yet, to see what they hold.
  const samples = {};
  for (const name of ['trips.txt', ...SAMPLED]) {
    if (!files[name]) continue;
    samples[name] = files[name].subarray(0, 4096).toString('utf8').replace(/^\ufeff/, '').split(/\r?\n/).slice(0, 5).map(l => l.slice(0, 300));
  }
  return {
    version: MAP_VERSION,
    routes: routeMap,
    colors,
    stations,
    sched: { services, trips },
    network,
    stats: {
      routes: routes.length, matchedRoutes: routes.length - unmatched.length, trips: Object.keys(trips).length,
      stations: Object.keys(stations).length, services: Object.keys(services).length, calendarDates, from, to,
      forecastTrips, tripsWithCars: Object.values(trips).filter(t => t[5]).length, files: listing, samples,
    },
    unmatched: unmatched.slice(0, 40),
  };
}

const weekdayIndex = ymd => (new Date(Date.UTC(+ymd.slice(0, 4), +ymd.slice(4, 6) - 1, +ymd.slice(6, 8))).getUTCDay() + 6) % 7;

// Is a service running on a date (YYYYMMDD)?
export function serviceRuns(svc, ymd) {
  if (!svc) return false;
  const [start, end, mask, add, remove] = svc;
  if (remove.includes(ymd)) return false;
  if (add.includes(ymd)) return true;
  return !!start && start <= ymd && ymd <= end && ((mask >> weekdayIndex(ymd)) & 1) === 1;
}

// The trips scheduled on one service date:
// [[tripId, line, directionId, startSec, endSec, cars, forecast occupancy ×10, train type, headsign, origin station id], ...].
export function scheduledTrips(map, ymd) {
  const sched = map?.sched;
  if (!sched) return [];
  const running = new Map();
  const wd = weekdayIndex(ymd);
  const out = [];
  for (const [tripId, [line, sid, start, end, dir, cars, forecast, category, headsign, origin]] of Object.entries(sched.trips)) {
    let r = running.get(sid);
    if (r === undefined) running.set(sid, (r = serviceRuns(sched.services[sid], ymd)));
    if (r) out.push([tripId, line, dir, start, end, cars ?? null, forecast?.[wd] ?? null, category ?? null, headsign ?? null, origin ?? null]);
  }
  return out.sort((a, b) => (a[3] ?? 0) - (b[3] ?? 0) || (a[0] < b[0] ? -1 : 1));
}

const MAX_AGE_MS = 24 * 3_600_000;

// Returns a cached map if fresh, otherwise downloads the bundle. Never throws: on failure an
// empty map is returned so the realtime step can still fall back to route_id matching.
export async function ensureRouteMap(feed, cacheDir, { force = false, now = Date.now() } = {}) {
  const file = path.join(cacheDir, 'gtfs', `${feed.key}.json`);
  const cached = readJson(file);
  if (cached && !force && cached.version === MAP_VERSION && now - Date.parse(cached.builtAt) < MAX_AGE_MS) return cached;
  try {
    const { buf, path: used } = await tfnswGetFirst(feed.schedule, { timeoutMs: 120_000, retries: 1 });
    const map = { builtAt: new Date(now).toISOString(), source: used, ...buildRouteMap(buf, feed) };
    writeJson(file, map);
    return map;
  } catch (e) {
    if (cached) return { ...cached, refreshError: e.message };
    return { builtAt: null, routes: {}, colors: {}, sched: null, error: e.message };
  }
}

export function resolveTripLine(trip, map, feed) {
  const rid = trip.routeId;
  if (rid && Object.prototype.hasOwnProperty.call(map.routes, rid)) return map.routes[rid];
  const t = trip.tripId && map.sched?.trips[trip.tripId];
  if (t) return t[0];
  if (rid) {
    const guess = matchGtfsRoute({ route_id: rid }, null);
    if (guess) return guess;
  }
  return feed.defaultLine;
}
