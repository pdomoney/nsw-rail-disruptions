import test from 'node:test';
import assert from 'node:assert/strict';
import { rowLoad, delayClock, CAR_LOAD } from '../src/lib/clock.js';
import { RIDE_MINUTES } from '../src/lib/service-stats.js';

const row = (ts, line, o = {}) => ({ ts, line, running: '10', with_occ: '5', cars: '0 8 0 0 0 0', car_delay_s: '0 960 0 0 0 0', trains: '0 0 0 0 0 0', train_delay_s: '0 0 0 0 0 0', feed: 'x', ...o });

test('load of one row, scaled to all running services', () => {
  // 8 carriages at "many seats", 960 carriage-seconds of delay; half the services have figures.
  const many = CAR_LOAD.train[1];
  assert.deepEqual(rowLoad(row('2026-10-13T04:00:00Z', 'T1'), 'train'), { pax: 8 * many * 2, paxDelay: 960 * many * 2 });
  // A train with only a level for the whole train counts as 8 carriages.
  assert.deepEqual(rowLoad(row('t', 'T1', { cars: '0 0 0 0 0 0', car_delay_s: '0 0 0 0 0 0', trains: '0 0 1 0 0 0', train_delay_s: '0 0 120 0 0 0', running: '1', with_occ: '1' }), 'train'),
    { pax: 8 * CAR_LOAD.train[2], paxDelay: 120 * 8 * CAR_LOAD.train[2] });
  assert.equal(rowLoad(row('t', 'L1', { with_occ: '0' }), 'train'), null);
  assert.equal(rowLoad(row('t', 'L1'), 'lightrail'), null); // no loads assumed for light rail
});

test('passenger-minutes add up between readings', () => {
  const rows = [row('2026-10-13T04:00:00Z', 'T1'), row('2026-10-13T04:05:00Z', 'T1'), row('2026-10-13T04:40:00Z', 'T1')];
  const { days, latest, first } = delayClock(rows, () => 'train');
  // Each reading: 960 × load × 2 passenger-seconds ÷ ride minutes ÷ 60 passenger-minutes a minute,
  // for 5, 10 (capped) and 5 (last) minutes.
  const perMin = (960 * CAR_LOAD.train[1] * 2) / RIDE_MINUTES / 60;
  assert.ok(Math.abs(days['2026-10-13'].T1.min - perMin * 20) < 1e-9);
  assert.ok(Math.abs(days['2026-10-13'].T1.hours[15] - perMin * 20) < 1e-9); // 3 pm in Sydney
  assert.equal(latest.T1.at, Date.parse('2026-10-13T04:40:00Z'));
  assert.equal(first['2026-10-13'], Date.parse('2026-10-13T04:00:00Z'));
});
