import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=name=>fs.readFileSync(new URL('../site/'+name,import.meta.url),'utf8');
const app=read('app.js'),styles=read('ux-refresh.css');
const station=read('station-patronage.js'),crowding=read('patronage.js');
const start=app.indexOf('const INSIGHT_SECTIONS=Object.freeze([');
const end=app.indexOf('let lastHashPath = null;',start);
assert.ok(start>0&&end>start);
const nav=app.slice(start,end);

test('single primary Insights destination retains all four original hash-route targets',()=>{
  assert.match(nav,/INSIGHT_SECTIONS=Object\.freeze/);
  for(const [key,label] of [['service','Reliability'],['crowding','Crowding'],
    ['stations','Stations'],['log','History']]){
    assert.ok(nav.includes("['"+key+"','"+label+"','#/"+key+"']"),key);
  }
  assert.match(nav,/hash\.startsWith\('#\/service'\)\|\|hash\.startsWith\('#\/insights'\).*viewService\(main\)/);
  assert.match(nav,/hash\.startsWith\('#\/crowding'\).*viewPatronage\(main, D\.meta\)/);
  assert.match(nav,/hash\.startsWith\('#\/stations'\).*viewStationPatronage\(main, D\.meta\)/);
  assert.match(nav,/hash\.startsWith\('#\/log'\).*viewLog\(main\)/);
  assert.match(nav,/aria-label':'Insights sections'/);
  assert.match(nav,/aria-current':'page'/);
  assert.match(nav,/main\.classList\.toggle\('insights-page', insightRoute\)/);
});

test('shared Insights measurement guide never conflates distinct units or source quality',()=>{
  assert.match(nav,/const INSIGHT_DESCRIPTIONS=Object\.freeze/);
  assert.match(nav,/Timetabled trips compared with TfNSW live observations/);
  assert.match(nav,/Passenger-hours lost are modelled estimates/);
  assert.match(nav,/relative 0–5 carriage occupancy scale/);
  assert.match(nav,/Some observations are predicted/);
  assert.match(nav,/Station tap counts by month, year and corridor/);
  assert.match(nav,/Entries \+ exits are tap events, not unique journeys/);
  assert.match(nav,/TfNSW alert records and derived disruption comparisons/);
  assert.match(nav,/historical charts do not describe current service/);
  assert.match(nav,/const guide=h\('div',\{class:'insights-measure-guide'\}/);
  assert.match(nav,/h\('details',\{class:'insights-compare'\}/);
  assert.match(nav,/h\('summary',\{\},'Compare these measures'\)/);
  assert.match(nav,/main\.prepend\(kicker,tabs,guide\)/);
});

test('keeps each view\'s existing H1, data modules and scoped explanation',()=>{
  assert.match(app,/h\('h1', \{\}, 'Service reliability'\)/);
  assert.match(app,/document\.title = 'Reliability \| NSW Rail Disruptions'/);
  assert.match(app,/h\('h1', \{\}, 'Alert history'\)/);
  assert.match(crowding,/el\('h1', \{\}, 'Crowding hotspots'\)/);
  assert.match(station,/node\('h1', \{\}, 'Station patronage'\)/);
  assert.match(station,/metric: 'total'/);
  assert.match(station,/annualStationPatronage\(data,'monthly'\)/);
  assert.match(station,/annualStationPatronage\(data,'legacyMonthly'\)/);
  assert.match(crowding,/summariseHotspots\(data, \{ days: Number\(filters\.period\), dayType: filters\.type \}\)/);
  assert.match(app,/function calendarSection\(\)/);
  assert.match(app,/function rankingSection\(\)/);
});

test('responsive design shares filter sizing but leaves independent station and map charts intact',()=>{
  assert.match(styles,/\.insights-page \.insights-tabs \{/);
  assert.match(styles,/\.insights-page \.insights-tabs a \{/);
  assert.match(styles,/\.insights-measure-guide \{/);
  assert.match(styles,/\.insights-compare summary:focus-visible \{/);
  assert.match(styles,/\.insights-page > \.pat-controls,/);
  assert.match(styles,/\.insights-page > \.sp-controls,/);
  assert.match(styles,/\.insights-page > \.filters \{/);
  assert.match(styles,/@media \(max-width:720px\)/);
  assert.match(styles,/\.insights-page \.pat-table-scroll,/);
  assert.match(styles,/\.insights-page \.sp-diagram-scroll/);
  assert.match(app,/drawOfficialOverlay\(holder,/);
  assert.match(app,/viewTrackwork\(main\)/);
});
