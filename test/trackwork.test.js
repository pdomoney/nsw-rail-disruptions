import test from 'node:test';
import assert from 'node:assert/strict';
import { severity, splitBranch, splitText, trackworkItems } from '../src/lib/trackwork.js';

test('how much trackwork changes a journey', () => {
  assert.equal(severity('Buses replace trains between Waterfall and Sutherland'), 3);
  assert.equal(severity('Buses replace Inner West trains between Strathfield and Central'), 3);
  assert.equal(severity('City Circle: Trains do not run on the City Circle, or between Central and Wynyard'), 3);
  assert.equal(severity('L4 Westmead and Carlingford Line partial closure during Parramatta Lanes'), 3);
  assert.equal(severity('Buses replace some trains between Moss Vale and Campbelltown'), 2);
  assert.equal(severity('Trains run to a changed timetable. At times, buses replace trains between Olympic Park and Central'), 2);
  assert.equal(severity('T1 North Shore Line: Trains run between Berowra and Wynyard only'), 2);
  assert.equal(severity('Trains run between Hornsby and Central, platforms 1-14'), 2);
  assert.equal(severity('Trains run to a changed timetable and stopping pattern'), 1);
  assert.equal(severity('Some trains make extra stops at St Peters and Erskineville'), 1);
  assert.equal(severity('Extra L2 and L3 light rail services run during train trackwork in the City'), 0);
});

test('branch prefixes and alert text are split out', () => {
  assert.deepEqual(splitBranch('T1 Western Line: Buses replace trains between Parramatta and Lidcombe'),
    { branch: 'Western Line', title: 'Buses replace trains between Parramatta and Lidcombe' });
  assert.deepEqual(splitBranch('City Circle: trains do not run'), { branch: 'City Circle', title: 'Trains do not run' });
  assert.deepEqual(splitBranch('Buses replace trains between A and B'), { branch: null, title: 'Buses replace trains between A and B' });
  assert.deepEqual(splitText('Sunday 18 October\n\n• Buses replace trains .\n• Plan ahead'),
    { dateLine: 'Sunday 18 October', bullets: ['Buses replace trains.', 'Plan ahead'] });
});

test('only planned alerts with windows still to come, soonest first', () => {
  const now = Date.parse('2026-10-14T00:00:00Z');
  const rec = (id, w, more = {}) => ({ id, k: 'planned', l: ['T9', 'T1'], t: 'Buses replace trains between A and B', x: 'Saturday\n• One', w, ...more });
  const items = trackworkItems([
    rec('later', [['2026-10-20T15:00:00Z', '2026-10-21T15:00:00Z']]),
    rec('past', [['2026-10-10T15:00:00Z', '2026-10-11T15:00:00Z']]),
    rec('soon', [['2026-10-10T15:00:00Z', '2026-10-11T15:00:00Z'], ['2026-10-16T15:00:00Z', '2026-10-17T15:00:00Z']]),
    rec('standing', [['2026-10-01T00:00:00Z', '2026-12-01T00:00:00Z']]),
    rec('incident', [['2026-10-16T15:00:00Z', '2026-10-17T15:00:00Z']], { k: 'incident' }),
  ], now);
  assert.deepEqual(items.map(i => i.id), ['soon', 'later']);
  assert.deepEqual(items[0].w, [['2026-10-16T15:00:00.000Z', '2026-10-17T15:00:00.000Z']]);
  assert.deepEqual(items[0].l, ['T1', 'T9']);
  assert.equal(items[0].sev, 3);
  // The same work published for two lines becomes one item.
  const merged = trackworkItems([
    rec('a', [['2026-10-16T15:00:00Z', '2026-10-17T15:00:00Z']], { l: ['T4'] }),
    rec('b', [['2026-10-16T15:00:00Z', '2026-10-17T15:00:00Z']], { l: ['SCO'] }),
    rec('c', [['2026-10-18T15:00:00Z', '2026-10-19T15:00:00Z']], { l: ['T2'] }),
  ], now);
  assert.deepEqual(merged.map(i => [i.id, i.l]), [['a', ['T4', 'SCO']], ['c', ['T2']]]);
});
