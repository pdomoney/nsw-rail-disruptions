// GTFS-realtime TripUpdate decoding and per-line delay statistics.
import { Reader, decodeMessage } from './protobuf.js';
import { lateThresholdSeconds } from '../config/lines.js';

const str = r => r.string();
const u32 = r => r.varint();
const i32 = r => r.int32();
const i64 = r => r.int64();
const u64 = r => r.uint64();
const enm = r => Number(r.varint());
const msg = fields => r => decodeMessage(r.sub(), fields);

const StopTimeEvent = { 1: ['delay', i32], 2: ['time', i64], 3: ['uncertainty', i32] };
const StopTimeUpdate = {
  1: ['stopSequence', u32],
  2: ['arrival', msg(StopTimeEvent)],
  3: ['departure', msg(StopTimeEvent)],
  4: ['stopId', str],
  5: ['scheduleRelationship', enm],
};
const TripDescriptor = {
  1: ['tripId', str], 2: ['startTime', str], 3: ['startDate', str],
  4: ['scheduleRelationship', enm], 5: ['routeId', str], 6: ['directionId', u32],
};
const TripUpdate = {
  1: ['trip', msg(TripDescriptor)],
  2: ['stopTimeUpdate', msg(StopTimeUpdate), true],
  4: ['timestamp', u64],
  5: ['delay', i32],
};
const FeedEntity = { 1: ['id', str], 2: ['isDeleted', r => r.bool()], 3: ['tripUpdate', msg(TripUpdate)] };
const FeedHeader = { 1: ['version', str], 2: ['incrementality', enm], 3: ['timestamp', u64] };
const FeedMessage = { 1: ['header', msg(FeedHeader)], 2: ['entity', msg(FeedEntity), true] };

export function decodeFeed(buf) {
  if (!Buffer.isBuffer(buf)) buf = Buffer.from(buf);
  return decodeMessage(new Reader(buf), FeedMessage);
}

export const TRIP_SR = { SCHEDULED: 0, ADDED: 1, UNSCHEDULED: 2, CANCELED: 3, REPLACEMENT: 5, DUPLICATED: 6, DELETED: 7 };
const STU_SKIPPED = 1, STU_NO_DATA = 2;

// Current delay (seconds) of one trip at time `now` (unix seconds), or null if the trip
// is not running right now (not started yet, finished, or no usable delay information).
export function currentDelay(tu, now) {
  const stus = tu.stopTimeUpdate || [];
  let passed = null, upcoming = null;
  for (const s of stus) {
    if (s.scheduleRelationship === STU_SKIPPED || s.scheduleRelationship === STU_NO_DATA) continue;
    const ev = s.departure ?? s.arrival;
    const t = s.departure?.time ?? s.arrival?.time;
    const d = s.departure?.delay ?? s.arrival?.delay;
    if (t == null || ev == null) continue;
    if (t <= now) { if (!passed || t >= passed.t) passed = { t, d }; }
    else if (!upcoming || t < upcoming.t) upcoming = { t, d };
  }
  if (!passed && !upcoming) {
    // Sydney Trains publishes many running trips with delays but no times (the stops listed are the
    // ones still to come). Count those as running if the trip was updated in the last 10 minutes.
    const fresh = typeof tu.timestamp === 'number' && now - tu.timestamp <= 10 * 60;
    if (!fresh) return null;
    for (const s of stus) {
      if (s.scheduleRelationship === STU_SKIPPED || s.scheduleRelationship === STU_NO_DATA) continue;
      const d = s.departure?.delay ?? s.arrival?.delay;
      if (typeof d === 'number') return d;
    }
    return typeof tu.delay === 'number' ? tu.delay : null;
  }
  let candidates;
  if (passed && upcoming) candidates = [passed, upcoming];
  else if (upcoming) candidates = upcoming.t - now <= 15 * 60 ? [upcoming] : [];
  else if (passed) candidates = now - passed.t <= 10 * 60 ? [passed] : [];
  else candidates = [];
  if (!candidates.length) return null;
  for (const c of candidates) if (typeof c.d === 'number') return c.d;
  return typeof tu.delay === 'number' ? tu.delay : null;
}

// Aggregate one decoded feed into per-line stats.
// resolveLine(trip) → lineId | null.
export function lineStats(feed, resolveLine, { now } = {}) {
  const ts = now ?? feed.header?.timestamp ?? Math.floor(Date.now() / 1000);
  const lines = {};
  const cancelled = {};
  let trips = 0, matched = 0;
  const unmatched = new Map();
  // What the trip updates contain, to diagnose feeds that publish delays without times.
  const shape = { withTimes: 0, delayOnly: 0, noStops: 0, tripDelay: 0, active: 0, notStarted: 0, finished: 0, noDelay: 0, sample: [] };
  for (const e of feed.entity || []) {
    const tu = e.tripUpdate;
    if (!tu || e.isDeleted) continue;
    trips++;
    const trip = tu.trip || {};
    const line = resolveLine(trip);
    if (!line) {
      const k = trip.routeId || '(no route_id)';
      unmatched.set(k, (unmatched.get(k) || 0) + 1);
      continue;
    }
    matched++;
    const L = (lines[line] ||= { active: 0, late: 0, sumDelay: 0, maxDelay: 0, cancelled: 0 });
    const sr = trip.scheduleRelationship ?? 0;
    if (sr === TRIP_SR.CANCELED || sr === TRIP_SR.DELETED) {
      L.cancelled++;
      const key = `${trip.tripId || e.id}|${trip.startDate || ''}`;
      (cancelled[line] ||= []).push(key);
      continue;
    }
    const stus = tu.stopTimeUpdate || [];
    const hasTime = stus.some(x => (x.departure?.time ?? x.arrival?.time) != null);
    const hasDelay = stus.some(x => (x.departure?.delay ?? x.arrival?.delay) != null);
    if (!stus.length) shape.noStops++; else if (hasTime) shape.withTimes++; else if (hasDelay) shape.delayOnly++;
    if (typeof tu.delay === 'number') shape.tripDelay++;
    if (shape.sample.length < 3 && (sr === 0) && stus.length) {
      shape.sample.push({ route: trip.routeId, start: trip.startTime, date: trip.startDate, tsDelay: tu.delay ?? null, ts: tu.timestamp ?? null,
        stops: stus.slice(0, 4).map(x => ({ seq: x.stopSequence, id: x.stopId, sr: x.scheduleRelationship, arr: x.arrival || null, dep: x.departure || null })), nStops: stus.length });
    }
    const d = currentDelay(tu, ts);
    if (d == null) {
      if (!hasTime) shape.noDelay++;
      else {
        const times = stus.map(x => x.departure?.time ?? x.arrival?.time).filter(t => t != null);
        if (Math.min(...times) > ts) shape.notStarted++; else shape.finished++;
      }
      continue;
    }
    shape.active++;
    L.active++;
    const pos = Math.max(0, d);
    L.sumDelay += pos;
    if (pos > L.maxDelay) L.maxDelay = pos;
    if (d >= lateThresholdSeconds(line)) L.late++;
  }
  return {
    feedTime: ts,
    trips, matched,
    unmatched: [...unmatched].sort((a, b) => b[1] - a[1]).slice(0, 15),
    lines, cancelled, shape,
  };
}
