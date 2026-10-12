import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { decodeFeed, lineStats, currentDelay } from '../src/lib/gtfs-rt.js';
import { buildRouteMap, resolveTripLine } from '../src/lib/gtfs-static.js';
import { readZip } from '../src/lib/zip.js';
import { parseCsv } from '../src/lib/csv.js';

const pb = fs.readFileSync(new URL('./fixtures/tripupdates.pb', import.meta.url));
const ref = JSON.parse(fs.readFileSync(new URL('./fixtures/tripupdates.json', import.meta.url), 'utf8'));
const zip = fs.readFileSync(new URL('./fixtures/gtfs-static.zip', import.meta.url));
const feedCfg = { key: 'sydneytrains', defaultLine: null, tripMap: true };

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
      assert.equal(ev.time, Number(rev.time));
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
  assert.deepEqual(Object.keys(files).sort(), ['agency.txt', 'routes.txt', 'stops.txt', 'trips.txt']);
  const routes = parseCsv(files['routes.txt'].toString());
  assert.equal(routes[0].route_long_name, 'North Shore & Western Line, City to Emu Plains');
  assert.equal(routes.length, 4);
  const trips = parseCsv(files['trips.txt'].toString(), ['trip_id', 'trip_headsign']);
  assert.deepEqual(trips[0], { trip_id: 'T1.trip.1', trip_headsign: 'Emu Plains, via Strathfield' });
});

test('static GTFS route map', () => {
  const map = buildRouteMap(zip, feedCfg);
  assert.equal(map.routes.T1_route, 'T1');
  assert.equal(map.routes.BMT_1, 'BMT');
  assert.equal(map.routes.RTTA_DEF, null);
  assert.equal(map.trips['BMT.trip.9'], 'BMT');
  assert.equal(map.colors.T9, '#D11F2F');
});

test('per-line delay statistics', () => {
  const map = buildRouteMap(zip, feedCfg);
  const fm = decodeFeed(pb);
  const s = lineStats(fm, trip => resolveTripLine(trip, map, feedCfg));
  // T1: e1 (+360 s, late), e2 (early → 0), e7 (trip-level 90 s); e3 not started, e8 finished, e4 cancelled.
  assert.deepEqual(s.lines.T1, { active: 3, late: 1, sumDelay: 450, maxDelay: 360, cancelled: 1 });
  assert.deepEqual(s.cancelled.T1, ['T1.trip.4|20261011']);
  // BMT found through trips.txt (no route_id); skipped stop ignored; intercity threshold is 6 min.
  assert.deepEqual(s.lines.BMT, { active: 1, late: 1, sumDelay: 720, maxDelay: 720, cancelled: 0 });
  assert.equal(s.lines.T9.active, 1);
  assert.equal(s.lines.T9.late, 0);
  assert.equal(s.trips, 9);
  assert.equal(s.matched, 8);
  assert.deepEqual(s.unmatched, [['RTTA_DEF', 1]]);
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
