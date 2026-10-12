// Builds compact route → line and trip → line lookups from TfNSW static GTFS bundles.
import path from 'node:path';
import { readZip } from './zip.js';
import { parseCsv, forEachCsvRow } from './csv.js';
import { matchGtfsRoute } from './lines.js';
import { tfnswGetFirst } from './http.js';
import { readJson, writeJson } from './store.js';

// Bump when the map format changes, so cached maps are rebuilt.
export const MAP_VERSION = 3;

// "Central Station, Platform 18" → "Central Station"
function stationName(name) {
  return String(name || '').replace(/,\s*(Platform|Stand|Side|Wharf)\b.*$/i, '').trim();
}

export function buildRouteMap(zipBuf, feed) {
  const files = readZip(zipBuf, ['routes.txt', 'trips.txt', 'stops.txt', 'stop_times.txt']);
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
  // trip → line for every trip (kept in the map only for feeds whose realtime needs it)
  const tripLine = new Map();
  if (files['trips.txt']) {
    forEachCsvRow(files['trips.txt'], ['route_id', 'trip_id'], ([routeId, tripId]) => {
      const line = routeMap[routeId];
      if (line) tripLine.set(tripId, line);
    });
  }
  const tripMap = feed.tripMap ? Object.fromEntries(tripLine) : {};

  // Stations and the lines that stop at them (platforms are folded into their parent station).
  const stations = {};
  if (files['stops.txt'] && files['stop_times.txt']) {
    const stops = new Map();
    forEachCsvRow(files['stops.txt'], ['stop_id', 'stop_name', 'parent_station', 'location_type', 'stop_lat', 'stop_lon'],
      ([id, name, parent, type, lat, lon]) => stops.set(id, { name, parent, type, lat: +lat, lon: +lon }));
    // station id → line → number of trips stopping there (rare ones are trackwork or special events)
    const servedBy = new Map();
    forEachCsvRow(files['stop_times.txt'], ['trip_id', 'stop_id'], ([tripId, stopId]) => {
      const line = tripLine.get(tripId);
      if (!line) return;
      const stop = stops.get(stopId);
      const station = stop?.parent && stops.has(stop.parent) ? stop.parent : stopId;
      let counts = servedBy.get(station);
      if (!counts) servedBy.set(station, (counts = {}));
      counts[line] = (counts[line] || 0) + 1;
    });
    for (const [id, counts] of servedBy) {
      const st = stops.get(id) || {};
      const n = stationName(st.name) || id;
      stations[id] = { n, l: Object.keys(counts).sort(), c: counts };
      if (Number.isFinite(st.lat) && st.lat) { stations[id].la = Math.round(st.lat * 1e5) / 1e5; stations[id].lo = Math.round(st.lon * 1e5) / 1e5; }
    }
  }
  return {
    version: MAP_VERSION,
    routes: routeMap,
    trips: tripMap,
    colors,
    stations,
    stats: { routes: routes.length, matchedRoutes: routes.length - unmatched.length, trips: tripLine.size, stations: Object.keys(stations).length },
    unmatched: unmatched.slice(0, 40),
  };
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
    return { builtAt: null, routes: {}, trips: {}, colors: {}, error: e.message };
  }
}

export function resolveTripLine(trip, map, feed) {
  const rid = trip.routeId;
  if (rid && Object.prototype.hasOwnProperty.call(map.routes, rid)) return map.routes[rid];
  if (trip.tripId && map.trips && map.trips[trip.tripId]) return map.trips[trip.tripId];
  if (rid) {
    const guess = matchGtfsRoute({ route_id: rid }, null);
    if (guess) return guess;
  }
  return feed.defaultLine;
}
