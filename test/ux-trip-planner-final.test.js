import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync(new URL('../site/app.js', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../site/ux-refresh.css', import.meta.url), 'utf8');
const start = app.indexOf('async function viewTrip(main) {');
const end = app.indexOf('function notFound(main, msg) {', start);
assert.ok(start > 0 && end > start);
const trip = app.slice(start, end);

test('Trip Planner has a single station-first form with helpful focus and accessibility cues', () => {
  assert.match(trip, /class: 'trip-form trip-planner-card'/);
  assert.match(trip, /Choose your journey/);
  assert.match(trip, /Leaving from/);
  assert.match(trip, /Going to/);
  assert.match(trip, /placeholder: 'e\.g\. Central'/);
  assert.match(trip, /placeholder: 'e\.g\. Parramatta'/);
  assert.match(trip, /'aria-describedby': 'trip-from-hint'/);
  assert.match(trip, /'aria-describedby': 'trip-to-hint'/);
  assert.match(trip, /'aria-live': 'polite'/);
  assert.match(trip, /class: 'trip-form-footnote'/);
  assert.match(trip, /spellcheck: 'false'/);
  assert.match(trip, /class: 'trip-time-row'/);
});

test('editing a selected station clears stale route, validates suggestions and preserves swap', () => {
  assert.match(trip, /const resolve = \(input, hint, key\) =>/);
  assert.match(trip, /const invalid = Boolean\(input\.value\.trim\(\) && !st\)/);
  assert.match(trip, /input\.setAttribute\('aria-invalid', 'true'\)/);
  assert.match(trip, /input\.removeAttribute\('aria-invalid'\)/);
  assert.match(trip, /if \(state\[key\]\) \{ state\[key\] = null; update\(\); \}/);
  assert.match(trip, /if \(exact\) \{ resolve\(input, hint, key\); return; \}/);
  assert.match(trip, /const swap = h\('button'/);
  assert.match(trip, /\[state\.from, state\.to\] = \[state\.to, state\.from\]/);
  assert.match(trip, /\[fromIn\.value, toIn\.value\] = \[toIn\.value, fromIn\.value\]/);
  assert.match(trip, /state\.from\.id === state\.to\.id/);
  assert.match(trip, /Choose two different stations/);
});

test('trip links, depart/arrive options and saved station pairs remain backward-compatible', () => {
  assert.match(trip, /const q = new URLSearchParams\(location\.hash\.split\('\?'\)\[1\] \|\| ''\)/);
  assert.match(trip, /byId\(q\.get\('from'\) \|\| saved\.from\)/);
  assert.match(trip, /byId\(q\.get\('to'\) \|\| saved\.to\)/);
  assert.match(trip, /\['now', 'dep', 'arr'\]/);
  assert.match(trip, /if \(state\.when !== 'now' && !state\.t\) state\.t = sydNowInput\(\)/);
  assert.match(trip, /p\.set\('from', state\.from\.id\)/);
  assert.match(trip, /p\.set\('to', state\.to\.id\)/);
  assert.match(trip, /p\.set\('when', state\.when\)/);
  assert.match(trip, /p\.set\('t', state\.t\)/);
  assert.match(trip, /prefs\.set\('trip', \{ from: state\.from\.id, to: state\.to\.id \}\)/);
  assert.match(trip, /segmented\(\[\['now', 'Leave now'\], \['dep', 'Depart at'\], \['arr', 'Arrive by'\]\]/);
  assert.match(trip, /h\('label', \{ class: 'field trip-time-input' \}/);
  assert.match(trip, /state\.t = timeIn\.value; update\(\)/);
  assert.match(trip, /tripResults\(state\.from, state\.to, state\.when, state\.t\)/);
});

test('official TfNSW is the sole journey engine; visible results preserve relevant line and planned changes', () => {
  assert.match(app, /const PLANNER = 'https:\/\/transportnsw\.info\/trip-planner\/plan'/);
  assert.match(app, /function plannerUrl\(from, to, when, t, railOnly\)/);
  assert.match(app, /u\.searchParams\.set\('from', from\.id\)/);
  assert.match(app, /u\.searchParams\.set\('to', to\.id\)/);
  assert.match(app, /excludedModes/);
  assert.match(app, /function tripResults\(from, to, when, t\)/);
  assert.match(app, /const disruptions = currentDisruptions\(\)\.filter/);
  assert.match(app, /const railOnly = planned\.size === 0 && sameDay/);
  assert.match(app, /See journeys and times on transportnsw\.info/);
  assert.match(app, /if \(!sameDay\) out\.append/);
});

test('new Trip Planner layout is responsive and does not affect the Network Map or Insights', () => {
  assert.match(css, /\.trip-planner-card \{/);
  assert.match(css, /\.trip-planner-card \.trip-stations \{/);
  assert.match(css, /\.trip-planner-card input\[aria-invalid="true"\]/);
  assert.match(css, /\.trip-planner-card \.swap:focus-visible/);
  assert.match(css, /\.trip-results-host \.trip-cta \.button \{/);
  assert.match(css, /@media \(max-width:590px\)/);
  assert.match(css, /\.trip-planner-card \.trip-station-field:last-child \{grid-row:3\}/);
  assert.match(app, /drawOfficialOverlay\(holder,/);
  assert.match(app, /viewStationPatronage\(main, D\.meta\)/);
  assert.match(app, /await viewTrackwork\(main\)/);
});


test('Trip now follows the accepted async route-epoch protection, including refresh',()=>{
  assert.match(trip,/const requestRoute = main\.dataset\.routeId/);
  assert.match(trip,/main\.replaceChildren\(h\('p', \{ class:'loading', role:'status' \}, 'Loading NSW stations…'\)\)/);
  assert.match(trip,/await loadStations\(\);[\s\S]*?if \(main\.dataset\.routeId !== requestRoute\) return/);
  assert.match(trip,/const renderResults = \(\) => \{\s*if \(main\.dataset\.routeId !== requestRoute\) return/);
  assert.match(trip,/const update = \(\) => \{\s*if \(main\.dataset\.routeId !== requestRoute\) return/);
  assert.match(trip,/pageRefresh = \(\) => \{\s*if \(main\.dataset\.routeId !== requestRoute\) return/);
});

test('timed journeys cannot silently discard requested departure or arrival date',()=>{
  assert.match(trip,/type: 'datetime-local', value: state\.t \|\| sydNowInput\(\), required: true/);
  assert.match(trip,/'aria-describedby': 'trip-time-hint'/);
  assert.match(trip,/id:'trip-time-hint', class:'field-hint'/);
  assert.match(trip,/state\.when !== 'now' && \(!state\.t \|\| !timeIn\.validity\.valid\)/);
  assert.match(trip,/timeIn\.setAttribute\('aria-invalid', 'true'\)/);
  assert.match(trip,/Select a valid Sydney date and time/);
  assert.match(trip,/results\.replaceChildren\(\);\s*return;/);
  assert.match(trip,/timeIn\.removeAttribute\('aria-invalid'\)/);
  assert.match(trip,/timeIn\.addEventListener\('input',/);
  assert.match(css,/\.trip-planner-card input\[type="datetime-local"\]\[aria-invalid="true"\]/);
});

test('external TfNSW URL builder continues to encode from/to, time and allowed transport modes',()=>{
  const a=app.indexOf("const PLANNER = 'https://transportnsw.info/trip-planner/plan'");
  const b=app.indexOf('function last30(id) {',a);
  assert.ok(a>=0&&b>a);
  const makeUrl=new Function('URL',app.slice(a,b)+'\nreturn plannerUrl;')(URL);
  const from={id:'200060'},to={id:'200070'};
  const now=new URL(makeUrl(from,to,'now','',true));
  assert.equal(now.origin,'https://transportnsw.info');
  assert.equal(now.pathname,'/trip-planner/plan');
  assert.equal(now.searchParams.get('from'),'200060');
  assert.equal(now.searchParams.get('to'),'200070');
  assert.equal(now.searchParams.get('excludedModes'),'5,7,9,11');
  assert.equal(now.searchParams.has('departureDateTime'),false);
  const dep=new URL(makeUrl(from,to,'dep','2026-11-03T09:35',false));
  assert.equal(dep.searchParams.get('departureDateTime'),'202611030935');
  assert.equal(dep.searchParams.has('excludedModes'),false);
  const arr=new URL(makeUrl(from,to,'arr','2026-11-03T18:10',false));
  assert.equal(arr.searchParams.get('arrivalDateTime'),'202611031810');
  assert.equal(arr.searchParams.has('departureDateTime'),false);
});

test('only the final Trip view is replaced; prior accepted Views and routes stay available',()=>{
  assert.match(app,/function viewOverview\(main\)/);
  assert.match(app,/async function viewTrackwork\(main\)/);
  assert.match(app,/async function viewMap\(main\)/);
  assert.match(app,/async function viewService\(main\)/);
  assert.match(app,/async function viewLog\(main\)/);
  assert.match(app,/const INSIGHT_DESCRIPTIONS=Object\.freeze/);
  assert.match(app,/const routeId = String\(\+\+routeSequence\)/);
  assert.match(app,/hash\.startsWith\('#\/trip'\)\) await viewTrip\(main\)/);
  assert.match(css,/\.trip-planner-card \.trip-stations/);
  assert.match(css,/\.trip-planner-card \.trip-time-input \.field-hint/);
});
