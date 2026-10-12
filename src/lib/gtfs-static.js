// Builds compact route → line and trip → line lookups from TfNSW static GTFS bundles.
import path from 'node:path';
import { readZip } from './zip.js';
import { parseCsv } from './csv.js';
import { matchGtfsRoute } from './lines.js';
import { tfnswGetFirst } from './http.js';
import { readJson, writeJson } from './store.js';

export function buildRouteMap(zipBuf, feed) {
  const files = readZip(zipBuf, feed.tripMap ? ['routes.txt', 'trips.txt'] : ['routes.txt']);
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
  const tripMap = {};
  if (feed.tripMap && files['trips.txt']) {
    const trips = parseCsv(files['trips.txt'].toString('utf8'), ['route_id', 'trip_id']);
    for (const t of trips) {
      const line = routeMap[t.route_id];
      if (line) tripMap[t.trip_id] = line;
    }
  }
  return {
    routes: routeMap,
    trips: tripMap,
    colors,
    stats: { routes: routes.length, matchedRoutes: routes.length - unmatched.length, trips: Object.keys(tripMap).length },
    unmatched: unmatched.slice(0, 40),
  };
}

const MAX_AGE_MS = 24 * 3_600_000;

// Returns a cached map if fresh, otherwise downloads the bundle. Never throws: on failure an
// empty map is returned so the realtime step can still fall back to route_id matching.
export async function ensureRouteMap(feed, cacheDir, { force = false, now = Date.now() } = {}) {
  const file = path.join(cacheDir, 'gtfs', `${feed.key}.json`);
  const cached = readJson(file);
  if (cached && !force && now - Date.parse(cached.builtAt) < MAX_AGE_MS) return cached;
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
