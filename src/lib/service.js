// Daily record of every timetabled trip and what the realtime feed showed about it, so the site can
// compare the service that was scheduled with the service that ran.
//
// While a service day is open (until 6 am the next morning) the collector keeps:
//   service/YYYY-MM/YYYY-MM-DD.sched.json  the day's timetable, frozen when the day starts
//   service/open.json                     observations so far, and when each feed was being watched
// When the day is over both are merged into service/YYYY-MM/YYYY-MM-DD.json and the two are removed.
//
// Times in these files are seconds after midnight at the start of the service day (Sydney time),
// as in GTFS; trips after midnight have values above 86400.
import fs from 'node:fs';
import path from 'node:path';
import { readJson, writeJson } from './store.js';
import { scheduledTrips } from './gtfs-static.js';
import { TRIP_SR } from './gtfs-rt.js';
import { sydDate, sydMidnight, addDays, iso, HOUR, MIN } from './time.js';

// Trip flags (bits).
export const FLAG = {
  SEEN: 1,             // in the realtime feed as a timetabled trip
  RAN: 2,              // seen running (with a current delay) at least once
  CANCELLED: 4,        // marked cancelled at some point
  CANCELLED_LAST: 8,   // still marked cancelled the last time it was seen
  ADDED: 16,           // published as an extra, replacement or duplicated trip
  DELAY_ONLY: 32,      // the feed gave delays but no stop times for it
  UNSCHEDULED: 64,     // not in the day's timetable
};

export const TRIP_COLUMNS = ['feed', 'trip', 'line', 'dir', 'start', 'end', 'flags', 'first_seen', 'last_seen',
  'max_delay', 'end_delay', 'skipped', 'occ', 'cars', 'model', 'rt_start'];

// Observation array positions (in open.json).
const O = { FLAGS: 0, FIRST: 1, LAST: 2, MAX: 3, END: 4, SKIP: 5, OCC: 6, CARS: 7, MODEL: 8, LINE: 9, RTSTART: 10 };

const CLOSE_AFTER = 30 * HOUR;     // a service day is finalised at 6 am the next day
const GAP = 15 * MIN;              // runs further apart than this break a coverage interval

const ymdToDate = s => (/^\d{8}$/.test(s || '') ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : null);

export class ServiceRecorder {
  constructor(dataDir, nowMs) {
    this.dataDir = dataDir;
    this.now = nowMs;
    this.file = path.join(dataDir, 'service', 'open.json');
    this.state = readJson(this.file, { days: {} });
    this.state.days ||= {};
    this.schedCache = new Map(); // date → { feeds: { key: { trips: [...] } } }
    this.schedSets = new Map();  // `${date}|${feed}` → Set of trip IDs
    this.dirty = new Set();      // dates whose schedule file changed
    const today = sydDate(nowMs);
    this.day(today);
  }

  schedFile(date) { return path.join(this.dataDir, 'service', date.slice(0, 7), `${date}.sched.json`); }

  // The open record for a date, created if the date is today or yesterday.
  day(date, create = true) {
    const days = this.state.days;
    if (days[date]) return days[date];
    if (!create) return null;
    const today = sydDate(this.now);
    if (date !== today && date !== addDays(today, -1)) return null;
    const base = sydMidnight(date);
    if (this.now >= base + CLOSE_AFTER) return null;
    return (days[date] = { base, sched: {}, cov: {}, obs: {} });
  }

  schedule(date) {
    if (!this.schedCache.has(date)) this.schedCache.set(date, readJson(this.schedFile(date), { date, feeds: {} }));
    return this.schedCache.get(date);
  }

  schedSet(date, feed) {
    const k = `${date}|${feed}`;
    if (!this.schedSets.has(k)) this.schedSets.set(k, new Set((this.schedule(date).feeds[feed]?.trips || []).map(t => t[0])));
    return this.schedSets.get(k);
  }

  // Freeze each open day's timetable for a feed, the first time a timetable covering it is available.
  freeze(feed, map) {
    for (const [date, d] of Object.entries(this.state.days)) {
      if (d.sched[feed.key] || !map?.sched) continue;
      const ymd = date.replaceAll('-', '');
      const { from, to } = map.stats || {};
      if (from && to && (ymd < from || ymd > to)) continue;
      const trips = scheduledTrips(map, ymd);
      const s = this.schedule(date);
      s.feeds[feed.key] = { builtAt: map.builtAt, source: map.source, trips };
      this.schedSets.delete(`${date}|${feed.key}`);
      this.dirty.add(date);
      d.sched[feed.key] = { builtAt: map.builtAt, n: trips.length };
    }
  }

  // Service date of a realtime trip: its start_date, else the open day whose timetable has it.
  dateOf(feedKey, t) {
    const d = ymdToDate(t.startDate);
    if (d) return d;
    for (const date of Object.keys(this.state.days).sort().reverse()) {
      if (t.tripId && this.schedSet(date, feedKey).has(t.tripId)) return date;
    }
    return sydDate(this.now - 4 * HOUR);
  }

  // A successful fetch of a feed: extend the time it has been watched on each open day.
  covered(feedKey, atMs = this.now) {
    for (const d of Object.values(this.state.days)) {
      const s = Math.round((atMs - d.base) / 1000);
      const list = (d.cov[feedKey] ||= []);
      const last = list[list.length - 1];
      if (last && s - last[1] <= GAP / 1000 && s >= last[0]) last[1] = s;
      else list.push([s, s]);
    }
  }

  // Record one feed's trips (from lineStats().tripList). Returns diagnostics on how the realtime
  // trip IDs match the timetable.
  record(feedKey, tripList, atMs = this.now) {
    const diag = { trips: 0, noId: 0, dated: 0, other: 0, inTimetable: 0, notInTimetable: 0, bySr: {}, missing: [], example: null };
    for (const t of tripList) {
      diag.trips++;
      diag.bySr[t.sr] = (diag.bySr[t.sr] || 0) + 1;
      if (!t.tripId) { diag.noId++; continue; }
      const date = this.dateOf(feedKey, t);
      if (t.startDate) diag.dated++;
      const d = this.day(date);
      if (!d) { diag.other++; continue; }
      const s = Math.round((atMs - d.base) / 1000);
      const set = this.schedSet(date, feedKey);
      if (set.size) {
        if (set.has(t.tripId)) diag.inTimetable++;
        else {
          diag.notInTimetable++;
          if (diag.missing.length < 4 && t.sr === TRIP_SR.SCHEDULED) diag.missing.push(t.tripId);
        }
        if (!diag.example) diag.example = [...set][0];
      }
      const obs = (d.obs[feedKey] ||= {});
      let o = obs[t.tripId];
      if (!o) o = obs[t.tripId] = [0, s, s, null, null, 0, null, 0, null, t.line, t.startTime];
      const { sum } = t;
      let f = o[O.FLAGS];
      if (t.sr === TRIP_SR.CANCELED || t.sr === TRIP_SR.DELETED) f |= FLAG.CANCELLED | FLAG.CANCELLED_LAST;
      else {
        f &= ~FLAG.CANCELLED_LAST;
        if (t.sr === TRIP_SR.SCHEDULED) f |= FLAG.SEEN;
        else f |= FLAG.ADDED;
        if (sum.running) {
          f |= FLAG.RAN;
          if (!sum.hasTimes) f |= FLAG.DELAY_ONLY;
          if (o[O.MAX] == null || sum.delay > o[O.MAX]) o[O.MAX] = sum.delay;
        }
        if (sum.endDelay != null) o[O.END] = sum.endDelay;
      }
      o[O.FLAGS] = f;
      o[O.FIRST] = Math.min(o[O.FIRST], s);
      o[O.LAST] = Math.max(o[O.LAST], s);
      if (sum.skipped > o[O.SKIP]) o[O.SKIP] = sum.skipped;
      if (sum.occMax != null && (o[O.OCC] == null || sum.occMax > o[O.OCC])) o[O.OCC] = sum.occMax;
      if (sum.cars > o[O.CARS]) o[O.CARS] = sum.cars;
      if (sum.model) o[O.MODEL] = sum.model;
    }
    return diag;
  }

  // Merge finished days into their final file. Returns the dates finalised.
  finalise(atMs = this.now) {
    const done = [];
    for (const [date, d] of Object.entries(this.state.days)) {
      if (atMs < d.base + CLOSE_AFTER) continue;
      const sched = this.schedule(date);
      const feedKeys = [...new Set([...Object.keys(sched.feeds), ...Object.keys(d.obs), ...Object.keys(d.cov)])].sort();
      const rows = [];
      const feeds = {};
      for (const key of feedKeys) {
        const obs = d.obs[key] || {};
        const trips = sched.feeds[key]?.trips || [];
        const inSched = new Set();
        for (const [tripId, line, dir, start, end] of trips) {
          inSched.add(tripId);
          const o = obs[tripId];
          rows.push([key, tripId, line, dir, start, end, ...(o ? obsCols(o) : [0, null, null, null, null, 0, null, 0, null, null])]);
        }
        let extra = 0;
        for (const [tripId, o] of Object.entries(obs)) {
          if (inSched.has(tripId)) continue;
          extra++;
          const c = obsCols(o);
          c[0] |= FLAG.UNSCHEDULED;
          rows.push([key, tripId, o[O.LINE], null, null, null, ...c]);
        }
        feeds[key] = {
          timetable: sched.feeds[key]?.builtAt || null,
          scheduled: trips.length,
          observed: Object.keys(obs).length,
          unscheduled: extra,
          coverage: d.cov[key] || [],
        };
      }
      const out = path.join(this.dataDir, 'service', date.slice(0, 7), `${date}.json`);
      writeJson(out, { date, finalisedAt: iso(atMs), feeds, cols: TRIP_COLUMNS, trips: rows });
      try { fs.unlinkSync(this.schedFile(date)); } catch { /* never written */ }
      this.schedCache.delete(date);
      this.dirty.delete(date);
      delete this.state.days[date];
      done.push(date);
    }
    return done;
  }

  save() {
    for (const date of this.dirty) writeJson(this.schedFile(date), this.schedule(date));
    this.dirty.clear();
    this.state.updatedAt = iso(this.now);
    writeJson(this.file, this.state);
  }
}

// Observation → final columns: flags, first_seen, last_seen, max_delay, end_delay, skipped, occ, cars, model, rt_start
function obsCols(o) {
  return [o[O.FLAGS], o[O.FIRST], o[O.LAST], o[O.MAX], o[O.END], o[O.SKIP], o[O.OCC], o[O.CARS], o[O.MODEL], o[O.RTSTART] ?? null];
}
