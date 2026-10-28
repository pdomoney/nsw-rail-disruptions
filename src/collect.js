// One collection run: snapshot service alerts and realtime trip delays, append to the data files.
//
//   TFNSW_API_KEY=... DATA_DIR=data CACHE_DIR=.cache node src/collect.js
//
// Each step is independent: a failure in one feed is logged and the rest still run.
import path from 'node:path';
import { ADD_INFO, FEEDS } from './config/feeds.js';
import { tfnswGet, tfnswGetFirst } from './lib/http.js';
import { normalizeInfo } from './lib/classify.js';
import { applySnapshot } from './lib/tracker.js';
import { decodeFeed, lineStats, fieldCensus, vehicleLoads, vehiclePositions } from './lib/gtfs-rt.js';
import { ensureRouteMap, resolveTripLine } from './lib/gtfs-static.js';
import { readJson, writeJson, appendLines } from './lib/store.js';
import { appendEvents } from './lib/events.js';
import { toCsvLine } from './lib/csv.js';
import { ServiceRecorder } from './lib/service.js';
import { iso, sydDate } from './lib/time.js';
import { shouldRefreshMetroOpeningMap, METRO_OPENING_UTC_MS } from './lib/metro-opening-refresh.js';
import { metroOpeningScheduleSnapshot } from './lib/metro-opening-schedule-snapshot.js';

const DATA_DIR = process.env.DATA_DIR || 'data';
const CACHE_DIR = process.env.CACHE_DIR || '.cache';
const p = (...a) => path.join(DATA_DIR, ...a);

export const DELAY_HEADER = 'ts,line,active,late,mean_delay_s,max_delay_s,cancelled,feed';
// Running trips by occupancy level, per line and run. Each histogram field holds six numbers
// separated by spaces, for levels 0–5 (empty, many seats, few seats, standing, crowded, full):
// cars = carriages at each level, car_delay_s = sum of their delays; trains / train_delay_s the
// same for trips with only a level for the whole train.
export const LOAD_HEADER = 'ts,line,running,with_occ,cars,car_delay_s,trains,train_delay_s,feed';
export const RUN_HEADER = 'ts,alerts_ok,alerts_total,alerts_rail,alerts_closed,rt_ok,rt_total,rt_trips,rt_matched,errors';

async function collectAlerts(now, meta, run) {
  const buf = await tfnswGet(ADD_INFO.path, { params: ADD_INFO.params, accept: 'application/json' });
  const data = JSON.parse(buf.toString('utf8'));
  const items = data?.infos?.current;
  if (!Array.isArray(items)) throw new Error('add_info response has no infos.current array');
  // The feed sometimes returns a partial list for one run (once, a single alert instead of ~390).
  // Applying it would end every missing alert, so a sudden drop is only accepted when the next
  // run confirms it.
  const prevTotal = meta.alertsLastTotal;
  meta.alertsLastTotal = items.length;
  if (prevTotal > 50 && items.length < prevTotal * 0.8) {
    throw new Error(`alerts feed returned ${items.length} alerts after ${prevTotal}; waiting for the next run to confirm`);
  }
  const records = items.map(normalizeInfo).filter(Boolean);
  const openFile = p('alerts', 'open.json');
  const prev = readJson(openFile, { open: {} });
  const state = { open: prev.open || {}, lastOkAt: meta.alertsLastOkAt || null };
  const closed = applySnapshot(state, now, records, { src: 'live' });
  appendEvents(DATA_DIR, closed);
  writeJson(openFile, { updatedAt: iso(now), open: state.open });
  meta.alertsLastOkAt = state.lastOkAt;
  run.alerts = { total: items.length, rail: records.length, closed: closed.length };
}

async function collectRealtime(now, meta, run) {
  const delayRows = [];
  const loadRows = [];
  const cancellations = {};
  const service = new ServiceRecorder(DATA_DIR, now);
  // Vehicle positions are fetched every run (for the network map, and measured occupancy where published);
  // their protobuf fields are counted about once an hour.
  const probeVehicles = new Date(now).getUTCMinutes() < 5;
  const positions = { at: iso(now), feeds: {}, trains: [] };
  const diag = (meta.realtime ||= {});
  let ok = 0, trips = 0, matched = 0;
  for (const feed of FEEDS) {
    const d = (diag[feed.key] ||= {});
    try {
      // One opening-specific static schedule refresh: an M1 map cached before
      // Southwest passenger opening must not stay frozen for another 24 hours.
      // A failed fetch uses ensureRouteMap's existing cached fallback, with a
      // six-hour retry guard to avoid hammering the TfNSW timetable endpoint.
      const openingRefresh = shouldRefreshMetroOpeningMap({
        feedKey: feed.key, nowMs: now, builtAt: d.map?.builtAt,
        lastAttemptAt: d.metroOpeningRefresh?.attemptAt,
      });
      if (openingRefresh) d.metroOpeningRefresh = {attemptAt:iso(now),status:'attempted'};
      const forceMap = d.rebuildMap === true || openingRefresh;
      const map = await ensureRouteMap(feed, CACHE_DIR, { force: forceMap, now });
      if (openingRefresh) d.metroOpeningRefresh = {
        attemptAt:iso(now),
        status: map.builtAt && Date.parse(map.builtAt) >= METRO_OPENING_UTC_MS
          ? 'post-opening-static-timetable-fetched' : 'still-using-pre-opening-static-cache',
        actualBuiltAt: map.builtAt||null,
        error: map.error||map.refreshError||null,
      };
      d.map = { builtAt: map.builtAt, source: map.source, stats: map.stats, error: map.error || map.refreshError, unmatchedRoutes: map.unmatched?.slice(0, 15) };
      // Source-specific post-opening snapshot, separate from frozen day records.
      if (feed.key === 'metro') {
        const snapshot=metroOpeningScheduleSnapshot(map,now);
        if (snapshot) {
          const file=p('audit','metro-opening-static-snapshot.json');
          const previous=readJson(file);
          if (!previous || previous.timetableBuiltAt!==snapshot.timetableBuiltAt)
            writeJson(file,snapshot);
        }
      }
      d.rebuildMap = false;
      service.freeze(feed, map);
      // Station list for the trip page (rewritten only when the timetable changes).
      if (map.stations && Object.keys(map.stations).length) {
        writeJson(p('stations', `${feed.key}.json`), { builtAt: map.builtAt, source: map.source, stations: map.stations });
      }
      // Track geometry for the network map (rewritten only when the timetable changes).
      if (map.network && Object.keys(map.network).length) {
        writeJson(p('network', `${feed.key}.json`), { builtAt: map.builtAt, source: map.source, grid: 1e4, lines: map.network });
      }
      let vehicles = null, vpList = [];
      if (feed.vehiclePositions) {
        try {
          const vp = await tfnswGetFirst(feed.vehiclePositions, { timeoutMs: 30_000, retries: 1 });
          const vfm = decodeFeed(vp.buf);
          vehicles = vehicleLoads(vfm);
          vpList = vehiclePositions(vfm);
          positions.feeds[feed.key] = vfm.header?.timestamp ? iso(vfm.header.timestamp * 1000) : iso(now);
          d.vehicles = { at: iso(now), endpoint: vp.path, bytes: vp.buf.length, ...vehicleSummary(vfm),
            fields: probeVehicles || !d.vehicles?.fields ? fieldCensus(vp.buf) : d.vehicles.fields };
        } catch (e) {
          d.vehicles = { ...(d.vehicles || {}), at: iso(now), error: e.message };
        }
      }
      const { buf, path: used } = await tfnswGetFirst(feed.realtime, { timeoutMs: 45_000 });
      const fm = decodeFeed(buf);
      const stats = lineStats(fm, trip => resolveTripLine(trip, map, feed), { vehicles });
      const feedTime = fm.header?.timestamp ?? stats.feedTime;
      const age = Math.round(now / 1000 - feedTime);
      d.last = { at: iso(now), endpoint: used, bytes: buf.length, entities: fm.entity?.length || 0, trips: stats.trips, matched: stats.matched, feedAgeS: age, unmatched: stats.unmatched, shape: stats.shape, occupancy: stats.occ };
      if (!d.census || probeVehicles) d.census = { at: iso(now), fields: fieldCensus(buf) };
      trips += stats.trips;
      matched += stats.matched;
      // Ask for a fresh timetable map if most trips cannot be placed on a line.
      if (stats.trips > 20 && stats.matched / stats.trips < 0.6 && map.builtAt && now - Date.parse(map.builtAt) > 6 * 3_600_000) d.rebuildMap = true;
      if (age > 15 * 60) { d.last.skipped = 'feed older than 15 minutes'; continue; }
      ok++;
      for (const [line, s] of Object.entries(stats.lines)) {
        const mean = s.active ? Math.round(s.sumDelay / s.active) : '';
        delayRows.push(toCsvLine([iso(feedTime * 1000), line, s.active, s.late, mean, s.active ? s.maxDelay : '', s.cancelled, feed.key]));
      }
      for (const [line, w] of Object.entries(stats.load)) {
        if (!w.withOcc) continue;
        loadRows.push(toCsvLine([iso(feedTime * 1000), line, w.running, w.withOcc, w.cars.join(' '), w.carDelay.join(' '), w.trains.join(' '), w.trainDelay.join(' '), feed.key]));
      }
      d.last.ids = service.record(feed.key, stats.tripList, feedTime * 1000, id => {
        const t = map.sched?.trips[id];
        return t ? [t[1], map.sched.services[t[1]]] : false;
      });
      service.covered(feed.key, feedTime * 1000);
      // Where each train is, with its delay and load, for the network map.
      const byTrip = new Map(stats.tripList.filter(t => t.tripId).map(t => [t.tripId, t]));
      for (const v of vpList) {
        const t = byTrip.get(v.tripId);
        const line = t?.line || resolveTripLine({ tripId: v.tripId, routeId: v.routeId }, map, feed);
        if (!line) continue;
        if (t && (t.sr === 3 || t.sr === 7)) continue; // cancelled
        const levels = t?.sum.nowLevels?.length ? t.sum.nowLevels : v.levels;
        const level = t?.sum.nowLevel ?? v.level;
        const cars = Math.max(t?.sum.cars || 0, v.cars || 0, levels.length) || map.sched?.trips[v.tripId]?.[5] || null;
        positions.trains.push([feed.key, line, Math.round(v.lat * 1e5) / 1e5, Math.round(v.lon * 1e5) / 1e5, v.bearing,
          t?.sum.running ? t.sum.delay : null, levels.join(''), level, cars, map.sched?.trips[v.tripId]?.[8] || null]);
      }
      for (const [line, keys] of Object.entries(stats.cancelled)) {
        for (const key of keys) {
          const sd = key.split('|')[1];
          const date = /^\d{8}$/.test(sd) ? `${sd.slice(0, 4)}-${sd.slice(4, 6)}-${sd.slice(6, 8)}` : sydDate(now);
          ((cancellations[date] ||= {})[line] ||= new Set()).add(key.split('|')[0]);
        }
      }
    } catch (e) {
      d.lastError = { at: iso(now), message: e.message };
      run.errors.push(`${feed.key}: ${e.message}`);
    }
  }
  writeJson(p('live', 'positions.json'), { ...positions, cols: ['feed', 'line', 'lat', 'lon', 'bearing', 'delay', 'car_levels', 'level', 'cars', 'headsign'] });
  const finalised = service.finalise();
  service.save();
  if (finalised.length) run.serviceDays = finalised;
  const day = sydDate(now);
  appendLines(p('delays', day.slice(0, 7), `${day}.csv`), delayRows, DELAY_HEADER);
  appendLines(p('load', day.slice(0, 7), `${day}.csv`), loadRows, LOAD_HEADER);
  // Unique cancelled trips per service day and line.
  for (const [date, byLine] of Object.entries(cancellations)) {
    const file = p('cancellations', `${date.slice(0, 7)}.json`);
    const cur = readJson(file, {});
    const dayRec = (cur[date] ||= {});
    let changed = false;
    for (const [line, set] of Object.entries(byLine)) {
      const existing = new Set(dayRec[line] || []);
      const before = existing.size;
      for (const k of set) existing.add(k);
      if (existing.size !== before) { dayRec[line] = [...existing].sort(); changed = true; }
    }
    if (changed) writeJson(file, cur);
  }
  run.rt = { ok, total: FEEDS.length, trips, matched };
}

// What a vehicle positions feed holds (occupancy and consists), for diagnostics.
function vehicleSummary(fm) {
  const out = { vehicles: 0, withTrip: 0, occupancy: {}, withPercent: 0, withConsist: 0, consistLevels: {}, models: {} };
  for (const e of fm.entity || []) {
    const v = e.vehicle;
    if (!v) continue;
    out.vehicles++;
    if (v.trip?.tripId) out.withTrip++;
    if (v.occupancy != null) out.occupancy[v.occupancy] = (out.occupancy[v.occupancy] || 0) + 1;
    if (v.occupancyPercentage != null) out.withPercent++;
    if (v.consist?.length) {
      out.withConsist++;
      for (const c of v.consist) {
        const l = c.occupancy ?? c.departureOccupancy;
        if (l != null) out.consistLevels[l] = (out.consistLevels[l] || 0) + 1;
      }
    }
    const m = v.vehicle?.tfnsw?.model;
    if (m) out.models[m] = (out.models[m] || 0) + 1;
  }
  return out;
}

export async function collect(now = Date.now()) {
  const metaFile = p('state', 'meta.json');
  const meta = readJson(metaFile, {});
  const run = { errors: [] };
  try {
    await collectAlerts(now, meta, run);
  } catch (e) {
    run.errors.push(`alerts: ${e.message}`);
    meta.alertsLastError = { at: iso(now), message: e.message };
  }
  try {
    await collectRealtime(now, meta, run);
  } catch (e) {
    run.errors.push(`realtime: ${e.message}`);
  }
  appendLines(p('runs', `${sydDate(now).slice(0, 7)}.csv`), [toCsvLine([
    iso(now), run.alerts ? 1 : 0, run.alerts?.total ?? '', run.alerts?.rail ?? '', run.alerts?.closed ?? '',
    run.rt?.ok ?? 0, run.rt?.total ?? FEEDS.length, run.rt?.trips ?? '', run.rt?.matched ?? '', run.errors.length,
  ])], RUN_HEADER);
  meta.lastRunAt = iso(now);
  meta.lastRunErrors = run.errors;
  writeJson(metaFile, meta, { pretty: true });
  return run;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const run = await collect();
  console.log(JSON.stringify(run, null, 1));
  if (!run.alerts && !(run.rt?.ok > 0)) {
    console.error('Nothing was collected in this run.');
    process.exitCode = 1;
  }
}
