import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildRouteMap } from '../src/lib/gtfs-static.js';
import { ServiceRecorder, FLAG, TRIP_COLUMNS } from '../src/lib/service.js';
import { readJson } from '../src/lib/store.js';

const zip = fs.readFileSync(new URL('./fixtures/gtfs-static.zip', import.meta.url));
const feed = { key: 'sydneytrains', defaultLine: null };
const map = { builtAt: '2026-10-12T20:00:00Z', source: 'test', ...buildRouteMap(zip, feed) };

const sum = (o = {}) => ({ running: false, delay: null, endDelay: null, skipped: 0, hasTimes: true, occMax: null, cars: 0, model: null, ...o });

test('daily service record: timetable, observations, coverage and the final file', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nrd-service-'));
  // 11:00 on Tuesday 13 October in Sydney.
  const t0 = Date.parse('2026-10-13T00:00:00Z');
  const base = Date.parse('2026-10-12T13:00:00Z'); // Sydney midnight starting 13 October
  let rec = new ServiceRecorder(dir, t0);
  rec.freeze(feed, map);
  const ids = rec.record('sydneytrains', [
    { tripId: 'T1.trip.1', startDate: '20261013', line: 'T1', sr: 0, sum: sum({ running: true, delay: 120, endDelay: 180, occMax: 3, cars: 8, model: 'A' }) },
    { tripId: 'BMT.trip.9', startDate: '20261013', line: 'BMT', sr: 3, sum: sum() },
    { tripId: 'T1.extra', startDate: '20261013', line: 'T1', sr: 1, sum: sum({ running: true, delay: 30, endDelay: 30 }) },
    { tripId: 'T1.old', startDate: '20261009', line: 'T1', sr: 0, sum: sum() },
  ], t0);
  assert.equal(ids.inTimetable, 2);
  assert.equal(ids.notInTimetable, 1);
  assert.equal(ids.other, 1); // a trip from days ago is ignored
  rec.covered('sydneytrains', t0);
  rec.save();
  assert.ok(fs.existsSync(path.join(dir, 'service', '2026-10', '2026-10-13.sched.json')));

  // Five minutes later: T1.trip.1 is later still; BMT.trip.9 is reinstated and runs.
  rec = new ServiceRecorder(dir, t0 + 5 * 60_000);
  rec.freeze(feed, map); // already frozen: no change
  rec.record('sydneytrains', [
    { tripId: 'T1.trip.1', startDate: '20261013', line: 'T1', sr: 0, sum: sum({ running: true, delay: 300, endDelay: 240 }) },
    { tripId: 'BMT.trip.9', startDate: '20261013', line: 'BMT', sr: 0, sum: sum({ running: true, delay: 0, endDelay: 0, skipped: 2 }) },
  ], t0 + 5 * 60_000);
  rec.covered('sydneytrains', t0 + 5 * 60_000);
  rec.covered('sydneytrains', t0 + 60 * 60_000); // after a gap: a new interval
  rec.save();

  // 6:30 the next morning the day is finalised.
  const t1 = Date.parse('2026-10-13T19:30:00Z');
  rec = new ServiceRecorder(dir, t1);
  assert.deepEqual(rec.finalise(), ['2026-10-13']);
  rec.save();
  const out = readJson(path.join(dir, 'service', '2026-10', '2026-10-13.json.gz'));
  assert.deepEqual(out.cols, TRIP_COLUMNS);
  const s0 = (t0 - base) / 1000;
  const { trips, ...info } = out.feeds.sydneytrains;
  assert.deepEqual(info, {
    timetable: '2026-10-12T20:00:00Z', scheduled: 2, observed: 3, unscheduled: 1,
    coverage: [[s0, s0 + 300], [s0 + 3600, s0 + 3600]],
  });
  assert.equal(trips.length, 3);
  const row = id => Object.fromEntries(trips.find(r => r[0] === id).map((v, i) => [TRIP_COLUMNS[i], v]));
  assert.deepEqual(row('T1.trip.1'), {
    trip: 'T1.trip.1', line: 'T1', dir: 0, start: 36000, end: 36900, cars: 8, forecast: 20, type: 'B8', headsign: 'Emu Plains, via Strathfield', origin: '200060',
    flags: FLAG.SEEN | FLAG.RAN, first_seen: s0, last_seen: s0 + 300, max_delay: 300, end_delay: 240,
    skipped: 0, occ: 3, cars_seen: 8, model: 'A',
  });
  assert.equal(row('BMT.trip.9').flags, FLAG.SEEN | FLAG.RAN | FLAG.CANCELLED);
  assert.equal(row('BMT.trip.9').skipped, 2);
  assert.equal(row('T1.extra').flags, FLAG.ADDED | FLAG.RAN | FLAG.UNSCHEDULED);
  assert.equal(row('T1.extra').start, null);
  assert.ok(!fs.existsSync(path.join(dir, 'service', '2026-10', '2026-10-13.sched.json')));
  const open = JSON.parse(fs.readFileSync(path.join(dir, 'service', 'open.json'), 'utf8'));
  assert.deepEqual(Object.keys(open.days), ['2026-10-14']);
  fs.rmSync(dir, { recursive: true });
});

test('trips without a start date are placed on the right service day', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nrd-service-'));
  // 00:40 on Monday 12 October in Sydney; Sunday 11 October is still open.
  const sunday = new ServiceRecorder(dir, Date.parse('2026-10-11T00:00:00Z'));
  sunday.freeze(feed, map);
  sunday.save();
  const t = Date.parse('2026-10-11T13:40:00Z');
  const rec = new ServiceRecorder(dir, t);
  rec.freeze(feed, map);
  // T1.trip.2 runs at 24:31 on Sunday's timetable.
  assert.equal(rec.dateOf('sydneytrains', { tripId: 'T1.trip.2' }, t), '2026-10-11');
  assert.equal(rec.dateOf('sydneytrains', { tripId: 'T1.trip.2', startDate: '20261012' }, t), '2026-10-12');
  assert.equal(rec.dateOf('sydneytrains', { tripId: 'unknown' }, t), '2026-10-11'); // before 4 am
  rec.record('sydneytrains', [{ tripId: 'T1.trip.2', line: 'T1', sr: 5, sum: sum({ running: true, delay: 60 }) }], t);
  const o = rec.state.days['2026-10-11'].obs.sydneytrains['T1.trip.2'];
  assert.equal(o[0], FLAG.SEEN | FLAG.REPLACED | FLAG.RAN);
  fs.rmSync(dir, { recursive: true });
});

test('a timetable that does not cover the day is not frozen', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nrd-service-'));
  const rec = new ServiceRecorder(dir, Date.parse('2026-11-03T00:00:00Z'));
  rec.freeze(feed, map); // calendar ends 31 October
  assert.deepEqual(rec.state.days['2026-11-03'].sched, {});
  rec.freeze(feed, { ...map, stats: { ...map.stats, to: '20261130' } });
  assert.equal(rec.state.days['2026-11-03'].sched.sydneytrains.n, 0); // covered, but nothing runs
  fs.rmSync(dir, { recursive: true });
});
