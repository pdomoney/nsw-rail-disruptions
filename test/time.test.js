import test from 'node:test';
import assert from 'node:assert/strict';
import { sydDate, sydMidnight, splitByDay, addDays, daysBetween, sydWeekday, sydHour } from '../src/lib/time.js';

test('Sydney dates and midnights', () => {
  assert.equal(sydDate(Date.UTC(2026, 9, 11, 13, 30)), '2026-10-12'); // 00:30 AEDT
  assert.equal(sydMidnight('2026-07-01'), Date.UTC(2026, 5, 30, 14)); // AEST, UTC+10
  assert.equal(sydMidnight('2026-12-25'), Date.UTC(2026, 11, 24, 13)); // AEDT, UTC+11
  assert.equal(sydHour(Date.UTC(2026, 11, 24, 13)), 0);
  assert.equal(sydWeekday(Date.UTC(2026, 9, 12, 2)), 0); // Monday 12 Oct 2026
});

test('splitByDay across the daylight-saving change (4 Oct 2026 is 23 hours long)', () => {
  const start = sydMidnight('2026-10-03') + 22 * 3600e3;
  const end = sydMidnight('2026-10-05') + 2 * 3600e3;
  const parts = splitByDay(start, end);
  assert.deepEqual(parts.map(p => p.date), ['2026-10-03', '2026-10-04', '2026-10-05']);
  assert.equal(parts[1].ms, 23 * 3600e3);
  assert.equal(parts.reduce((a, p) => a + p.ms, 0), end - start);
});

test('date arithmetic', () => {
  assert.equal(addDays('2024-02-28', 2), '2024-03-01');
  assert.equal(daysBetween('2023-07-01', '2024-07-01'), 366);
});
