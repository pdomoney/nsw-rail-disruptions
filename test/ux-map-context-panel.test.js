import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=fs.readFileSync(new URL('../site/app.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../site/ux-refresh.css',import.meta.url),'utf8');
const map=app.slice(app.indexOf('async function viewMap(main) {'),
  app.indexOf('function networkMap(',app.indexOf('async function viewMap(main) {')));
const controls=map.slice(map.indexOf('const mapKindControl='),
  map.indexOf('    drawMapOnly();',map.indexOf('const mapKindControl=')));
const draw=map.slice(map.indexOf('  const drawMapOnly = () => {'));

test('only official and geographic map modes remain connected to verified renderers',()=>{
  assert.match(map,/OFFICIAL_MAP\.image/);
  assert.match(map,/loadOfficialMapImage\(officialImageUrl\)/);
  assert.match(map,/drawOfficialOverlay\(holder, \{ network:D\.network, live:D\.live/);
  assert.match(map,/createGeographicMap\(holder, \{/);
  assert.doesNotMatch(map,/schematicMap\(holder, \{ sch:\s*D\.schematic/);
  assert.match(map,/networkMap\(holder, \{ net:\s*D\.network/);
  assert.match(map,/onTrainHover:showTip,onHoverEnd:hideTip/);
  assert.match(map,/onTrainSelect:showSelectedTrain,onStationSelect:showSelectedStation/);
  assert.match(map,/mapViewCleanup = \(\) =>/);
  assert.match(map,/geographic\.destroy\(\)/);
  assert.match(map,/geo\.svg\.classList\.toggle\('official-enhanced-contrast'/);
});

test('map selections go into a separate accessible panel rather than covering the map frame',()=>{
  assert.match(map,/const selectedTrain = h\('div', \{ class:'map-selected-train',/);
  assert.match(map,/role:'status','aria-live':'polite','aria-atomic':'true'/);
  assert.match(map,/const detailPanel = h\('aside', \{ class:'map-details-panel',hidden:true,/);
  assert.match(map,/const mapWorkspace=h\('div', \{ class:'map-workspace' \},frame,detailPanel\)/);
  assert.match(map,/detailPanel\.hidden=false/);
  assert.match(map,/detailPanel\.hidden=true/);
  assert.match(map,/mapWorkspace\.classList\.add\('has-selection'\)/);
  assert.match(map,/mapWorkspace\.classList\.remove\('has-selection'\)/);
  assert.match(map,/onclick:clearSelectedMapItem/);
  assert.match(map,/aria-label':'Close selected map item details'/);
  assert.doesNotMatch(map,/frame\.append\(selectedTrain\)/);
  assert.match(map,/if\(geographic\)requestAnimationFrame\(\(\)=>geographic\?\.resize\(\)\)/);
  assert.match(css,/\.map-details-panel\[hidden\] \{display:none !important\}/);
  assert.match(css,/\.map-workspace\.has-selection \{/);
});

test('toolbar offers only the two supported map modes with line filter and retained settings',()=>{
  assert.match(controls,/\['official','Network diagram · TfNSW'\]/);
  assert.match(controls,/\['track','Geographic map · GTFS'\]/);
  assert.doesNotMatch(controls,/\['diagram','Legacy hand-drawn'\]/);
  assert.match(controls,/\['track','Geographic map · GTFS'\]/);
  assert.match(controls,/const areaControl=segmented/);
  assert.match(controls,/const lineControl=h\('label', \{ class:'field map-line-filter' \}/);
  assert.match(controls,/const extraDisplay=h\('details',\{class:'map-display-options'/);
  assert.match(controls,/h\('summary', \{\}, 'Display options'\)/);
  assert.match(controls,/displayOptionsOpen=extraDisplay\.open/);
  assert.match(controls,/prefs\.set\('mapKind',kind\)/);
  assert.match(controls,/prefs\.set\('mapView',v\)/);
  assert.match(controls,/prefs\.set\('mapRailFocus',v\)/);
  assert.match(controls,/\['rail','Rail focus'\]/);
  assert.match(controls,/\['streets','Street detail'\]/);
  assert.match(controls,/prefs\.set\('officialMapContrast',v\)/);
  assert.match(controls,/lineFilter=ev\.target\.value/);
  assert.match(controls,/clearSelectedMapItem\(\);setState\(\);draw\(\)/);
  assert.match(controls,/map-primary-controls/);
  assert.match(css,/\.map-primary-controls \{/);
  assert.match(css,/\.map-display-options summary:focus-visible \{/);
  assert.match(css,/min-height:44px/);
});

test('existing keyboard, pinch, drag, zoom, overlays and official attribution remain',()=>{
  assert.match(map,/svg\.addEventListener\('dblclick'/);
  assert.match(map,/svg\.addEventListener\('wheel'/);
  assert.match(map,/svg\.addEventListener\('pointerdown'/);
  assert.match(map,/svg\.addEventListener\('pointermove'/);
  assert.match(map,/geographic\.reset\(\)/);
  assert.match(map,/class:'map-source-credit'/);
  assert.match(map,/© 2026 Transport for NSW/);
  assert.match(map,/original TfNSW|Original map and attribution/);
  assert.match(map,/class:'map-methodology'/);
  assert.match(draw,/mapMethodDetails\.replaceChildren/);
  assert.match(map,/class: 'map-notes'/);
});

test('mobile selection is accessible at the bottom of the screen without waiting to scroll',()=>{
  assert.match(css,/@media \(max-width:760px\) \{/);
  assert.match(css,/\.map-workspace \.map-details-panel:not\(\[hidden\]\) \{/);
  assert.match(css,/position:fixed/);
  assert.match(css,/safe-area-inset-bottom/);
  assert.match(css,/max-height:min\(35vh,230px\)/);
  assert.match(css,/\.map-selected-train \{/);
  assert.match(css,/\.map-detail-description \{/);
  assert.match(css,/\.map-workspace \.map-zoom button \{min-width:44px;min-height:44px\}/);
});
