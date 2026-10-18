import test from 'node:test';
import assert from 'node:assert/strict';
import { aggregateCrowding, buildCrowding } from '../src/lib/crowding.js';
import { summariseHotspots } from '../site/patronage.js';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

test('Sydney local date/hour, duplicate snapshots and carriage-level mean', () => {
  const rows = [
    { ts: '2026-10-18T21:05:00Z', line: 'T1', cars: '0 2 1 1 0 0', running: '5', with_occ: '4' },
    { ts: '2026-10-18T21:05:00Z', line: 'T1', cars: '0 2 1 1 0 0', running: '5', with_occ: '4' },
    { ts: '2026-10-18T21:10:00Z', line: 'T1', cars: '0 0 0 3 0 0', running: '3', with_occ: '3' },
    { ts: '2026-10-18T21:10:00Z', line: 'M1', cars: '0 0 0 0 0 0', trains: '0 0 0 5 0 0' },
  ];
  const r = aggregateCrowding(rows, { start: '2026-10-19', end: '2026-10-19' });
  assert.deepEqual(r.T1['2026-10-19'][8], [2, 4750, 1250, 7, 8, 7]);
  assert.equal(r.M1, undefined, 'whole-train levels do not get mixed with carriage levels');
});

test('Invalid, absent, filtered and off-window rows never become empty-carriage readings', () => {
  const rows = [
    { ts: '2026-10-18T21:00:00Z', line: 'T1', cars: '' },
    { ts: '2026-10-18T21:05:00Z', line: 'T1', cars: '0 0 -1 0 0 1' },
    { ts: '2026-10-17T21:05:00Z', line: 'T1', cars: '0 1 0 0 0 0' },
    { ts: '2026-10-18T21:05:00Z', line: 'L1', cars: '0 1 0 0 0 0' },
    { ts: 'invalid', line: 'T1', cars: '0 1 0 0 0 0' },
  ];
  assert.deepEqual(aggregateCrowding(rows, { start: '2026-10-19', end: '2026-10-19', allowedLines: new Set(['T1']) }), {});
});

test('Build reads CSV and skips missing historical dates', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'crowding-'));
  try {
    const month = path.join(dir, 'load', '2026-10');
    mkdirSync(month, { recursive: true });
    writeFileSync(path.join(month, '2026-10-19.csv'), 'ts,line,running,with_occ,cars\n2026-10-18T21:05:00Z,M1,8,7,0 0 4 0 0 0\n');
    const v = buildCrowding(dir, '2026-10-19', new Set(['M1']), { days: 7, generatedAt: Date.parse('2026-10-19T00:00:00Z') });
    assert.equal(v.start, '2026-10-13');
    assert.deepEqual(v.lines.M1['2026-10-19'][8], [1, 2000, 0, 4, 8, 7]);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('Day-type and range selection cannot turn missing hours into zero occupancy', () => {
  const data = {
    start: '2026-10-01', end: '2026-10-19',
    lines: { T1: {
      '2026-10-17': { 8: [4, 12000, 2000, 40, 6, 5] }, // Saturday
      '2026-10-19': { 8: [2, 4000, 0, 20, 6, 5] }, // Monday
    } },
  };
  const weekdays = summariseHotspots(data, { days: 7, dayType: 'weekday' });
  assert.equal(weekdays.T1[8].index, 2);
  assert.equal(weekdays.T1[8].snapshots, 2);
  assert.equal(weekdays.T1[9], null);
  const weekends = summariseHotspots(data, { days: 7, dayType: 'weekend' });
  assert.equal(weekends.T1[8].index, 3);
  assert.equal(weekends.T1[8].standing, 0.5);
  assert.equal(weekends.T1[8].snapshots, 4);
});
