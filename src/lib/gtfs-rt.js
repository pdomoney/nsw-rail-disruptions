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

// Decoders for TfNSW extension fields check the wire type, because TfNSW has used some field
// numbers differently from the standard, and a malformed extension must not break the feed.
const ifVarint = fn => (r, wt) => (wt === 0 ? fn(r) : (r.skip(wt), undefined));
const xEnum = ifVarint(r => Number(r.varint()));
const xInt = ifVarint(r => r.int32());
const xBool = ifVarint(r => r.bool());
const xStr = (r, wt) => (wt === 2 ? r.string() : (r.skip(wt), undefined));
const xMsg = fields => (r, wt) => {
  if (wt !== 2) { r.skip(wt); return undefined; }
  const sub = r.sub();
  try { return decodeMessage(sub, fields); } catch { return undefined; }
};

// TfNSW occupancy levels (GTFS-realtime OccupancyStatus).
export const OCCUPANCY = ['empty', 'many seats', 'few seats', 'standing room', 'crowded', 'full', 'not boarding'];

// TfNSW CarriageDescriptor (tfnsw-gtfs-realtime.proto). Predictions in trip updates carry the
// level in field 7 (departure_occupancy_status); measured consists in vehicle positions use field 3.
const Carriage = {
  1: ['name', xStr], 2: ['position', xInt], 3: ['occupancy', xEnum], 4: ['quiet', xBool],
  5: ['toilet', xEnum], 6: ['luggage', xBool], 7: ['departureOccupancy', xEnum],
};
const TfnswVehicle = { 1: ['airConditioned', xBool], 2: ['wheelchairs', xInt], 3: ['model', xStr], 4: ['performingPriorTrip', xBool], 5: ['special', xInt] };
// TfNSW documents the vehicle extension as 1999, but Sydney Trains publishes it as 1007.
const VehicleDescriptor = { 1: ['id', xStr], 2: ['label', xStr], 1007: ['tfnsw', xMsg(TfnswVehicle)], 1999: ['tfnsw', xMsg(TfnswVehicle)] };

const StopTimeEvent = { 1: ['delay', i32], 2: ['time', i64], 3: ['uncertainty', i32] };
const StopTimeUpdate = {
  1: ['stopSequence', u32],
  2: ['arrival', msg(StopTimeEvent)],
  3: ['departure', msg(StopTimeEvent)],
  4: ['stopId', str],
  5: ['scheduleRelationship', enm],
  // TfNSW publishes departure_occupancy_status as field 6 and has said it may move to 7, where the
  // standard puts it. In the standard, field 6 is the stop_time_properties message, so only a
  // varint in field 6 is an occupancy level.
  6: ['occupancy6', xEnum],
  7: ['occupancy7', xEnum],
  1007: ['carriages', xMsg(Carriage), true], // carriage_seq_predictive_occupancy
};
const TripDescriptor = {
  1: ['tripId', str], 2: ['startTime', str], 3: ['startDate', str],
  4: ['scheduleRelationship', enm], 5: ['routeId', str], 6: ['directionId', u32],
};
const TripUpdate = {
  1: ['trip', msg(TripDescriptor)],
  2: ['stopTimeUpdate', msg(StopTimeUpdate), true],
  3: ['vehicle', xMsg(VehicleDescriptor)],
  4: ['timestamp', u64],
  5: ['delay', i32],
};
const VehiclePosition = {
  1: ['trip', xMsg(TripDescriptor)],
  8: ['vehicle', xMsg(VehicleDescriptor)],
  5: ['timestamp', ifVarint(u64)],
  9: ['occupancy', xEnum],
  10: ['occupancyPercentage', ifVarint(u32)],
  1006: ['consist', xMsg(Carriage), true],
  1007: ['consist', xMsg(Carriage), true],
};
const FeedEntity = {
  1: ['id', str], 2: ['isDeleted', r => r.bool()], 3: ['tripUpdate', msg(TripUpdate)],
  4: ['vehicle', xMsg(VehiclePosition)],
};
const FeedHeader = { 1: ['version', str], 2: ['incrementality', enm], 3: ['timestamp', u64] };
const FeedMessage = { 1: ['header', msg(FeedHeader)], 2: ['entity', msg(FeedEntity), true] };

export function decodeFeed(buf) {
  if (!Buffer.isBuffer(buf)) buf = Buffer.from(buf);
  return decodeMessage(new Reader(buf), FeedMessage);
}

export const TRIP_SR = { SCHEDULED: 0, ADDED: 1, UNSCHEDULED: 2, CANCELED: 3, REPLACEMENT: 5, DUPLICATED: 6, DELETED: 7 };
const STU_SKIPPED = 1, STU_NO_DATA = 2;

const usable = s => s.scheduleRelationship !== STU_SKIPPED && s.scheduleRelationship !== STU_NO_DATA;

// Where one trip is at time `now` (unix seconds): { delay, stop } with the delay in seconds and the
// index of the stop update it was read from (the last stop passed, or the next one), or null if the
// trip is not running right now (not started yet, finished, or no usable delay information).
export function currentPosition(tu, now) {
  const stus = tu.stopTimeUpdate || [];
  let passed = null, upcoming = null;
  stus.forEach((s, i) => {
    if (!usable(s)) return;
    const ev = s.departure ?? s.arrival;
    const t = s.departure?.time ?? s.arrival?.time;
    const d = s.departure?.delay ?? s.arrival?.delay;
    if (t == null || ev == null) return;
    if (t <= now) { if (!passed || t >= passed.t) passed = { t, d, i }; }
    else if (!upcoming || t < upcoming.t) upcoming = { t, d, i };
  });
  const tripDelay = typeof tu.delay === 'number' ? tu.delay : null;
  if (!passed && !upcoming) {
    // Sydney Trains publishes many running trips with delays but no times (the stops listed are the
    // ones still to come). Count those as running if the trip was updated in the last 10 minutes.
    const fresh = typeof tu.timestamp === 'number' && now - tu.timestamp <= 10 * 60;
    if (!fresh) return null;
    for (let i = 0; i < stus.length; i++) {
      if (!usable(stus[i])) continue;
      const d = stus[i].departure?.delay ?? stus[i].arrival?.delay;
      if (typeof d === 'number') return { delay: d, stop: i };
    }
    return tripDelay == null ? null : { delay: tripDelay, stop: stus.findIndex(usable) };
  }
  let candidates;
  if (passed && upcoming) candidates = [passed, upcoming];
  else if (upcoming) candidates = upcoming.t - now <= 15 * 60 ? [upcoming] : [];
  else if (passed) candidates = now - passed.t <= 10 * 60 ? [passed] : [];
  else candidates = [];
  if (!candidates.length) return null;
  for (const c of candidates) if (typeof c.d === 'number') return { delay: c.d, stop: candidates[0].i };
  return tripDelay == null ? null : { delay: tripDelay, stop: candidates[0].i };
}

// Current delay (seconds) of one trip, or null if it is not running.
export function currentDelay(tu, now) {
  return currentPosition(tu, now)?.delay ?? null;
}

// Occupancy level published for departure from one stop (0–6), or null.
export function stopOccupancy(stu) {
  const v = stu?.occupancy7 ?? stu?.occupancy6;
  return typeof v === 'number' ? v : null;
}

// Per-carriage levels at one stop, in consist order (null where a carriage has no level).
export function carriageLevels(stu) {
  const cars = (stu?.carriages || []).filter(Boolean);
  if (!cars.length) return [];
  return cars
    .slice()
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    .map(c => c.departureOccupancy ?? c.occupancy ?? null);
}

// What one trip update says about the trip as a whole, for the daily per-trip record and for
// passenger-weighted delay. `now` is unix seconds.
export function tripSummary(tu, now) {
  const stus = tu.stopTimeUpdate || [];
  const pos = currentPosition(tu, now);
  let skipped = 0, occMax = null, cars = 0, endDelay = null, hasTimes = false;
  for (const s of stus) {
    if (s.scheduleRelationship === STU_SKIPPED) { skipped++; continue; }
    if ((s.departure?.time ?? s.arrival?.time) != null) hasTimes = true;
    const o = stopOccupancy(s);
    const levels = carriageLevels(s);
    for (const l of [o, ...levels]) if (l != null && l <= 5 && (occMax == null || l > occMax)) occMax = l;
    if (levels.length > cars) cars = levels.length;
  }
  // Delay at the last stop the trip will serve (its arrival delay at the destination).
  for (let i = stus.length - 1; i >= 0; i--) {
    if (!usable(stus[i])) continue;
    const d = stus[i].arrival?.delay ?? stus[i].departure?.delay;
    if (typeof d === 'number') { endDelay = d; break; }
  }
  if (endDelay == null && typeof tu.delay === 'number') endDelay = tu.delay;
  // Load where the trip is now: per-carriage levels if published, else the stop's level for the whole train.
  let nowLevels = null, nowLevel = null;
  if (pos && pos.stop >= 0) {
    const s = stus[pos.stop];
    const levels = carriageLevels(s).filter(l => l != null);
    if (levels.length) nowLevels = levels;
    nowLevel = stopOccupancy(s);
    if (nowLevel == null && levels.length) nowLevel = Math.max(...levels);
  }
  return {
    running: pos != null,
    delay: pos?.delay ?? null,
    endDelay,
    skipped,
    stops: stus.length,
    hasTimes,
    occMax,
    cars,
    nowLevel,
    nowLevels,
    model: tu.vehicle?.tfnsw?.model || null,
  };
}

// Occupancy measured on board, from a vehicle positions feed: tripId → { levels (per carriage, in
// consist order), level (whole vehicle), cars }.
export function vehicleLoads(feed) {
  const out = new Map();
  for (const e of feed.entity || []) {
    const v = e.vehicle;
    const tripId = v?.trip?.tripId;
    if (!tripId) continue;
    const consist = (v.consist || []).filter(Boolean).slice().sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
    const levels = consist.map(c => c.occupancy ?? c.departureOccupancy).filter(l => l != null && l <= 5);
    const level = v.occupancy != null && v.occupancy <= 5 ? v.occupancy : null;
    out.set(tripId, { levels: levels.length === consist.length ? levels : [], level, cars: consist.length, model: v.vehicle?.tfnsw?.model || null });
  }
  return out;
}

// Counts which protobuf fields (by path, number and wire type) a feed actually contains, so
// diagnostics show what TfNSW publishes, including extensions this decoder does not know about.
const CENSUS_TREE = {
  2: { name: 'entity', kids: {
    3: { name: 'tu', kids: {
      1: { name: 'trip' },
      2: { name: 'stu', kids: { 2: { name: 'arr' }, 3: { name: 'dep' }, 6: { name: 'f6' }, 1007: { name: 'car' } } },
      3: { name: 'veh', kids: { 1007: { name: 'x7' }, 1999: { name: 'tfnsw' } } },
      1007: { name: 'x7' },
    } },
    4: { name: 'vp', kids: {
      1: { name: 'trip' }, 8: { name: 'veh', kids: { 1007: { name: 'x7' }, 1999: { name: 'tfnsw' } } },
      11: { name: 'mcd' }, 1006: { name: 'car' }, 1007: { name: 'car7' },
    } },
  } },
};

export function fieldCensus(buf, tree = CENSUS_TREE) {
  const counts = {};
  const walk = (r, kids, prefix) => {
    while (!r.eof()) {
      const [num, wt] = r.tag();
      const key = `${prefix}${num}:${wt}`;
      counts[key] = (counts[key] || 0) + 1;
      const kid = kids?.[num];
      if (kid && wt === 2) {
        const sub = r.sub();
        try { walk(sub, kid.kids, `${prefix}${kid.name}.`); } catch { counts[`${key}!bad`] = (counts[`${key}!bad`] || 0) + 1; }
      } else r.skip(wt);
    }
  };
  walk(new Reader(Buffer.isBuffer(buf) ? buf : Buffer.from(buf)), tree, '');
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
}

const levels6 = () => [0, 0, 0, 0, 0, 0];

// Aggregate one decoded feed into per-line stats.
// resolveLine(trip) → lineId | null.
// Returns per-line delay figures, cancelled trips, the load of running trips by occupancy level,
// one summary per trip (for the daily service record) and diagnostics.
export function lineStats(feed, resolveLine, { now, vehicles = null } = {}) {
  const ts = now ?? feed.header?.timestamp ?? Math.floor(Date.now() / 1000);
  const lines = {};
  const cancelled = {};
  // Running trips by occupancy level where they are now: carriages (when per-carriage levels are
  // published) or whole trains (when only a level for the train is), with the delay they carry.
  const load = {};
  const tripList = [];
  let trips = 0, matched = 0;
  const unmatched = new Map();
  // What the trip updates contain, to diagnose feeds that publish delays without times.
  const shape = { withTimes: 0, delayOnly: 0, noStops: 0, tripDelay: 0, active: 0, notStarted: 0, finished: 0, noDelay: 0 };
  // Occupancy coverage, to see what each feed publishes.
  const occ = { stops: 0, stopLevel: 0, stopCars: 0, trips: 0, tripsWithLevel: 0, tripsWithCars: 0, fromVehicles: 0, runningWithLevel: 0, levels: levels6(), cars: {}, models: {} };
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
    const sum = tripSummary(tu, ts);
    // Measured load from the vehicle positions feed, where the trip update has no prediction.
    const v = vehicles && trip.tripId ? vehicles.get(trip.tripId) : null;
    if (v && sum.occMax == null && (v.levels.length || v.level != null)) {
      sum.occSource = 'vehicle';
      sum.nowLevels = v.levels.length ? v.levels : null;
      sum.nowLevel = v.level ?? (v.levels.length ? Math.max(...v.levels) : null);
      sum.occMax = sum.nowLevel;
      if (v.cars > sum.cars) sum.cars = v.cars;
      occ.fromVehicles++;
    }
    tripList.push({ tripId: trip.tripId || null, startDate: trip.startDate || null, startTime: trip.startTime || null, line, sr, sum });
    if (sr === TRIP_SR.CANCELED || sr === TRIP_SR.DELETED) {
      L.cancelled++;
      const key = `${trip.tripId || e.id}|${trip.startDate || ''}`;
      (cancelled[line] ||= []).push(key);
      continue;
    }
    const stus = tu.stopTimeUpdate || [];
    occ.trips++;
    let anyLevel = false, anyCars = false;
    for (const s of stus) {
      occ.stops++;
      const o = stopOccupancy(s);
      if (o != null) { occ.stopLevel++; anyLevel = true; if (o <= 5) occ.levels[o]++; }
      if (s.carriages?.length) { occ.stopCars++; anyCars = true; }
    }
    if (anyLevel) occ.tripsWithLevel++;
    if (anyCars) { occ.tripsWithCars++; occ.cars[sum.cars] = (occ.cars[sum.cars] || 0) + 1; }
    if (sum.model) occ.models[sum.model] = (occ.models[sum.model] || 0) + 1;
    const hasDelay = stus.some(x => (x.departure?.delay ?? x.arrival?.delay) != null);
    if (!stus.length) shape.noStops++; else if (sum.hasTimes) shape.withTimes++; else if (hasDelay) shape.delayOnly++;
    if (typeof tu.delay === 'number') shape.tripDelay++;
    const d = sum.delay;
    if (d == null) {
      if (!sum.hasTimes) shape.noDelay++;
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
    const W = (load[line] ||= { running: 0, withOcc: 0, cars: levels6(), carDelay: levels6(), trains: levels6(), trainDelay: levels6() });
    W.running++;
    if (sum.nowLevels) {
      W.withOcc++;
      occ.runningWithLevel++;
      for (const l of sum.nowLevels) if (l <= 5) { W.cars[l]++; W.carDelay[l] += pos; }
    } else if (sum.nowLevel != null && sum.nowLevel <= 5) {
      W.withOcc++;
      occ.runningWithLevel++;
      W.trains[sum.nowLevel]++;
      W.trainDelay[sum.nowLevel] += pos;
    }
  }
  return {
    feedTime: ts,
    trips, matched,
    unmatched: [...unmatched].sort((a, b) => b[1] - a[1]).slice(0, 15),
    lines, cancelled, load, tripList, shape, occ,
  };
}
