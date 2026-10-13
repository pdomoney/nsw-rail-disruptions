import test from 'node:test';
import assert from 'node:assert/strict';
import { FLAG, TRIP_COLUMNS } from '../src/lib/service.js';
import { summariseDay, pairStats, trackedPairs, tripPassengers, watched, COUNTERS } from '../src/lib/service-stats.js';

// Build a trip row from named fields.
const row = o => TRIP_COLUMNS.map(c => o[c] ?? (c === 'flags' || c === 'skipped' || c === 'cars_seen' ? 0 : null));
const T = (trip, line, start, end, flags, more = {}) => row({ trip, line, start, end, flags, type: 'B8', cars: 8, forecast: 20, ...more });

const record = {
  date: '2026-10-13',
  feeds: {
    sydneytrains: {
      coverage: [[0, 90000]],
      trips: [
        T('A', 'T1', 36000, 39600, FLAG.SEEN | FLAG.RAN, { end_delay: 400, headsign: 'Emu Plains', origin: '200060' }),
        T('B', 'T1', 40000, 43000, FLAG.SEEN | FLAG.CANCELLED | FLAG.CANCELLED_LAST),
        T('C', 'T1', 41000, 44000, 0),
        T('D', 'T1', 42000, 45000, FLAG.SEEN),
        T('E', 'T1', 43000, 46000, FLAG.SEEN | FLAG.RAN, { skipped: 2, end_delay: 0 }),
        T('F', 'T1', 44000, 47000, 0, { headsign: 'Empty Train' }),
        T('G', 'SCO', 36000, 37000, 0, { type: 'N2' }),
        T('H', 'SCO', 50000, 51000, 0, { type: 'N2' }),
        T('I', 'T1', null, null, FLAG.ADDED | FLAG.RAN | FLAG.UNSCHEDULED, { type: null, cars: null, forecast: null }),
        T('J', 'T1', 80000, 83000, 0),
        T('K', 'BMT', 36000, 45000, FLAG.SEEN | FLAG.RAN, { end_delay: 330, type: 'H8' }),
      ],
    },
  },
};

test('passenger estimate and watched trips', () => {
  // 8 cars at level 2 (85 a carriage) for 50 minutes, two average journeys long.
  assert.equal(tripPassengers(8, 20, 50), 1360);
  assert.equal(tripPassengers(8, 15, 25), 8 * 60);
  assert.equal(tripPassengers(null, 20, 50), null);
  assert.equal(watched([[0, 1000]], 100, 900), true);
  assert.equal(watched([[0, 400]], 100, 2000), false); // 700 s watched of a 30-minute trip
  assert.equal(watched([[1900, 3000]], 100, 2000), false);
});

test('a day of trips is summarised per line', () => {
  const s = summariseDay(record, { nowSec: 70000 });
  const get = l => Object.fromEntries(COUNTERS.map((c, i) => [c, s.lines[l][i]]));
  assert.deepEqual(get('T1'), {
    sched: 6, due: 5, counted: 5, ran: 2, late: 1, part: 1, cancelled: 1, missing: 1, unclear: 1, untracked: 0, added: 1,
    paxCounted: 1632 + 4 * 1360, paxLost: 2 * 1360, // A runs for an hour
    // B's passengers wait for C (1000 s), C's for D (1000 s).
    lostWaitMin: Math.round(2 * 1360 * (1000 / 60)),
  });
  // The South Coast railcars never appear in the feed, so they are not judged.
  assert.equal(get('SCO').untracked, 2);
  assert.equal(get('SCO').counted, 0);
  // Intercity is late from 6 minutes.
  assert.equal(get('BMT').late, 0);
  assert.deepEqual(s.trips.T1.map(t => [t[0], t[3]]), [[36000, 'late'], [40000, 'cancelled'], [41000, 'missing'], [42000, 'unclear'], [43000, 'part']]);
  assert.deepEqual(s.trips.T1[0], [36000, 'Emu Plains', '200060', 'late', 400, 8, 20]);
  assert.deepEqual(s.hours.T1[11], [4, 2]); // B, C, D and E start in that hour; B and C were lost
});

test('train types are judged over several days', () => {
  const day = pairStats(record);
  assert.deepEqual(day.get('SCO|N2'), [2, 0]);
  assert.deepEqual(day.get('T1|B8'), [6, 4]);
  const seenOnce = { feeds: { sydneytrains: { coverage: [[0, 90000]], trips: [T('X', 'SCO', 36000, 37000, FLAG.SEEN | FLAG.RAN, { type: 'N2' })] } } };
  assert.equal(trackedPairs([day]).has('SCO|N2'), false);
  assert.equal(trackedPairs([day, pairStats(seenOnce)]).has('SCO|N2'), false); // 1 of 3
  assert.equal(trackedPairs([pairStats(seenOnce)]).has('SCO|N2'), true);
  const s = summariseDay(record, { tracked: trackedPairs([pairStats(seenOnce)]) });
  assert.equal(s.lines.SCO[COUNTERS.indexOf('missing')], 2);
});
