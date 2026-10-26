import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = file => fs.readFileSync(new URL('../site/'+file, import.meta.url), 'utf8');
const app=read('app.js'),crowding=read('patronage.js'),stations=read('station-patronage.js');
const slice=(code,start,end)=> {
  const a=code.indexOf(start),b=code.indexOf(end,a+start.length);
  assert.ok(a>=0&&b>a,start+' boundary');
  return code.slice(a,b);
};
const router=slice(app,'let routeSequence = 0;', 'let lastHashPath = null;');
const log=slice(app,'async function viewLog(main) {','// ----- about -----');
const service=slice(app,'async function viewService(main) {','// ---------- trackwork ahead ----------');
const track=slice(app,'async function viewTrackwork(main) {','// Line page: this line');
const map=slice(app,'async function viewMap(main) {','// Shared hover treatment');
const line=slice(app,'async function viewLine(main, id) {','function mount(node,');

test('router assigns a new identity to every navigation and ignores old completions and errors',()=>{
  assert.match(router,/let routeSequence = 0/);
  assert.match(router,/const routeId = String\(\+\+routeSequence\)/);
  assert.match(router,/main\.dataset\.routeId = routeId/);
  assert.match(router,/if \(main\.dataset\.routeId !== routeId\) return false;\s*if\(insightRoute\)addInsightsNavigation/);
  assert.match(router,/if \(main\.dataset\.routeId !== routeId\) return false;\s*console\.error\(e\)/);
  assert.match(app,/route\(\)\.then\(rendered => \{\s*if \(!rendered\) return/);
  assert.match(router,/hash\.startsWith\('#\/trip'\)\) await viewTrip\(main\)/);
});

test('async non-Trip destinations confirm their route before updating the shared main element',()=>{
  for (const [name,source] of [['line',line],['reliability',service],
    ['trackwork',track],['map',map],['crowding',crowding],['stations',stations]]) {
    assert.match(source,/const requestRoute = main\.dataset\.routeId/,
      name+' must capture its initial route identity');
    assert.match(source,/if \(main\.dataset\.routeId !== requestRoute\) return/,
      name+' must reject stale async completions');
  }
  assert.match(service,/await loadService\(\);\s*if \(main\.dataset\.routeId !== requestRoute\) return/);
  assert.match(track,/await loadTrackwork\(\);\s*if \(main\.dataset\.routeId !== requestRoute\) return/);
  assert.match(map,/await loadMap\(true, kind\);\s*if \(main\.dataset\.routeId !== requestRoute\) return/);
  assert.match(map,/if \(kind === 'official'\) await checkOfficialMap\(\);\s*if \(main\.dataset\.routeId !== requestRoute\) return/);
  assert.match(crowding,/data = await response\.json\(\);[\s\S]*?if \(main\.dataset\.routeId !== requestRoute\) return;\s*const modes/);
  assert.match(stations,/routes = c\?\.ok \? await c\.json\(\) : \{lines:\{\},corridors:\[\]\};[\s\S]*?if \(main\.dataset\.routeId !== requestRoute\) return;\s*const lineItems/);
});

test('older async error screens cannot overwrite the currently selected Insights section',()=>{
  assert.match(crowding,/catch \{\s*if \(main\.dataset\.routeId !== requestRoute\) return/);
  assert.match(stations,/catch \(e\) \{\s*if \(main\.dataset\.routeId !== requestRoute\) return/);
  assert.match(router,/main\.replaceChildren\(h\('div', \{ class: 'error-box' \}/);
});

test('History year and search requests use both an update number and mounted view identity',()=>{
  assert.match(log,/let newestSearch = 0/);
  assert.match(log,/if \(main\.dataset\.routeId !== requestRoute \|\| !listHolder\.isConnected\) return/);
  assert.match(log,/const searchId = \+\+newestSearch/);
  assert.match(log,/const year = f\.year/);
  assert.match(log,/D\.log\[year\] \|\| \(D\.log\[year\] = await getJson/);
  assert.match(log,/if \(searchId !== newestSearch \|\| main\.dataset\.routeId !== requestRoute \|\|\s*!listHolder\.isConnected\) return/);
  assert.match(log,/countLine\.textContent = \`\$\{plural\(rows\.length, 'alert'\)\} in \$\{year\}/);
  assert.match(log,/function update|async function update/);
});

test('related viewport refreshes do not paint after a route switch',()=>{
  assert.match(track,/pageRefresh = async \(\) => \{\s*D\.trackwork = null;\s*await loadTrackwork\(\);\s*if \(main\.dataset\.routeId !== requestRoute\) return/);
  assert.match(map,/pageRefresh = async \(\) => \{[\s\S]*?if \(main\.dataset\.routeId === requestRoute\) draw\(\)/);
  assert.match(service,/my !== drawing \|\| main\.dataset\.routeId !== requestRoute/);
});

test('keeps all protected map functions, Insights data semantics and the original Trip Planner unchanged',()=>{
  assert.match(map,/drawOfficialOverlay\(holder,/);
  assert.match(map,/createGeographicMap\(holder,/);
  assert.match(map,/mapDetails|map-details-panel/);
  assert.match(track,/trackworkChart\(chart, \{ items, lines/);
  assert.match(stations,/annualStationPatronage\(data,'monthly'\)/);
  assert.match(stations,/annualStationPatronage\(data,'legacyMonthly'\)/);
  assert.match(stations,/metric: 'total'/);
  assert.match(crowding,/summariseHotspots\(data,/);
  assert.match(app,/const PLANNER = 'https:\/\/transportnsw\.info\/trip-planner\/plan'/);
  assert.match(app,/async function viewTrip\(main\) \{/);
});
