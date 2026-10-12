import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { normalizeInfo, causeOf, tripSub } from '../src/lib/classify.js';
import { matchAffectedLine, matchGtfsRoute } from '../src/lib/lines.js';
import { applySnapshot, createState } from '../src/lib/tracker.js';
import { htmlToText } from '../src/lib/text.js';

const sample = JSON.parse(fs.readFileSync(new URL('./fixtures/addinfo-sample.json', import.meta.url), 'utf8')).infos.current;
const byId = prefix => sample.find(x => x.id.startsWith(prefix));

test('real alerts are classified', () => {
  const western = normalizeInfo(byId('f44545c4'));
  assert.equal(western.k, 'incident');
  assert.equal(western.c, 'infrastructure');
  assert.deepEqual(western.l, ['T1']);
  assert.match(western.x, /urgent track repairs at Central/);

  const multi = normalizeInfo(byId('8b5be1a2'));
  assert.deepEqual(multi.l, ['T2', 'T3', 'T8']);

  assert.equal(normalizeInfo(byId('809fe8e1')).s, 'cancelled');
  assert.equal(normalizeInfo(byId('5e18016b')).s, 'late');
  assert.equal(normalizeInfo(byId('2a6f0dc5')).s, 'skipped');
  assert.equal(normalizeInfo(byId('23935adf')).k, 'advisory'); // Tangara last carriage
  const plr = normalizeInfo(byId('ems-79913'));
  assert.equal(plr.k, 'planned');
  assert.equal(plr.s, 'closure');
  assert.ok(plr.w.length >= 1);
  assert.equal(normalizeInfo(byId('ems-79760')).s, 'change'); // extra L2/L3 services
  assert.equal(normalizeInfo(byId('8df886e6')).k, 'station');
});

test('irrelevant alerts are dropped', () => {
  assert.equal(normalizeInfo(byId('ems-38678')), null); // lift
  assert.equal(normalizeInfo(byId('ems-199')), null); // very low priority
  assert.equal(normalizeInfo(byId('ems-38773')), null); // bus only
  assert.equal(normalizeInfo(byId('ems-39272')), null); // regional NSW TrainLink service
});

test('line matching across naming eras', () => {
  const m = (cls, number, op = '') => matchAffectedLine({ product: { class: cls }, number, operator: { name: op } });
  assert.equal(m(1, 'T3 Bankstown Line'), 'T3');
  assert.equal(m(1, 'T2 Inner West & Leppington Line'), 'T2');
  assert.equal(m(1, 'Central Coast & Newcastle Line'), 'CCN');
  assert.equal(m(1, 'Southern Highlands Line'), 'SHL');
  assert.equal(m(1, '623'), null);
  assert.equal(m(2, 'M Metro North West Line'), 'M1');
  assert.equal(m(2, 'M1 Metro North West & Bankstown Line'), 'M1');
  assert.equal(m(4, 'NLR'), 'NLR');
  assert.equal(m(4, 'LX Special Event Services'), null);
  assert.equal(m(5, 'T1 North Shore'), null); // buses never match
  assert.equal(matchGtfsRoute({ route_id: 'IWLR-191', route_short_name: 'L1' }), 'L1');
  assert.equal(matchGtfsRoute({ route_id: 'x', route_short_name: '', route_long_name: 'Hunter Line' }), 'HUN');
  assert.equal(matchGtfsRoute({ route_id: 'T4_2a', route_short_name: '' }), 'T4');
});

test('causes and trip message types', () => {
  assert.equal(causeOf('due to an incident requiring emergency services at Burwood'), 'emergency');
  assert.equal(causeOf('due to urgent signal repairs at Wentworthville'), 'infrastructure');
  assert.equal(causeOf('due to an issue with a freight train at Hawkesbury River'), 'vehicle');
  assert.equal(causeOf('due to flooding on the tracks'), 'weather');
  assert.equal(causeOf('due to protected industrial action'), 'industrial');
  assert.equal(causeOf('something happened'), 'unknown');
  assert.equal(tripSub('Now ending at'), 'altered');
  assert.equal(tripSub('Added Stops'), 'added');
});

test('html to text', () => {
  assert.equal(htmlToText('<strong>Sunday</strong> <ul><li>Buses&nbsp;replace trains</li></ul>Don&#x27;t'), 'Sunday\n• Buses replace trains\nDon\'t');
});

test('tracker turns snapshots into timed events', () => {
  const st = createState();
  const T = h => Date.UTC(2026, 9, 12, h, 0, 0);
  const inc = { id: 'a', k: 'incident', l: ['T1'], t: 'Western Line', x: 'delays', cr: new Date(T(9) - 10 * 60e3).toISOString(), m: new Date(T(9)).toISOString(), c: 'emergency' };
  const old = { id: 'b', k: 'trip', l: ['T2'], t: 'Cancelled', x: '', cr: '2025-01-01T00:00:00Z', m: '2025-01-01T00:00:00Z' };
  assert.deepEqual(applySnapshot(st, T(9), [inc, old]), []);
  assert.ok(st.open.b.stale);
  // Updated text and an extra line later on
  assert.deepEqual(applySnapshot(st, T(10), [{ ...inc, l: ['T1', 'T9'], x: 'delays continue', m: new Date(T(10)).toISOString() }, old]), []);
  // Gone at 10:20 → ends halfway between the last sighting (10:00) and 10:20
  const closed = applySnapshot(st, T(10) + 20 * 60e3, []);
  assert.equal(closed.length, 1); // the stale trip message is not emitted
  const ev = closed[0];
  assert.equal(ev.st, '2026-10-12T08:50:00Z'); // creation time just before first sighting
  assert.equal(ev.ls, '2026-10-12T10:00:00Z');
  assert.equal(ev.en, '2026-10-12T10:10:00Z');
  assert.deepEqual(ev.l, ['T1', 'T9']);
  assert.equal(ev.x, 'delays continue');
  assert.equal(ev.t0, undefined);
  assert.equal(ev.n, 2);
  assert.equal(ev.stale, undefined);
  assert.deepEqual(st.open, {});
});

test('a long gap between snapshots caps the end estimate', () => {
  const st = createState();
  const t0 = Date.UTC(2026, 0, 1, 0, 0, 0);
  applySnapshot(st, t0, [{ id: 'x', k: 'incident', l: ['T4'], t: 't', x: '', cr: new Date(t0).toISOString(), m: new Date(t0).toISOString() }]);
  const [ev] = applySnapshot(st, t0 + 6 * 3600e3, []);
  assert.equal(ev.en, new Date(t0 + 15 * 60e3).toISOString().replace('.000', ''));
});
