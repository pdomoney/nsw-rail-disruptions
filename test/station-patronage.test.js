import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { normalizeStationPatronage, buildStationPatronage, SOURCE_URLS, stationKey } from '../src/lib/station-patronage.js';
import { patronageRows } from '../site/station-patronage.js';

const stations = [
  ['central', 'Central Station', ['T1', 'T4', 'T9', 'M1'], []],
  ['town-hall', 'Town Hall Station', ['T1', 'T2', 'T3'], []],
  ['wy', 'Wynyard Station', ['T1', 'T2'], []],
  ['metro-only', 'North Ryde Station', ['M1'], []],
];
const provenance = { provider: 'Transport for NSW', typicalSource: SOURCE_URLS.typical, monthlySource: SOURCE_URLS.monthly };
const hourly = [
  'station,year,day_type,hour,entries,exits',
  'Central,2023,weekday,8,100.5,50',
  'Central Station,2023,weekday,9,25,20',
  'Town Hall,2023,weekday,8,40,65',
  'North Ryde,2023,weekend,8,10,12',
].join('\n') + '\n';
const monthly = [
  'station,month,entries,exits',
  'Central,2026-08,1000,1200',
  'Town Hall,2026-08,400,600',
  'North Ryde,2026-09,50,40',
].join('\n') + '\n';

test('without verifiable imported files the station page has no passenger figures', () => {
  const empty = normalizeStationPatronage({ stations });
  assert.equal(empty.available, false);
  assert.deepEqual(empty.typical, {});
  assert.deepEqual(empty.monthly, {});
  assert.deepEqual(empty.coverage.years, []);
});

test('official-provenance historical hourly averages and monthly integer counts stay separate', () => {
  const p = normalizeStationPatronage({ stations, typicalCsv: hourly, monthlyCsv: monthly, provenance });
  assert.equal(p.available, true);
  assert.deepEqual(p.coverage.years, ['2023']);
  assert.deepEqual(p.coverage.months, ['2026-08', '2026-09']);
  assert.deepEqual(p.typical['2023'].weekday.central['8'], [100.5, 50]);
  assert.deepEqual(p.typical['2023'].weekday.central['9'], [25, 20]);
  assert.deepEqual(p.monthly['2026-08'].central, [1000, 1200]);
  assert.equal(p.coverage.stationCount, 3);
  assert.equal(p.coverage.typicalRows, 4);
  assert.equal(p.coverage.monthlyRows, 3);
});

test('a multi-line interchange is counted once in all-network rankings', () => {
  const p = normalizeStationPatronage({ stations, typicalCsv: hourly, monthlyCsv: monthly, provenance });
  const all = patronageRows(p, stations, { year: '2023', day: 'weekday', hour: '8', metric: 'entries' });
  assert.deepEqual(all.map(x => x.name), ['Central Station', 'Town Hall Station']);
  assert.equal(all.reduce((s, x) => s + x.entries, 0), 140.5);
  const t1 = patronageRows(p, stations, { line: 'T1', year: '2023', day: 'weekday', hour: '8' });
  const m1 = patronageRows(p, stations, { line: 'M1', year: '2023', day: 'weekday', hour: '8' });
  assert.deepEqual(t1.map(x => x.id), ['central', 'town-hall']);
  assert.deepEqual(m1.map(x => x.id), ['central']);
  assert.equal(all.filter(x => x.id === 'central').length, 1);
});

test('filters distinguish entry/exit counts, month from historic hour, and unavailable hours', () => {
  const p = normalizeStationPatronage({ stations, typicalCsv: hourly, monthlyCsv: monthly, provenance });
  const hour9 = patronageRows(p, stations, { year: '2023', hour: '9', metric: 'exits' });
  assert.deepEqual(hour9.map(x => [x.id, x.value]), [['central', 20]]);
  const morning = patronageRows(p, stations, { year: '2023', hour: 'all', metric: 'total', search: 'central' });
  assert.equal(morning[0].value, 195.5);
  assert.equal(morning[0].hours, 2);
  const later = patronageRows(p, stations, { period: 'monthly', month: '2026-08', metric: 'exits' });
  assert.deepEqual(later.map(x => [x.id, x.value]), [['central', 1200], ['town-hall', 600]]);
  assert.deepEqual(patronageRows(p, stations, { period: 'monthly', month: '2026-10' }), []);
});

test('reject future dates presented as typical day, duplicate keys and malformed numbers', () => {
  const run = txt => normalizeStationPatronage({ stations, typicalCsv: txt, provenance });
  assert.throws(() => run(hourly.replace('2023,weekday', '2025,weekday')), /Invalid historic year/);
  assert.throws(() => run(hourly + 'Central,2023,weekday,8,100,20\n'), /Duplicate station/);
  assert.throws(() => run(hourly.replace(',100.5,50', ',,50')), /Invalid or absent/);
  assert.throws(() => run(hourly.replace(',100.5,50', ',-1,50')), /Invalid or absent/);
  assert.throws(() => run(hourly.replace(',100.5,50', ',NaN,50')), /Invalid or absent/);
  assert.throws(() => normalizeStationPatronage({ stations, monthlyCsv: monthly.replace('1000,1200', '1000.5,1200'), provenance }), /Out-of-range/);
  assert.throws(() => normalizeStationPatronage({ stations, typicalCsv: hourly, provenance: { provider: 'Transport for NSW', typicalSource: 'https://fake.example' } }), /does not match official/);
});

test('unknown stations are reported and excluded rather than mapped to another line', () => {
  const text = hourly + 'Not-A-Station,2023,weekday,8,500000,200000\n';
  const p = normalizeStationPatronage({ stations, typicalCsv: text, provenance });
  assert.equal(p.coverage.unmatchedCount, 1);
  assert.equal(p.coverage.typicalRows, 4);
  assert.equal(patronageRows(p, stations, { year: '2023', hour: '8' }).length, 2);
  const ambiguous = [...stations, ['other-town', 'Town Hall', ['T8'], []]];
  const pa = normalizeStationPatronage({ stations: ambiguous, typicalCsv: text, provenance });
  assert.equal(pa.coverage.unmatchedCount, 2);
  assert.equal(pa.typical['2023'].weekday['town-hall'], undefined);
});

test('import reads only explicit local files in data/patronage and never guesses downloads', () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'nrd-opal-'));
  try {
    const empty = buildStationPatronage(folder, stations, {allowBundledBaseline:false});
    assert.equal(empty.available, false);
    fs.mkdirSync(path.join(folder, 'patronage'));
    fs.writeFileSync(path.join(folder, 'patronage', 'typical-day.csv'), hourly);
    assert.throws(() => buildStationPatronage(folder, stations), /provenance.json/);
    fs.writeFileSync(path.join(folder, 'patronage', 'provenance.json'), JSON.stringify(provenance));
    const p = buildStationPatronage(folder, stations, {allowBundledBaseline:false});
    assert.equal(p.coverage.stationCount, 3);
  } finally { fs.rmSync(folder, { recursive: true, force: true }); }
});

test('station name matching trims suffix but does not assume interchange line attribution', () => {
  assert.equal(stationKey('North Ryde Station'), stationKey('North Ryde'));
  assert.notEqual(stationKey('Kings Cross'), stationKey('Town Hall'));
});

test('full static build with no Opal input keeps the existing site and publishes explicit unavailable status', () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'nrd-site-build-'));
  try {
    const input = path.join(folder, 'data');
    const output = path.join(folder, 'dist');
    fs.mkdirSync(input);
    const process = spawnSync(processExecPath(), [path.resolve('src/build.js')], {
      cwd: path.resolve('.'),
      env: { ...globalProcessEnv(), DATA_DIR: input, OUT_DIR: output, BUILD_NOW: '2026-10-19T04:00:00Z' },
      encoding: 'utf8', timeout: 30000,
    });
    assert.equal(process.status, 0, process.stderr + '\n' + process.stdout);
    const opal = JSON.parse(fs.readFileSync(path.join(output, 'data', 'station-patronage.json'), 'utf8'));
    assert.equal(opal.available, false);
    assert.deepEqual(opal.typical, {});
    assert.ok(fs.existsSync(path.join(output, 'data', 'meta.json')));
    assert.ok(fs.existsSync(path.join(output, 'data', 'crowding.json')));
    assert.ok(fs.existsSync(path.join(output, 'data', 'site-version.json')));
    const html = fs.readFileSync(path.join(output, 'index.html'), 'utf8');
    assert.ok(html.includes('href="#/stations"'));
    assert.match(html, /station-patronage\.[a-f0-9]{12}\.css/);
    const assets = fs.readdirSync(output);
    assert.ok(assets.some(f => /^station-patronage\.[a-f0-9]{12}\.js$/.test(f)));
    assert.ok(assets.some(f => /^app\.[a-f0-9]{12}\.js$/.test(f)));
  } finally { fs.rmSync(folder, { recursive: true, force: true }); }
});

function processExecPath() { return process.execPath; }
function globalProcessEnv() { return process.env; }
