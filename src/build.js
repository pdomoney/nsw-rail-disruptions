// Turns the collected data into the compact JSON files the website reads, and assembles the site.
//
//   DATA_DIR=data OUT_DIR=dist node src/build.js
import fs from 'node:fs';
import path from 'node:path';
import { LINES, LINE_BY_ID, MODES, dynamicLine, lineOrder, lateThresholdSeconds } from './config/lines.js';
import { CAUSES, reclassify } from './lib/classify.js';
import { FEEDS } from './config/feeds.js';
import { modeOfLineId } from './lib/lines.js';
import { readAllEvents } from './lib/events.js';
import { readJson, writeJson, listFiles, readLines, ensureDir } from './lib/store.js';
import { parseCsv } from './lib/csv.js';
import { buildCrowding } from './lib/crowding.js';
import { buildStationPatronage } from './lib/station-patronage.js';
import { buildPatronageRoutes } from './lib/patronage-routes.js';
import { publishSiteRelease } from './lib/site-version.js';
import { readServiceDays } from './lib/service.js';
import { summariseDay, pairStats, trackedPairs, COUNTERS, RIDE_MINUTES } from './lib/service-stats.js';
import { delayClock, CAR_LOAD } from './lib/clock.js';
import { trackworkItems } from './lib/trackwork.js';
import { project, projectChains, encodeChain, TrackGraph, affectedPlaces, stationKey } from './lib/netmap.js';
import { buildGeographicStationProximity } from './lib/map-station-proximity.js';
import { buildSchematic, diagramSections, labelSide, trainPlacer, terminalCallouts, SCHEMATIC_VIEWS, DIAGRAM_LAYOUT_VERSION } from './lib/schematic.js';
import { addDays, daysBetween, iso, splitByDay, sydDate, sydMidnight, sydHour, toMs, HOUR, DAY, MIN } from './lib/time.js';

const DATA_DIR = process.env.DATA_DIR || 'data';
const OUT_DIR = process.env.OUT_DIR || 'dist';
const SITE_DIR = process.env.SITE_DIR || 'site';
const HISTORY_START = process.env.HISTORY_START || '2023-07-01';
// One incident alert counts for at most this long in the "hours disrupted" figures. A handful of
// alerts stay in the feed for days after the problem is fixed; this keeps them from dominating.
const MAX_INCIDENT_MS = 24 * HOUR;
// Planned windows longer than this are standing notices rather than closures.
const MAX_PLANNED_WINDOW_MS = 16 * DAY;
const LOG_KINDS = new Set(['incident', 'planned', 'advisory']);
const CLOSURE_SUBS = new Set(['closure', 'trackwork']);

const now = Number(process.env.BUILD_NOW ? Date.parse(process.env.BUILD_NOW) : Date.now());
const today = sydDate(now);
const out = (...a) => path.join(OUT_DIR, ...a);

// ---------- load alert events ----------

function mergeSameId(events) {
  const byId = new Map();
  for (const e of events) {
    if (!byId.has(e.id)) byId.set(e.id, []);
    byId.get(e.id).push(e);
  }
  const result = [];
  for (const list of byId.values()) {
    list.sort((a, b) => toMs(a.st) - toMs(b.st));
    let cur = null;
    for (const e of list) {
      if (cur && toMs(e.st) - toMs(cur.en) < 6 * HOUR) {
        cur = { ...e, st: cur.st, fs: cur.fs, en: iso(Math.max(toMs(cur.en), toMs(e.en))), l: [...new Set([...cur.l, ...e.l])], src: cur.src };
      } else {
        if (cur) result.push(cur);
        cur = { ...e };
      }
    }
    if (cur) result.push(cur);
  }
  return result;
}

function loadEvents() {
  const closed = [...readAllEvents(DATA_DIR)];
  const open = Object.values(readJson(path.join(DATA_DIR, 'alerts', 'open.json'), { open: {} }).open || {})
    .filter(r => !r.stale)
    .map(r => ({ ...r, en: iso(now), ongoing: true }));
  const startMs = sydMidnight(HISTORY_START);
  const all = mergeSameId([...closed, ...open]).map(reclassify).filter(e => {
    if (e.k === 'planned' && e.w?.length) return e.w.some(([, to]) => to && toMs(to) >= startMs);
    return toMs(e.en) >= startMs;
  });
  // Open records win over closed ones with the same id (still ongoing).
  return all;
}

// ---------- helpers ----------

function unionMs(intervals) {
  intervals.sort((a, b) => a[0] - b[0]);
  const outI = [];
  for (const [s, e] of intervals) {
    if (outI.length && s <= outI[outI.length - 1][1]) outI[outI.length - 1][1] = Math.max(outI[outI.length - 1][1], e);
    else outI.push([s, e]);
  }
  return outI;
}

function plannedWindows(e) {
  if (e.k !== 'planned' || !CLOSURE_SUBS.has(e.s) || !e.w) return [];
  return e.w
    .filter(([f, t]) => f && t)
    .map(([f, t]) => [toMs(f), toMs(t)])
    .filter(([f, t]) => t > f && t - f <= MAX_PLANNED_WINDOW_MS);
}

function incidentInterval(e) {
  const s = toMs(e.st), en = toMs(e.en);
  return [s, Math.min(Math.max(en, s + MIN), s + MAX_INCIDENT_MS)];
}

const round1 = x => Math.round(x * 10) / 10;

// Live incident alerts are usually titled with the affected line names ("Western Line, Northern Line").
// The badges already show the lines, so the first sentence of the alert makes a better headline.
function isLineList(title) {
  return !!title && title.split(/,\s*/).every(p => /(\bLines?|Olympic Park|City Circle|Airport)$/i.test(p.trim()));
}
export function headline(e) {
  if ((e.k === 'incident' || e.k === 'advisory') && e.x && (isLineList(e.t) || /^(service alert|general update)$/i.test(e.t || ''))) {
    const first = e.x.split(/(?<=[.!?])\s+|\n/)[0].trim();
    if (first.length >= 12) return first.length > 160 ? first.slice(0, 157).replace(/\s+\S*$/, '') + '…' : first;
  }
  return e.t;
}

// ---------- main ----------

function build() {
  const events = loadEvents();
  const lineIds = new Set(LINES.map(l => l.id));
  for (const e of events) for (const l of e.l) lineIds.add(l);
  const lines = [...lineIds]
    .map(id => LINE_BY_ID[id] || dynamicLine(id, modeOfLineId(id) || 'train'))
    .sort((a, b) => (MODES[a.mode]?.order ?? 9) - (MODES[b.mode]?.order ?? 9) || lineOrder(a.id) - lineOrder(b.id) || a.id.localeCompare(b.id));

  // Day axis
  const coverageArchive = readJson(path.join(DATA_DIR, 'coverage', 'archive.json'), {});
  const runFiles = listFiles(path.join(DATA_DIR, 'runs'), /\.csv$/);
  const coverageLive = {};
  for (const f of runFiles) {
    for (const r of parseCsv(fs.readFileSync(f, 'utf8'))) {
      if (r.alerts_ok !== '1') continue;
      const d = sydDate(toMs(r.ts));
      coverageLive[d] = (coverageLive[d] || 0) + 1;
    }
  }
  const firstData = [...Object.keys(coverageArchive), ...Object.keys(coverageLive)].sort()[0] || today;
  const start = firstData > HISTORY_START ? firstData : HISTORY_START;
  const N = daysBetween(start, today) + 1;
  const idx = d => daysBetween(start, d);
  const zeros = () => new Array(N).fill(0);

  const coverage = zeros();
  for (const [d, n] of [...Object.entries(coverageArchive), ...Object.entries(coverageLive)]) {
    const i = idx(d);
    if (i >= 0 && i < N) coverage[i] += n;
  }

  const daily = {};
  for (const l of lines) daily[l.id] = { inc: zeros(), n: zeros(), pl: zeros(), can: zeros(), late: zeros(), alt: zeros() };

  const incByLine = {}, plByLine = {};
  const causeIds = [...CAUSES.map(c => c[0]), 'unknown'];
  const lineIndex = Object.fromEntries(lines.map((l, i) => [l.id, i]));
  const causeAgg = new Map(); // "day|line|cause" → [count, minutes]
  for (const e of events) {
    if (e.k === 'incident') {
      const iv = incidentInterval(e);
      const d0 = idx(sydDate(iv[0]));
      for (const l of e.l) {
        (incByLine[l] ||= []).push(iv);
        if (d0 >= 0 && d0 < N) {
          daily[l].n[d0]++;
          const k = `${d0}|${lineIndex[l]}|${causeIds.indexOf(e.c || 'unknown')}`;
          const a = causeAgg.get(k) || [0, 0];
          a[0]++; a[1] += Math.round((iv[1] - iv[0]) / MIN);
          causeAgg.set(k, a);
        }
      }
    } else if (e.k === 'planned') {
      const ws = plannedWindows(e);
      for (const l of e.l) (plByLine[l] ||= []).push(...ws);
    } else if (e.k === 'trip') {
      const d = idx(sydDate(toMs(e.st)));
      if (d < 0 || d >= N) continue;
      const key = e.s === 'cancelled' ? 'can' : e.s === 'late' ? 'late' : (e.s === 'skipped' || e.s === 'altered') ? 'alt' : null;
      if (key) for (const l of e.l) daily[l][key][d]++;
    }
  }
  const addMinutes = (arr, intervals) => {
    for (const [s, e] of unionMs(intervals)) {
      for (const part of splitByDay(Math.max(s, sydMidnight(start)), Math.min(e, now))) {
        const i = idx(part.date);
        if (i >= 0 && i < N) arr[i] += Math.round(part.ms / MIN);
      }
    }
  };
  for (const [l, ivs] of Object.entries(incByLine)) addMinutes(daily[l].inc, ivs);
  for (const [l, ivs] of Object.entries(plByLine)) addMinutes(daily[l].pl, ivs);

  // ---------- realtime delays ----------
  const delayDaily = {}; // line → { day → {act, late, sum, samples} }
  const recent = {}; // line → { hourIso → {act, late, sum} } for the last 7 days
  const latest = {}; // line → newest sample
  const recentFrom = now - 7 * DAY;
  for (const f of listFiles(path.join(DATA_DIR, 'delays'), /\.csv$/)) {
    for (const r of parseCsv(fs.readFileSync(f, 'utf8'))) {
      const t = toMs(r.ts);
      if (t == null) continue;
      const act = Number(r.active) || 0, late = Number(r.late) || 0, mean = Number(r.mean_delay_s) || 0;
      const line = r.line;
      if (!act) continue;
      const d = sydDate(t);
      const dd = ((delayDaily[line] ||= {})[d] ||= { act: 0, late: 0, sum: 0, samples: 0 });
      dd.act += act; dd.late += late; dd.sum += mean * act; dd.samples++;
      if (t >= recentFrom) {
        const h = iso(Math.floor(t / HOUR) * HOUR);
        const hh = ((recent[line] ||= {})[h] ||= { act: 0, late: 0, sum: 0 });
        hh.act += act; hh.late += late; hh.sum += mean * act;
      }
      if (!latest[line] || t > latest[line].t) latest[line] = { t, active: act, late, mean, max: Number(r.max_delay_s) || 0 };
    }
  }
  const cancels = {}; // line → day → unique cancelled trips (from the realtime feed)
  for (const f of listFiles(path.join(DATA_DIR, 'cancellations'), /\.json$/)) {
    for (const [d, byLine] of Object.entries(readJson(f, {}))) {
      for (const [l, ids] of Object.entries(byLine)) ((cancels[l] ||= {})[d] = ids.length);
    }
  }
  const delayDays = Object.values(delayDaily).flatMap(o => Object.keys(o)).sort();
  const delayStart = delayDays[0] || null;
  const delays = { start: delayStart, lines: {}, recent: {} };
  if (delayStart) {
    const M = daysBetween(delayStart, today) + 1;
    for (const l of lines) {
      const mean = new Array(M).fill(null), pct = new Array(M).fill(null), can = new Array(M).fill(null);
      const dd = delayDaily[l.id] || {};
      for (const [d, v] of Object.entries(dd)) {
        const i = daysBetween(delayStart, d);
        if (i < 0 || i >= M) continue;
        mean[i] = Math.round(v.sum / v.act);
        pct[i] = round1((100 * v.late) / v.act);
      }
      for (const [d, n] of Object.entries(cancels[l.id] || {})) {
        const i = daysBetween(delayStart, d);
        if (i >= 0 && i < M) can[i] = n;
      }
      if (Object.keys(dd).length || cancels[l.id]) delays.lines[l.id] = { mean, pct, can };
      if (recent[l.id]) {
        delays.recent[l.id] = Object.entries(recent[l.id]).sort().map(([h, v]) => [h, Math.round(v.sum / v.act), round1((100 * v.late) / v.act)]);
      }
    }
  }

  // ---------- service delivered ----------
  const service = buildService();
  let svcDaily = null;
  if (service.days.length) {
    // Trips counted and lost per line and day, for the calendar (from the first recorded day).
    const s0 = idx(service.days[0].date);
    svcDaily = { start: s0, lines: {} };
    const K = Object.fromEntries(COUNTERS.map((c, i) => [c, i]));
    for (const [l, perDay] of Object.entries(service.lines)) {
      const tc = new Array(N - s0).fill(0), tl = new Array(N - s0).fill(0);
      service.days.forEach((d, j) => {
        const c = perDay[j];
        const i = idx(d.date) - s0;
        if (!c || i < 0 || i >= tc.length) return;
        tc[i] = c[K.counted];
        tl[i] = c[K.cancelled] + c[K.missing];
      });
      svcDaily.lines[l] = { tc, tl };
    }
  }

  // ---------- delay clock ----------
  writeJson(out('data', 'clock.json'), buildClock(service));

  // ---------- trackwork ahead ----------
  const trackwork = buildTrackwork(new Set(lines.map(l => l.id)));
  writeJson(out('data', 'trackwork.json'), trackwork);

  // ---------- status (right now) ----------
  const meta = readJson(path.join(DATA_DIR, 'state', 'meta.json'), {});
  const ongoing = events.filter(e => e.ongoing);
  const todayStart = sydMidnight(today), tomorrowStart = sydMidnight(addDays(today, 1));
  const status = { generatedAt: iso(now), lastRunAt: meta.lastRunAt || null, alertsAt: meta.alertsLastOkAt || null, lines: {} };
  for (const l of lines) {
    const inc = ongoing.filter(e => e.k === 'incident' && e.l.includes(l.id))
      .sort((a, b) => toMs(b.st) - toMs(a.st))
      .map(e => ({ id: e.id, t: headline(e), x: e.x, st: e.st, c: e.c }));
    const planned = events.filter(e => e.k === 'planned' && CLOSURE_SUBS.has(e.s) && e.l.includes(l.id) &&
      plannedWindows(e).some(([f, t]) => f < tomorrowStart && t > todayStart))
      .map(e => ({ id: e.id, t: e.t, now: plannedWindows(e).some(([f, t]) => f <= now && t > now) }));
    const lt = latest[l.id];
    const live = lt && now - lt.t < 30 * MIN ? { at: iso(lt.t), active: lt.active, late: lt.late, mean: lt.mean } : null;
    const canToday = cancels[l.id]?.[today] ?? null;
    status.lines[l.id] = { incidents: inc, planned, live, cancelledToday: canToday };
  }
  // Today's timetabled trips so far, all tracked lines, for the overview.
  const svcToday = service.days.findIndex(d => d.date === today);
  if (svcToday >= 0) {
    const K = Object.fromEntries(COUNTERS.map((c, i) => [c, i]));
    const t = { date: today, asOf: service.days[svcToday].asOf, counted: 0, ran: 0, late: 0, cancelled: 0, missing: 0 };
    for (const l of lines) {
      const c = service.lines[l.id]?.[svcToday];
      if (!c) continue;
      for (const k of ['counted', 'ran', 'late', 'cancelled', 'missing']) t[k] += c[K[k]];
    }
    status.service = t;
  }

  // ---------- event logs ----------
  const logEvents = events.filter(e => LOG_KINDS.has(e.k))
    .map(e => {
      const r = { id: e.id, k: e.k, l: e.l, t: headline(e), x: e.x, st: e.st, en: e.en };
      if (e.s) r.s = e.s;
      if (e.c) r.c = e.c;
      if (e.ongoing) r.o = 1;
      if (e.k === 'planned') {
        const ws = (e.w || []).filter(([f, t]) => f && t).slice(0, 12);
        if (ws.length) {
          r.w = ws;
          r.st = ws[0][0];
          r.en = ws[ws.length - 1][1];
        }
      }
      return r;
    })
    .sort((a, b) => toMs(b.st) - toMs(a.st));
  const byYear = {};
  for (const e of logEvents) (byYear[sydDate(toMs(e.st)).slice(0, 4)] ||= []).push(e);
  ensureDir(out('data', 'log'));
  ensureDir(out('data', 'line'));
  for (const [y, list] of Object.entries(byYear)) writeJson(out('data', 'log', `${y}.json`), list);
  for (const l of lines) {
    const mine = logEvents.filter(e => e.l.includes(l.id) && e.k !== 'advisory');
    // Start-hour and weekday pattern of unplanned incidents.
    const hours = new Array(24).fill(0);
    for (const e of mine) if (e.k === 'incident') hours[sydHour(toMs(e.st))]++;
    writeJson(out('data', 'line', `${l.id}.json`), { id: l.id, hours, events: mine });
  }

  // ---------- meta / daily ----------
  const dailyOut = { start, days: N, coverage, lines: {} };
  for (const l of lines) dailyOut.lines[l.id] = daily[l.id];
  // Sparse incident counts by cause: [dayIndex, lineIndex, causeIndex, incidents, minutes].
  dailyOut.causeOrder = causeIds;
  // TfNSW started publishing alerts about individual trips in 2025; before that there is nothing to count.
  const firstTrip = events.filter(e => e.k === 'trip').reduce((m, e) => Math.min(m, toMs(e.st)), Infinity);
  dailyOut.tripStart = Number.isFinite(firstTrip) ? Math.max(0, idx(sydDate(firstTrip))) : null;
  dailyOut.lineOrder = lines.map(l => l.id);
  dailyOut.causes = [...causeAgg].map(([k, [n, m]]) => [...k.split('|').map(Number), n, m]).sort((a, b) => a[0] - b[0]);
  // Timetabled trips counted (tc) and lost (tl: cancelled or never appeared) per line and day, from service.start.
  dailyOut.service = svcDaily;
  writeJson(out('data', 'service.json'), service);
  writeJson(out('data', 'daily.json'), dailyOut);
  const stationCatalogue = buildStations(new Set(lines.map(l => l.id)));
  writeJson(out('data', 'stations.json'), stationCatalogue);
  // Opal-derived station counts never come from GTFS vehicle occupancy.
  // Missing or unvalidated inputs produce an explicitly unavailable dataset.
  // Errors must not interrupt the 5-minute collection and alert publishing.
  let stationPatronage;
  try {
    stationPatronage = buildStationPatronage(DATA_DIR, stationCatalogue);
  } catch (e) {
    stationPatronage = { available: false, reason: 'Station import rejected: ' + e.message,
      typical: {}, monthly: {}, coverage: { years: [], months: [], stationCount: 0 } };
    console.warn('Station patronage dataset rejected: ' + e.message);
  }
  writeJson(out('data', 'station-patronage.json'), stationPatronage);
  // Do not silently claim station figures are published when the output is
  // a searchable station directory. Keep the live transport build resilient,
  // but surface exactly what the station import produced in Actions logs.
  console.log('Published Opal station patronage: ' + JSON.stringify({
    available: stationPatronage.available,
    reason: stationPatronage.reason || null,
    matchedStations: stationPatronage.coverage?.stationCount || 0,
    sampledTimeWindows: stationPatronage.coverage?.periodRows || 0,
    historicalStationMonths: stationPatronage.coverage?.legacyMonthlyRows || 0,
    recentStationMonths: stationPatronage.coverage?.monthlyRows || 0,
    latestHistoricalMonth: stationPatronage.coverage?.legacyMonths?.at(-1) || null,
    latestRecentMonth: stationPatronage.coverage?.months?.at(-1) || null,
  }));
  // Carriage occupancy by rail line and Sydney-local hour (30 days, never passenger tap counts).
  const crowdingLines = new Set(lines.filter(l => ['train', 'metro', 'intercity'].includes(l.mode)).map(l => l.id));
  writeJson(out('data', 'crowding.json'), buildCrowding(DATA_DIR, today, crowdingLines, { generatedAt: now }));
  writeJson(out('data', 'delays.json'), delays);
  writeJson(out('data', 'status.json'), status);
  buildMap(lines, status, trackwork, ongoing);
  const firstLive = Object.keys(coverageLive).sort()[0] || null;
  writeJson(out('data', 'meta.json'), {
    generatedAt: iso(now),
    today,
    start,
    firstLiveDay: firstLive,
    delayStart,
    serviceStart: service.days[0]?.date || null,
    lines: lines.map(l => ({ id: l.id, mode: l.mode, name: l.name, color: l.color, note: l.note || null })),
    modes: MODES,
    causes: Object.fromEntries([...CAUSES.map(([id, label]) => [id, label]), ['unknown', 'Not stated']]),
    logYears: Object.keys(byYear).sort(),
    counts: { events: events.length, incidents: events.filter(e => e.k === 'incident').length, planned: events.filter(e => e.k === 'planned').length },
    archive: meta.archiveImport || null,
    feeds: Object.fromEntries(Object.entries(meta.realtime || {}).map(([k, v]) => [k, {
      label: FEEDS.find(f => f.key === k)?.label || k,
      lastAt: v.last?.at || null, trips: v.last?.trips ?? null, matched: v.last?.matched ?? null, error: v.lastError?.message || null, errorAt: v.lastError?.at || null,
    }])),
    lastRunErrors: meta.lastRunErrors || [],
    config: { maxIncidentHours: MAX_INCIDENT_MS / HOUR },
  });
}

// ---------- service delivered ----------
// service.json: per line and recorded day, the counters from service-stats.js, plus trips lost by
// hour of day over the last 7 and 30 days. data/service/<date>.json: the trips that were lost, late
// or cut short on one day, and the hour profile, for the last 14 days.
const SERVICE_DETAIL_DAYS = 14;
function buildService() {
  const names = stationNames();
  const days = readServiceDays(DATA_DIR);
  const service = { generatedAt: iso(now), cols: COUNTERS, days: [], lines: {}, hours: { '7d': {}, '30d': {} } };
  ensureDir(out('data', 'service'));
  // A line and train type pair counts as covered by the feed if most of its trips appeared in it over
  // the week up to the day.
  const cutoffOf = day => (day.final ? null : Math.floor(((toMs(day.updatedAt) ?? now) - day.base) / 1000));
  const pairs = days.map(d => pairStats(d.record, { nowSec: cutoffOf(d) }));
  days.forEach((day, j) => {
    const asOf = day.final ? null : day.updatedAt || null;
    const nowSec = cutoffOf(day);
    const tracked = trackedPairs(pairs.filter((_, k) => k <= j && daysBetween(days[k].date, day.date) < 7));
    const s = summariseDay(day.record, { nowSec, tracked });
    service.days.push({ date: day.date, final: day.final, asOf, cutoff: nowSec });
    for (const [l, c] of Object.entries(s.lines)) {
      (service.lines[l] ||= [])[j] = c;
    }
    const age = daysBetween(day.date, today);
    for (const [period, n] of [['7d', 7], ['30d', 30]]) {
      if (age >= n) continue;
      for (const [l, hrs] of Object.entries(s.hours)) {
        const acc = (service.hours[period][l] ||= Array.from({ length: 24 }, () => [0, 0]));
        hrs.forEach(([c, lost], i) => { acc[i][0] += c; acc[i][1] += lost; });
      }
    }
    if (age < SERVICE_DETAIL_DAYS) {
      const trips = {};
      for (const [l, list] of Object.entries(s.trips)) {
        trips[l] = list.map(([start, headsign, origin, outcome, delay, cars, forecast]) =>
          [start, headsign, origin ? names.get(origin) || null : null, outcome, delay, cars, forecast]);
      }
      writeJson(out('data', 'service', `${day.date}.json`), { date: day.date, final: day.final, asOf, cutoff: nowSec, lines: s.lines, trips, hours: s.hours });
    }
  });
  // Fill the gaps (days a line had no trips) so every line has one entry per day.
  for (const l of Object.keys(service.lines)) {
    for (let j = 0; j < service.days.length; j++) if (!service.lines[l][j]) service.lines[l][j] = null;
  }
  return service;
}

// ---------- delay clock ----------
// clock.json: passenger-minutes lost per line and day, to lateness (from load/*.csv) and to waiting
// after a cancelled or missing trip (from the service record), the network rate at the latest run,
// and lateness by hour for the last 7 days.
function buildClock(service) {
  const rows = [];
  for (const f of listFiles(path.join(DATA_DIR, 'load'), /\.csv$/)) rows.push(...parseCsv(fs.readFileSync(f, 'utf8')));
  const modeOf = id => LINE_BY_ID[id]?.mode || modeOfLineId(id) || 'train';
  const { days: byDay, latest, first } = delayClock(rows, modeOf);
  const K = Object.fromEntries(COUNTERS.map((c, i) => [c, i]));
  const svcIdx = new Map(service.days.map((d, j) => [d.date, j]));
  const dates = [...new Set([...Object.keys(byDay), ...service.days.map(d => d.date)])].sort();
  const lineIds = new Set([...Object.values(byDay).flatMap(o => Object.keys(o)), ...Object.keys(service.lines)]);
  const lines = {};
  for (const id of lineIds) {
    const perDay = dates.map(d => {
      const late = byDay[d]?.[id]?.min ?? null;
      const j = svcIdx.get(d);
      const wait = j != null ? service.lines[id]?.[j]?.[K.lostWaitMin] ?? null : null;
      return late == null && !wait ? null : [Math.round(late || 0), wait || 0];
    });
    if (perDay.some(Boolean)) lines[id] = perDay;
  }
  const fresh = Object.values(latest).filter(x => now - x.at < 15 * MIN);
  const hours = {};
  for (const d of dates.filter(d => daysBetween(d, today) < 7)) {
    const hrs = new Array(24).fill(0);
    for (const L of Object.values(byDay[d] || {})) L.hours.forEach((v, i) => { hrs[i] += v; });
    hours[d] = hrs.map(Math.round);
  }
  return {
    generatedAt: iso(now),
    asOf: fresh.length ? iso(Math.max(...fresh.map(x => x.at))) : null,
    perMin: Math.round(fresh.reduce((a, x) => a + x.perMin, 0)),
    aboard: Math.round(fresh.reduce((a, x) => a + x.pax, 0)),
    days: dates,
    // First reading of each day, so a day that started part-way can say so.
    firstAt: dates.map(d => (first[d] ? iso(first[d]) : null)),
    cols: ['late', 'wait'],
    lines,
    hours,
    assumptions: { rideMinutes: RIDE_MINUTES, carLoad: CAR_LOAD },
  };
}

// ---------- trackwork ahead ----------
// trackwork.json: planned alerts still to come, with the Sydney days the page's timeline covers
// (from today until the last published closure, at least two weeks and at most five).
function buildTrackwork(lineIds) {
  const open = Object.values(readJson(path.join(DATA_DIR, 'alerts', 'open.json'), { open: {} }).open || {});
  const items = trackworkItems(open, now).map(it => ({ ...it, l: it.l.filter(l => lineIds.has(l)) })).filter(it => it.l.length);
  const lastEnd = Math.max(0, ...items.flatMap(it => it.w.map(([, t]) => Date.parse(t))));
  const n = Math.max(14, Math.min(35, daysBetween(today, sydDate(lastEnd || now)) + 1));
  const days = Array.from({ length: n + 1 }, (_, i) => { const d = addDays(today, i); return [d, iso(sydMidnight(d))]; });
  return { generatedAt: iso(now), days, items };
}

// Station id → short name ("Central"), from the timetable station lists.
function stationNames() {
  const out = new Map();
  for (const f of listFiles(path.join(DATA_DIR, 'stations'), /\.json$/)) {
    for (const [id, st] of Object.entries(readJson(f, {})?.stations || {})) {
      if (st.n) out.set(id, st.n.replace(/\s+(Station|Light Rail|Metro Station)$/i, '').trim());
    }
  }
  return out;
}

// ---------- network map ----------
// network.json: each line's track (projected, in 10 m units, delta-encoded chains), stations, and the
// two views. live.json: where each train is with its delay and estimated load, and the sections of
// track named in current incidents and trackwork.
const MAP_LABELS = {
  // Always labelled, and labelled in the Sydney view.
  2: ['Central', 'Town Hall', 'Wynyard', 'Circular Quay', 'Martin Place', 'Redfern', 'Barangaroo',
    'Victoria Cross', 'Crows Nest', 'Gadigal', 'Waterloo', 'Parramatta', 'Strathfield', 'Chatswood',
    'Hornsby', 'Penrith', 'Liverpool', 'Campbelltown', 'Sutherland', 'Bondi Junction',
    'Tallawong', 'Bankstown', 'Newcastle', 'Gosford', 'Wollongong', 'Lithgow', 'Goulburn', 'Bomaderry', 'Scone', 'Richmond', 'Cronulla', 'Leppington'],
  1: ['Wynyard', 'North Sydney', 'Epping', 'Blacktown', 'Lidcombe', 'Hurstville', 'Sydenham', 'Wolli Creek', 'Olympic Park', 'Macquarie University',
    'Westmead', 'Carlingford', 'Randwick', 'Juniors Kingsford', 'Waterfall', 'Berowra', 'Granville', 'Schofields', 'Cabramatta', 'Glenfield'],
};
const CITY_VIEW = [[-33.815, 151.172], [-33.935, 151.26]]; // geographically bounded CBD / inner suburbs
const SYDNEY_VIEW = [[-33.575, 150.655], [-34.16, 151.29]]; // north-west and south-east corners (lat, lon)

function buildMap(lines, status, trackwork, ongoing) {
  const lineIds = new Set(lines.map(l => l.id));
  const chains = {};
  for (const f of listFiles(path.join(DATA_DIR, 'network'), /\.json$/)) {
    const net = readJson(f, {});
    for (const [line, cs] of Object.entries(net.lines || {})) {
      if (!lineIds.has(line)) continue;
      (chains[line] ||= []).push(...projectChains(cs, net.grid || 1e4));
    }
  }
  if (!Object.keys(chains).length) return;
  // Stations (merged by name across feeds), with labels for the main ones.
  // Priority 2 must win when a CBD station appears in both label sets.
  const labels = new Map([...MAP_LABELS[1].map(n => [stationKey(n), 1]), ...MAP_LABELS[2].map(n => [stationKey(n), 2])]);
  const stations = new Map();
  for (const f of listFiles(path.join(DATA_DIR, 'stations'), /\.json$/)) {
    for (const st of Object.values(readJson(f, {})?.stations || {})) {
      const ls = (st.l || []).filter(l => lineIds.has(l));
      if (!st.n || !st.la || !ls.length) continue;
      const k = stationKey(st.n);
      const cur = stations.get(k);
      if (cur) { for (const l of ls) cur.lines.add(l); continue; }
      stations.set(k, { name: st.n.replace(/\s+(Station|Light Rail)$/i, '').trim(), xy: project(st.la, st.lo), lines: new Set(ls) });
    }
  }
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const cs of Object.values(chains)) for (const c of cs) for (const [x, y] of c) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  const [sa, sb] = [project(...SYDNEY_VIEW[0]), project(...SYDNEY_VIEW[1])];
  const [ca, cb] = [project(...CITY_VIEW[0]), project(...CITY_VIEW[1])];
  const geographicNetwork = {
    generatedAt: iso(now),
    unit: 10,
    views: { city: [ca[0], ca[1], cb[0], cb[1]], sydney: [sa[0], sa[1], sb[0], sb[1]], all: [x0, y0, x1, y1] },
    lines: Object.fromEntries(Object.entries(chains).map(([l, cs]) => [l, cs.map(encodeChain)])),
    stations: [...stations.entries()].map(([k, s]) => [s.name, s.xy[0], s.xy[1], [...s.lines].join(' '), labels.get(k) || 0]),
  };
  // Extra display-only metadata. Keep all original GTFS station-line associations
  // for timetable, source review, and unusual operating services.
  geographicNetwork.stationProximity = buildGeographicStationProximity(geographicNetwork);
  writeJson(out('data', 'network.json'), geographicNetwork);

  // The network diagram (lib/schematic.js): its layout, and helpers to put trains and sections on it.
  const SCH = buildSchematic();
  // Separate data asset: station geographic sequence for the Patronage page,
  // distinct from observed Opal entries/exits and from live train positions.
  writeJson(out('data', 'station-routes.json'), buildPatronageRoutes(SCH.seqs));
  const schName = new Map([...SCH.lay.pos.keys()].map(n => [stationKey(n), n]));
  const realXY = n => stations.get(stationKey(n))?.xy;
  const R2 = v => Math.round(v * 100) / 100;
  const flat = pts => pts.flatMap(([x, y]) => [R2(x), R2(y)]);
  const allPts = [...SCH.lay.pos.values()];
  writeJson(out('data', 'schematic.json'), {
    generatedAt: iso(now),
    views: {
      ...SCHEMATIC_VIEWS,
      all: [Math.min(...allPts.map(p => p[0])) - 2, Math.min(...allPts.map(p => p[1])) - 2, Math.max(...allPts.map(p => p[0])) + 4, Math.max(...allPts.map(p => p[1])) + 2],
    },
    lines: Object.fromEntries(Object.entries(SCH.pieces).map(([l, ps]) => [l, ps.map(flat)])),
    gap: SCH.gap,
    layoutVersion: DIAGRAM_LAYOUT_VERSION,
    terminals: terminalCallouts(SCH.lay),
    cols: ['name', 'x', 'y', 'width', 'lines', 'label', 'side', 'angle', 'ring'],
    stations: [...SCH.lay.pos].map(([n, [x, y]]) => {
      const m = SCH.marker.get(n);
      return [n, R2(x), R2(y), m.lines, [...(SCH.linesAt.get(n) || [])].join(' '), labels.get(stationKey(n)) || 0, labelSide(SCH, n), m.angle, m.ring ? 1 : 0];
    }),
  });
  const place = trainPlacer(SCH, realXY);
  const onDiagram = (line, x, y) => { const p = place(line, x, y); return p ? [R2(p[0]), R2(p[1])] : [null, null]; };

  // Trains.
  const pos = readJson(path.join(DATA_DIR, 'live', 'positions.json'), null);
  const trains = [];
  const counts = { trains: 0, late5: 0, late10: 0, byLine: {} };
  if (pos && now - Date.parse(pos.at) < 30 * MIN) {
    for (const [, line, lat, lon, , delay, carLevels, level, cars, headsign] of pos.trains || []) {
      if (!lineIds.has(line) || /^empty train$/i.test(headsign || '')) continue;
      const mode = LINE_BY_ID[line]?.mode === 'metro' ? 'metro' : 'train';
      const table = CAR_LOAD[mode];
      const lv = String(carLevels || '').split('').map(Number).filter(n => n >= 0 && n <= 5);
      let pax = null, fullest = null;
      if (lv.length) { pax = lv.reduce((a, l) => a + table[l], 0); fullest = Math.max(...lv); }
      else if (level != null && cars) { pax = cars * table[level]; fullest = level; }
      const [x, y] = project(lat, lon);
      trains.push([line, x, y, delay, pax == null ? null : Math.round(pax), fullest, cars || null, headsign || null, ...onDiagram(line, x, y)]);
      counts.trains++;
      const thr = lateThresholdSeconds(line);
      if (delay != null && delay >= thr) { counts.late5++; counts.byLine[line] = (counts.byLine[line] || 0) + 1; }
      if (delay != null && delay >= 600) counts.late10++;
    }
  }

  // Sections and places named in current incidents and in trackwork happening now.
  const graph = new TrackGraph(chains);
  const stationNode = (name, ls) => {
    const s = stations.get(stationKey(name));
    return s ? { s, node: graph.nearest(s.xy, 80, ls) } : null;
  };
  const overlays = [];
  const addOverlay = (kind, ls, title, text) => {
    const places = affectedPlaces(`${title}. ${text || ''}`, kind);
    const paths = [], pins = [];
    for (const names of places.between) {
      const found = names.map(n => stationNode(n, ls)).filter(x => x && x.node >= 0);
      for (let i = 1; i < found.length; i++) {
        const p = graph.path(found[i - 1].node, found[i].node);
        if (p && p.length > 1) paths.push(encodeChain(p));
      }
    }
    for (const name of places.at) {
      const f = stationNode(name, ls);
      if (f) pins.push([f.s.xy[0], f.s.xy[1], f.s.name]);
    }
    // The same sections on the diagram: along the corridors, on the strands of the lines affected.
    const sp = diagramSections(SCH, places.between.map(names => names.map(n => schName.get(stationKey(n))).filter(Boolean)), ls).map(flat), spins = [];
    for (const name of places.at) {
      const n = schName.get(stationKey(name)), p = n && SCH.lay.pos.get(n);
      if (p && !spins.some(q => q[2] === n)) spins.push([R2(p[0]), R2(p[1]), n]);
    }
    overlays.push({ kind, lines: ls, title, paths, pins, sp, spins });
  };
  const seen = new Set();
  for (const e of ongoing.filter(e => e.k === 'incident')) {
    if (seen.has(e.id)) continue;
    seen.add(e.id);
    addOverlay('incident', e.l.filter(l => lineIds.has(l)), headline(e), e.x);
  }
  for (const it of trackwork.items) {
    if (it.sev < 2 || !it.w.some(([f, t]) => Date.parse(f) <= now && Date.parse(t) > now)) continue;
    addOverlay('closed', it.l, it.title, it.bullets.join('\n'));
  }
  writeJson(out('data', 'live.json'), { generatedAt: iso(now), at: pos?.at || null, cols: ['line', 'x', 'y', 'delay', 'pax', 'fullest', 'cars', 'headsign', 'sx', 'sy'], trains, counts, overlays });
}

// Stations for the trip page: [id, name, [lines], [lines with only some services]] sorted by name.
// Feeds list the same station under the same id; stops that share a name (e.g. each direction of a
// light rail stop) are merged into one. Timetables include trackwork and special-event workings, so a
// line only counts as stopping at a station if it makes at least 3% as many stops there as at its
// busiest station, and below 25% it is marked as "some services".
const STATION_MIN_SHARE = 0.03;
const STATION_SOME_SHARE = 0.25;
function buildStations(lineIds) {
  const byName = new Map();
  for (const f of listFiles(path.join(DATA_DIR, 'stations'), /\.json$/)) {
    const stations = readJson(f, {})?.stations || {};
    for (const [id, st] of Object.entries(stations)) {
      if (!st.n) continue;
      const counts = st.c || Object.fromEntries((st.l || []).map(l => [l, 1]));
      const key = st.n.toLowerCase();
      let cur = byName.get(key);
      if (!cur) byName.set(key, (cur = { id, n: st.n, c: {} }));
      else if (id < cur.id) cur.id = id; // stable choice when several stops share a name
      for (const [l, n] of Object.entries(counts)) if (lineIds.has(l)) cur.c[l] = (cur.c[l] || 0) + n;
    }
  }
  const busiest = {};
  for (const st of byName.values()) for (const [l, n] of Object.entries(st.c)) busiest[l] = Math.max(busiest[l] || 0, n);
  const out = [];
  for (const st of byName.values()) {
    const lines = [], some = [];
    for (const [l, n] of Object.entries(st.c)) {
      const share = n / busiest[l];
      if (share < STATION_MIN_SHARE) continue;
      lines.push(l);
      if (share < STATION_SOME_SHARE) some.push(l);
    }
    if (!lines.length) continue;
    const order = (a, b) => lineOrder(a) - lineOrder(b);
    out.push([st.id, st.n, lines.sort(order), some.sort(order)]);
  }
  return out.sort((a, b) => a[1].localeCompare(b[1]));
}

function copySite() {
  ensureDir(OUT_DIR);
  for (const f of listFiles(SITE_DIR)) {
    const rel = path.relative(SITE_DIR, f);
    const dest = out(rel);
    ensureDir(path.dirname(dest));
    fs.copyFileSync(f, dest);
  }
  fs.writeFileSync(out('.nojekyll'), '');
}

copySite();
publishSiteRelease(SITE_DIR, OUT_DIR, { generatedAt: now });
build();
console.log(`Built site in ${OUT_DIR} at ${iso(now)}`);
