import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=fs.readFileSync(new URL('../site/app.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../site/map-enhancements.css',import.meta.url),'utf8');
const official=fs.readFileSync(new URL('../site/official-map.js',import.meta.url),'utf8');
const map=app.slice(app.indexOf('async function viewMap(main) {'),
  app.indexOf('function networkMap(',app.indexOf('async function viewMap(main) {')));

test('temporary Bankstown Metro opening banner and styles are retired completely',()=>{
  assert.doesNotMatch(map,/metroOpeningPanel|metro-opening-note|metro-opening-warning/);
  assert.doesNotMatch(map,/southwestMetroMapSummary|METRO_SOUTHWEST_OFFICIAL_URL/);
  assert.doesNotMatch(map,/M1 Southwest Metro · Bankstown extension now open/);
  assert.doesNotMatch(map,/TfNSW opening information/);
  assert.doesNotMatch(css,/\.metro-opening-note|\.metro-opening-copy|\.metro-opening-actions|\.metro-map-shortcut/);
});

test('both map types preserve existing live positions and source-backed controls',()=>{
  assert.match(map,/const live = D\.live, net = D\.network/);
  assert.match(map,/const c = live\.counts \|\| \{\}/);
  assert.match(map,/Positions at \$\{time\(live\.at\)\}/);
  assert.match(map,/\['official','Network diagram · TfNSW'\]/);
  assert.match(map,/\['track','Geographic map · GTFS'\]/);
  assert.match(map,/const lineControl=h\('label', \{ class:'field map-line-filter' \}/);
  assert.match(map,/lineFilter=ev\.target\.value/);
  assert.match(map,/drawOfficialOverlay\(holder, \{ network:D\.network, live:D\.live/);
  assert.match(map,/createGeographicMap\(holder, \{/);
  assert.match(map,/class:'map-methodology'/);
  assert.match(map,/Published 2026 network artwork/);
});

test('2026 diagram train calibration and its position-screening dependency stay intact',()=>{
  assert.match(official,/build2026PdfAlignment\(network\)/);
  assert.match(official,/locate2026Train\(train,alignment\)/);
  assert.match(official,/from '\.\/metro-southwest\.js'/);
});
