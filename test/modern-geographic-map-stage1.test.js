import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = path => fs.readFileSync(new URL('../'+path, import.meta.url),'utf8');
const app=source('site/app.js'),geo=source('site/geo-map.js'),
  css=source('site/map-enhancements.css'),staticGtfs=source('src/lib/gtfs-static.js'),
  builder=source('src/build.js'),official=source('site/official-map.js');
const between=(str,a,b)=>{
  const i=str.indexOf(a),j=str.indexOf(b,i+a.length);
  assert.ok(i>=0&&j>i,'Cannot inspect '+a);
  return str.slice(i,j);
};
const map=between(app,'async function viewMap(main) {','// Shared hover treatment');
const nav=between(map,'const mapKindControl=segmented([','  const areaControl=segmented');
const panel=between(map,'  const draw = () => {','  draw();');

test('legacy hand-drawn map and controls are removed from the public application',()=>{
  assert.doesNotMatch(app,/function schematicMap\(/);
  assert.doesNotMatch(nav,/Legacy hand-drawn/);
  assert.doesNotMatch(nav,/\['diagram'/);
  assert.match(nav,/\['official','Network diagram · TfNSW'\]/);
  assert.match(nav,/\['track','Geographic map · GTFS'\]/);
  assert.match(map,/requested==='legacy'\|\|requested==='diagram'\?'official'/);
  assert.match(map,/p\.set\('map',kind\)/);
  assert.match(map,/const lineIds = Object\.keys\(\(kind === 'track' \? net : D\.schematic\)\.lines\)/);
  assert.match(app,/kind === 'official' && !D\.schematic/);
  assert.match(builder,/buildPatronageRoutes/);
  assert.match(builder,/buildSchematic\(\)/);
});

test('geographic route geometry comes directly from official GTFS shapes and stop coordinates',()=>{
  assert.match(staticGtfs,/files\['shapes\.txt'\]/);
  assert.match(staticGtfs,/const tb = new TrackBuilder\(\)/);
  assert.match(staticGtfs,/tb\.add\(l, line\)/);
  assert.match(builder,/projectChains\(cs, net\.grid \|\| 1e4\)/);
  assert.match(builder,/lines: Object\.fromEntries\(Object\.entries\(chains\)/);
  assert.match(builder,/stations: \[\.\.\.stations\.entries\(\)\]/);
  assert.match(geo,/const paths = Object\.fromEntries\(Object\.entries\(net\.lines\)/);
  assert.match(geo,/for \(const \[name, x, y, ids, priority\] of net\.stations/);
  assert.doesNotMatch(geo,/schematicMap|SCH_LINE_W/);
});

test('modern rail-focus display and station selection do not replace or reposition feed coordinates',()=>{
  assert.match(geo,/railFocus = 'rail'/);
  assert.match(geo,/const setRailFocus = value =>/);
  assert.match(geo,/geo-map-rail-focus/);
  assert.match(geo,/st\.on\('click', \(\) => onStationSelect\?\.\(name, near, distant\)\)/);
  assert.match(geo,/geographicStationLines\(net, name, served\)/);
  assert.match(geo,/filter && !near\.includes\(filter\)/);
  assert.match(geo,/const p = geographicCoordinates\(x, y\)/);
  assert.match(geo,/const \[line, x, y, delay, pax, fullest, , headsign\] = train/);
  assert.match(geo,/setRailFocus,\s*zoomBy:/);
  assert.match(map,/onTrainSelect: showSelectedTrain, onStationSelect: showSelectedStation/);
  assert.match(panel,/geographic\?\.setRailFocus\(v\)/);
  assert.match(css,/\.geo-map-rail-focus \.leaflet-tile-pane/);
  assert.match(css,/\.geo-map \.leaflet-control-container \.leaflet-control-attribution/);
  assert.match(css,/prefers-reduced-motion:reduce/);
});

test('published network map keeps verified source artwork and honest confidence labels',()=>{
  assert.match(map,/loadOfficialMapImage\(officialImageUrl\)/);
  assert.match(map,/drawOfficialOverlay\(holder, \{/);
  assert.match(map,/30 October 2026 TfNSW diagram includes M1 to Bankstown/);
  assert.match(map,/2024 PDF are disabled on this revised artwork/);
  assert.match(map,/namedStations\+' confirmed station locations/);
  assert.match(map,/geo\.unmatched\+' unpositioned/);
  assert.match(official,/nearestPdfSymbol/);
  assert.match(official,/OFFICIAL_STOPS = Object\.freeze/);
  assert.match(panel,/TfNSW Sydney Train Routes dataset/);
  assert.match(panel,/Original map and attribution/);
  assert.match(map,/© 2026 Transport for NSW/);
});

test('no new paid or unauthorised map tile service is introduced',()=>{
  assert.match(geo,/https:\/\/tile\.openstreetmap\.org\/\{z\}\/\{x\}\/\{y\}\.png/);
  assert.match(geo,/OpenStreetMap contributors/);
  assert.doesNotMatch(geo,/cartocdn|mapbox|googleapis/);
  assert.match(map,/Offline geographic fallback draws TfNSW GTFS stop and route geometry/);
});
