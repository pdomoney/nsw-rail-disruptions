// Turns the daily service records into what the site shows: for each line and day, how many
// timetabled trips ran, ran late, were cancelled or never appeared.
import { FLAG, TRIP_COLUMNS } from './service.js';
import { lateThresholdSeconds } from '../config/lines.js';

const C = Object.fromEntries(TRIP_COLUMNS.map((c, i) => [c, i]));

// Per line and day, in this order:
//   sched      timetabled trips
//   due        of those, trips whose time has come (all of them once the day is over)
//   counted    due trips the site can judge: the feed was being watched while they were due, and
//              their train type appears in the realtime feed at all
//   ran        seen running
//   late       ran, and reached the end of the line at least 5 minutes late (6 for Intercity)
//   part       ran, but skipped stops
//   cancelled  marked cancelled in the feed and never seen running
//   missing    never appeared in the feed
//   unclear    appeared in the feed but was never seen running or cancelled
//   untracked  due trips, while the feed was watched, of train types that rarely appear in it
//   (due − counted − untracked trips were due while the feed was not being watched)
//   added      extra trips that ran (not in the timetable)
//   paxCounted, paxLost  estimated passengers on counted trips and on cancelled or missing ones
//                        (Sydney Trains and Intercity only, where TfNSW forecasts occupancy)
export const COUNTERS = ['sched', 'due', 'counted', 'ran', 'late', 'part', 'cancelled', 'missing', 'unclear', 'untracked', 'added', 'paxCounted', 'paxLost'];
const K = Object.fromEntries(COUNTERS.map((c, i) => [c, i]));

// Rough passengers aboard one carriage at each TfNSW occupancy level (empty, many seats, few seats,
// standing room, crowded, full), for a double-deck Sydney Trains carriage of about 110 seats.
export const PAX_PER_CAR = [5, 35, 85, 125, 160, 180];
// Average journey length, to turn the average load of a trip into the number of people who use it.
export const RIDE_MINUTES = 25;

// Estimated passengers using one trip: carriages × average load × trip length ÷ average journey.
export function tripPassengers(cars, forecast10, minutes) {
  if (!cars || forecast10 == null || !(minutes > 0)) return null;
  const x = Math.max(0, Math.min(5, forecast10 / 10));
  const i = Math.min(4, Math.floor(x));
  const perCar = PAX_PER_CAR[i] + (PAX_PER_CAR[i + 1] - PAX_PER_CAR[i]) * (x - i);
  return cars * perCar * Math.max(1, minutes / RIDE_MINUTES);
}

// Seconds of [a, b] covered by a list of [from, to] intervals.
function overlap(intervals, a, b) {
  let s = 0;
  for (const [f, t] of intervals) s += Math.max(0, Math.min(b, t) - Math.max(a, f));
  return s;
}

// A trip can be judged if the feed was watched for most of its run (at least 10 minutes, or half of
// a shorter trip), counting from 5 minutes before it was due to start.
export function watched(coverage, start, end) {
  const a = start - 300, b = Math.max(end ?? start, start) + 300;
  const need = Math.min(600, (b - a) / 2);
  return overlap(coverage, a, b) >= need;
}

export function outcome(flags, row) {
  if (flags & FLAG.RAN) return 'ran';
  if (flags & FLAG.CANCELLED) return 'cancelled';
  if (!(flags & (FLAG.SEEN | FLAG.ADDED))) return 'missing';
  return 'unclear';
}

const isEmptyRun = r => /^empty train$/i.test(r[C.headsign] || '');
const pairOf = r => `${r[C.line]}|${r[C.type] ?? ''}`;
const isDue = (r, nowSec) => nowSec == null || Math.max(r[C.end] ?? r[C.start], r[C.start]) + 600 <= nowSec;

// For each line and train type pair ("SCO|N2"): [timetabled trips due while the feed was watched, how
// many of them appeared in it]. Some train types (such as diesel railcar shuttles) hardly ever appear
// in the realtime feed, so their trips cannot be judged.
export function pairStats(record, { nowSec = null } = {}) {
  const out = new Map();
  for (const feed of Object.values(record.feeds || {})) {
    for (const r of feed.trips || []) {
      if (!r[C.line] || r[C.start] == null || (r[C.flags] & FLAG.UNSCHEDULED) || isEmptyRun(r)) continue;
      if (!isDue(r, nowSec) || !watched(feed.coverage || [], r[C.start], r[C.end])) continue;
      const k = pairOf(r);
      const v = out.get(k) || [0, 0];
      v[0]++;
      if (r[C.flags]) v[1]++;
      out.set(k, v);
    }
  }
  return out;
}

// Pairs whose due trips mostly (half or more) appeared in the feed, over one or more days of pairStats.
export function trackedPairs(statsList) {
  const sum = new Map();
  for (const m of statsList) {
    for (const [k, [due, seen]] of m) {
      const v = sum.get(k) || [0, 0];
      v[0] += due; v[1] += seen;
      sum.set(k, v);
    }
  }
  return new Set([...sum].filter(([, [due, seen]]) => due > 0 && seen / due >= 0.5).map(([k]) => k));
}

// One service day → { lines: { line: counters[] }, trips: { line: [[start, headsign, origin, outcome, delay, cars, forecast]] },
// hours: { line: [[counted, lost] × 24] } }. For an open day, nowSec (seconds since the day's
// midnight) limits it to trips that should have finished 10 minutes ago. tracked (from trackedPairs,
// usually over several days) says which line and train type pairs the feed covers; by default, that
// day's. Trips labelled "Empty Train" carry no passengers and are left out.
export function summariseDay(record, { nowSec = null, tracked = null } = {}) {
  const isTracked = tracked || trackedPairs([pairStats(record, { nowSec })]);
  const lines = {};
  const trips = {};
  const hours = {};
  const L = line => (lines[line] ||= new Array(COUNTERS.length).fill(0));
  for (const [feedKey, feed] of Object.entries(record.feeds || {})) {
    const cov = feed.coverage || [];
    const rows = feed.trips || [];
    for (const r of rows) {
      const line = r[C.line];
      if (!line) continue;
      const flags = r[C.flags] || 0;
      const c = L(line);
      if (flags & FLAG.UNSCHEDULED) {
        if (flags & FLAG.RAN) c[K.added]++;
        continue;
      }
      const start = r[C.start], end = Math.max(r[C.end] ?? start, start);
      if (start == null || isEmptyRun(r)) continue; // a timetable entry without stop times, or an empty train
      c[K.sched]++;
      if (!isDue(r, nowSec)) continue;
      c[K.due]++;
      if (!watched(cov, start, end)) continue;
      if (!isTracked.has(pairOf(r))) { c[K.untracked]++; continue; }
      c[K.counted]++;
      const o = outcome(flags, r);
      const pax = tripPassengers(r[C.cars], r[C.forecast], (end - start) / 60);
      if (pax != null) c[K.paxCounted] += pax;
      const h = (hours[line] ||= Array.from({ length: 24 }, () => [0, 0]));
      const hr = Math.floor(start / 3600) % 24;
      h[hr][0]++;
      let delay = null;
      if (o === 'ran') {
        c[K.ran]++;
        delay = r[C.end_delay] ?? r[C.max_delay];
        const late = delay != null && delay >= lateThresholdSeconds(line);
        if (late) c[K.late]++;
        if (r[C.skipped] > 0) c[K.part]++;
        if (!late && !(r[C.skipped] > 0)) continue;
      } else {
        c[K[o]]++;
        if (o === 'cancelled' || o === 'missing') {
          h[hr][1]++;
          if (pax != null) c[K.paxLost] += pax;
        }
      }
      (trips[line] ||= []).push([start, r[C.headsign], r[C.origin], o === 'ran' ? (r[C.skipped] > 0 ? 'part' : 'late') : o, delay, r[C.cars], r[C.forecast]]);
    }
  }
  for (const c of Object.values(lines)) { c[K.paxCounted] = Math.round(c[K.paxCounted]); c[K.paxLost] = Math.round(c[K.paxLost]); }
  for (const list of Object.values(trips)) list.sort((a, b) => a[0] - b[0]);
  return { lines, trips, hours };
}
