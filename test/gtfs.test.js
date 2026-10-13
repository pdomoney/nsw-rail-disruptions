import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { decodeFeed, lineStats, currentDelay, tripSummary, fieldCensus, vehicleLoads } from '../src/lib/gtfs-rt.js';
import { buildRouteMap, resolveTripLine, scheduledTrips, gtfsTime } from '../src/lib/gtfs-static.js';
import { readZip, zipEntries } from '../src/lib/zip.js';
import { parseCsv, forEachCsvRow } from '../src/lib/csv.js';

const pb = fs.readFileSync(new URL('./fixtures/tripupdates.pb', import.meta.url));
const vpb = fs.readFileSync(new URL('./fixtures/vehiclepositions.pb', import.meta.url));
const ref = JSON.parse(fs.readFileSync(new URL('./fixtures/tripupdates.json', import.meta.url), 'utf8'));
const zip = fs.readFileSync(new URL('./fixtures/gtfs-static.zip', import.meta.url));
const feedCfg = { key: 'sydneytrains', defaultLine: null };

test('protobuf decoder matches the reference protobuf runtime', () => {
  const fm = decodeFeed(pb);
  assert.equal(fm.header.timestamp, Number(ref.header.timestamp));
  assert.equal(fm.entity.length, ref.entity.length);
  for (let i = 0; i < ref.entity.length; i++) {
    const a = fm.entity[i].tripUpdate, b = ref.entity[i].trip_update;
    assert.equal(a.trip.tripId, b.trip.trip_id);
    assert.equal(a.trip.routeId, b.trip.route_id);
    assert.equal(a.trip.scheduleRelationship ?? 0, b.trip.schedule_relationship ?? 0);
    assert.equal(a.delay, b.delay);
    assert.equal(a.stopTimeUpdate.length, b.stop_time_update.length);
    for (let j = 0; j < b.stop_time_update.length; j++) {
      const s = a.stopTimeUpdate[j], r = b.stop_time_update[j];
      const ev = s.departure ?? s.arrival, rev = r.departure ?? r.arrival;
      assert.equal(ev.time, rev.time == null ? undefined : Number(rev.time));
      assert.equal(ev.delay, rev.delay);
      assert.equal(s.scheduleRelationship, r.schedule_relationship);
    }
  }
});

test('extreme int32 values decode correctly', () => {
  const fm = decodeFeed(pb);
  const e9 = fm.entity.find(e => e.id === 'e9').tripUpdate;
  assert.equal(e9.stopTimeUpdate[0].departure.delay, -2147483648);
  assert.equal(e9.stopTimeUpdate[1].arrival.delay, 2147483647);
});

test('zip and csv readers handle deflate, stored entries and quoted fields', () => {
  const files = readZip(zip);
  assert.deepEqual(Object.keys(files).sort(), ['agency.txt', 'calendar.txt', 'calendar_dates.txt', 'routes.txt', 'stop_times.txt', 'stops.txt', 'trips.txt']);
  assert.equal(zipEntries(zip).find(e => e.name === 'stops.txt').size, files['stops.txt'].length);
  const routes = parseCsv(files['routes.txt'].toString());
  assert.equal(routes[0].route_long_name, 'North Shore & Western Line, City to Emu Plains');
  assert.equal(routes.length, 4);
  const rows = [];
  forEachCsvRow(files['stop_times.txt'], ['stop_id', 'trip_id'], r => rows.push(r));
  assert.deepEqual(rows[0], ['2000331', 'T1.trip.1']); // byte-order mark at the start is ignored
  assert.equal(rows.length, 10);
  const trips = parseCsv(files['trips.txt'].toString(), ['trip_id', 'trip_headsign']);
  assert.deepEqual(trips[0], { trip_id: 'T1.trip.1', trip_headsign: 'Emu Plains, via Strathfield' });
});

test('static GTFS route map', () => {
  const map = buildRouteMap(zip, feedCfg);
  assert.equal(map.routes.T1_route, 'T1');
  assert.equal(map.routes.BMT_1, 'BMT');
  assert.equal(map.routes.RTTA_DEF, null);
  assert.deepEqual(map.sched.trips['BMT.trip.9'], ['BMT', 's1', 36000, 43200, 0]);
  assert.equal(map.sched.trips['X.trip'], undefined); // untracked route
  assert.equal(resolveTripLine({ tripId: 'BMT.trip.9' }, map, feedCfg), 'BMT');
  assert.equal(map.colors.T9, '#D11F2F');
  assert.equal(map.stats.from, '20261001');
  assert.equal(map.stats.to, '20261031');
  assert.equal(map.stats.calendarDates, 2);
  assert.ok(map.stats.files.some(([name]) => name === 'calendar.txt'));
});

test('timetabled trips for a service date', () => {
  const map = buildRouteMap(zip, feedCfg);
  assert.equal(gtfsTime('25:10:00'), 90600);
  assert.equal(gtfsTime(''), null);
  // Tuesday: the weekday service.
  assert.deepEqual(scheduledTrips(map, '20261013'), [['BMT.trip.9', 'BMT', 0, 36000, 43200], ['T1.trip.1', 'T1', 0, 36000, 36900]]);
  // Monday 12 October: weekday service removed by calendar_dates.
  assert.deepEqual(scheduledTrips(map, '20261012'), []);
  // Sunday: weekend service (after midnight, from rows out of order) plus a one-day service.
  assert.deepEqual(scheduledTrips(map, '20261011'), [['T9.trip.1', 'T9', 1, 36300, 36300], ['T1.trip.2', 'T1', 1, 88260, 90600]]);
  // Outside the calendar.
  assert.deepEqual(scheduledTrips(map, '20261102'), []);
});

test('stations and the lines that stop at them', () => {
  const { stations } = buildRouteMap(zip, feedCfg);
  assert.deepEqual(stations['200060'], { n: 'Central Station', l: ['BMT', 'T1', 'T9'], c: { T1: 2, BMT: 1, T9: 1 }, la: -33.88, lo: 151.2 });
  assert.deepEqual(stations['207710'], { n: 'Hornsby Station', l: ['T1'], c: { T1: 1 }, la: -33.7, lo: 151.1 });
  assert.deepEqual(stations['213510'].l, ['BMT', 'T1']);
  assert.deepEqual(stations['278010'], { n: 'Lithgow Station', l: ['BMT'], c: { BMT: 1 }, la: -33.48, lo: 150.15 });
  assert.equal(stations['999999'], undefined); // only served by an untracked route
  assert.equal(stations['2000331'], undefined); // platforms fold into their station
});

test('per-line delay statistics', () => {
  const map = buildRouteMap(zip, feedCfg);
  const fm = decodeFeed(pb);
  const s = lineStats(fm, trip => resolveTripLine(trip, map, feedCfg));
  // T1: e1 (+360 s, late), e2 (early → 0), e7 (trip-level 90 s), e10 (delay-only, fresh: 200 s);
  // e3 not started, e8 finished, e11 delay-only but stale, e4 cancelled.
  assert.deepEqual(s.lines.T1, { active: 4, late: 1, sumDelay: 650, maxDelay: 360, cancelled: 1 });
  assert.deepEqual(s.cancelled.T1, ['T1.trip.4|20261011']);
  // BMT found through trips.txt (no route_id); skipped stop ignored; intercity threshold is 6 min.
  assert.deepEqual(s.lines.BMT, { active: 1, late: 1, sumDelay: 720, maxDelay: 720, cancelled: 0 });
  assert.equal(s.lines.T9.active, 1);
  assert.equal(s.lines.T9.late, 0);
  assert.equal(s.trips, 11);
  assert.equal(s.matched, 10);
  assert.equal(s.shape.delayOnly, 2);
  assert.deepEqual(s.unmatched, [['RTTA_DEF', 1]]);
  // Load where trips are now: e1 has two carriages listed at the stop it has just left (levels 3
  // and 4, 360 s late); BMT only has a level for the whole train (few seats, 720 s late).
  assert.deepEqual(s.load.T1.cars, [0, 0, 0, 1, 1, 0]);
  assert.deepEqual(s.load.T1.carDelay, [0, 0, 0, 360, 360, 0]);
  assert.equal(s.load.T1.running, 4);
  assert.equal(s.load.T1.withOcc, 1);
  assert.deepEqual(s.load.BMT.trains, [0, 0, 1, 0, 0, 0]);
  assert.deepEqual(s.load.BMT.trainDelay, [0, 0, 720, 0, 0, 0]);
  assert.equal(s.occ.models.A, 1);
  assert.equal(s.tripList.length, 10);
  const e4 = s.tripList.find(t => t.tripId === 'T1.trip.4');
  assert.equal(e4.sr, 3);
});

test('trip summary: occupancy, carriages, delay at the destination, vehicle model', () => {
  const fm = decodeFeed(pb);
  const now = fm.header.timestamp;
  const e1 = fm.entity.find(e => e.id === 'e1').tripUpdate;
  assert.equal(e1.stopTimeUpdate[1].occupancy7, 3);
  assert.equal(e1.stopTimeUpdate[1].occupancy6, undefined); // field 6 here is stop_time_properties
  const sum = tripSummary(e1, now);
  assert.deepEqual({ ...sum }, {
    running: true, delay: 360, endDelay: 360, skipped: 0, stops: 3, hasTimes: true,
    occMax: 4, cars: 2, nowLevel: 3, nowLevels: [3, 4], model: 'A',
  });
  const e5 = tripSummary(fm.entity.find(e => e.id === 'e5').tripUpdate, now);
  assert.equal(e5.skipped, 1);
  assert.equal(e5.endDelay, 700);
  assert.equal(e5.nowLevel, 2);
  assert.equal(e5.nowLevels, null);
});

test('occupancy in field 6 (TfNSW numbering) is read; field census counts what is there', () => {
  // FeedMessage { entity { id "x" trip_update { trip { trip_id "t" } stop_time_update { stop_sequence 1, field 6 = 4 } } } }
  const stu = Buffer.from([0x08, 0x01, 0x30, 0x04]);
  const trip = Buffer.from([0x0a, 0x01, 0x74]);
  const tu = Buffer.concat([Buffer.from([0x0a, trip.length]), trip, Buffer.from([0x12, stu.length]), stu]);
  const ent = Buffer.concat([Buffer.from([0x0a, 0x01, 0x78, 0x1a, tu.length]), tu]);
  const feed = Buffer.concat([Buffer.from([0x12, ent.length]), ent]);
  const fm = decodeFeed(feed);
  assert.equal(fm.entity[0].tripUpdate.stopTimeUpdate[0].occupancy6, 4);
  const c = fieldCensus(feed);
  assert.equal(c['entity.tu.stu.6:0'], 1);
  assert.equal(c['entity.tu.2:2'], 1);
  const full = fieldCensus(pb);
  assert.equal(full['entity.tu.stu.1007:2'], 2);
  assert.equal(full['entity.tu.stu.f6.1:2'], 1);
  assert.equal(full['entity.tu.veh.x7.3:2'], 1);
});

test('measured load from vehicle positions fills in where there is no prediction', () => {
  const vehicles = vehicleLoads(decodeFeed(vpb));
  assert.deepEqual(vehicles.get('T9.trip.1'), { levels: [1, 2], level: 2, cars: 2, model: 'M' });
  assert.equal(vehicles.size, 1);
  const map = buildRouteMap(zip, feedCfg);
  const s = lineStats(decodeFeed(pb), trip => resolveTripLine(trip, map, feedCfg), { vehicles });
  assert.deepEqual(s.load.T9.cars, [0, 1, 1, 0, 0, 0]);
  assert.equal(s.occ.fromVehicles, 1);
  const t9 = s.tripList.find(t => t.tripId === 'T9.trip.1');
  assert.equal(t9.sum.occSource, 'vehicle');
  assert.equal(t9.sum.occMax, 2);
  assert.equal(t9.sum.cars, 2);
  // A trip with its own prediction keeps it.
  assert.equal(s.tripList.find(t => t.tripId === 'T1.trip.1').sum.occSource, undefined);
});

test('currentDelay picks the most recent passed stop', () => {
  const tu = { stopTimeUpdate: [
    { departure: { time: 100, delay: 30 } },
    { departure: { time: 200, delay: 90 } },
    { arrival: { time: 400, delay: 120 } },
  ] };
  assert.equal(currentDelay(tu, 250), 90);
  assert.equal(currentDelay(tu, 50), 30); // not departed yet, first stop within 15 min
  assert.equal(currentDelay(tu, 400 + 11 * 60), null); // finished more than 10 minutes ago
});
