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
import { decodeFeed, lineStats } from './lib/gtfs-rt.js';
import { ensureRouteMap, resolveTripLine } from './lib/gtfs-static.js';
import { readJson, writeJson, appendLines } from './lib/store.js';
import { appendEvents } from './lib/events.js';
import { toCsvLine } from './lib/csv.js';
import { iso, sydDate } from './lib/time.js';

const DATA_DIR = process.env.DATA_DIR || 'data';
const CACHE_DIR = process.env.CACHE_DIR || '.cache';
const p = (...a) => path.join(DATA_DIR, ...a);

export const DELAY_HEADER = 'ts,line,active,late,mean_delay_s,max_delay_s,cancelled,feed';
export const RUN_HEADER = 'ts,alerts_ok,alerts_total,alerts_rail,alerts_closed,rt_ok,rt_total,rt_trips,rt_matched,errors';

async function collectAlerts(now, meta, run) {
  const buf = await tfnswGet(ADD_INFO.path, { params: ADD_INFO.params, accept: 'application/json' });
  const data = JSON.parse(buf.toString('utf8'));
  const items = data?.infos?.current;
  if (!Array.isArray(items)) throw new Error('add_info response has no infos.current array');
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
  const cancellations = {};
  const diag = (meta.realtime ||= {});
  let ok = 0, trips = 0, matched = 0;
  for (const feed of FEEDS) {
    const d = (diag[feed.key] ||= {});
    try {
      const forceMap = d.rebuildMap === true;
      const map = await ensureRouteMap(feed, CACHE_DIR, { force: forceMap, now });
      d.map = { builtAt: map.builtAt, source: map.source, stats: map.stats, error: map.error || map.refreshError, unmatchedRoutes: map.unmatched?.slice(0, 15) };
      d.rebuildMap = false;
      const { buf, path: used } = await tfnswGetFirst(feed.realtime, { timeoutMs: 45_000 });
      const fm = decodeFeed(buf);
      const stats = lineStats(fm, trip => resolveTripLine(trip, map, feed));
      const age = Math.round(now / 1000 - stats.feedTime);
      d.last = { at: iso(now), endpoint: used, bytes: buf.length, entities: fm.entity?.length || 0, trips: stats.trips, matched: stats.matched, feedAgeS: age, unmatched: stats.unmatched, shape: stats.shape };
      trips += stats.trips;
      matched += stats.matched;
      // Ask for a fresh timetable map if most trips cannot be placed on a line.
      if (stats.trips > 20 && stats.matched / stats.trips < 0.6 && map.builtAt && now - Date.parse(map.builtAt) > 6 * 3_600_000) d.rebuildMap = true;
      if (age > 15 * 60) { d.last.skipped = 'feed older than 15 minutes'; continue; }
      ok++;
      for (const [line, s] of Object.entries(stats.lines)) {
        const mean = s.active ? Math.round(s.sumDelay / s.active) : '';
        delayRows.push(toCsvLine([iso(stats.feedTime * 1000), line, s.active, s.late, mean, s.active ? s.maxDelay : '', s.cancelled, feed.key]));
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
  const day = sydDate(now);
  appendLines(p('delays', day.slice(0, 7), `${day}.csv`), delayRows, DELAY_HEADER);
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
