import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const file=name=>fs.readFileSync(new URL('../site/'+name,import.meta.url),'utf8');
const index=file('index.html'),app=file('app.js'),ux=file('ux-refresh.css');
const logo=file('rail-mark.svg'),favicon=file('favicon.svg');

test('original, independent rail-route logo is a scalable favicon and a labelled header identity',()=>{
  assert.match(index,/class="brand-mark" src="rail-mark\.svg"/);
  assert.match(index,/Independent network information/);
  assert.match(index,/NSW Rail/);
  assert.match(index,/Disruptions/);
  assert.match(index,/meta name="theme-color" content="#15364d"/);
  for(const item of [logo,favicon]){
    assert.match(item,/xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
    assert.match(item,/viewBox="0 0 64 64"/);
    assert.match(item,/fill="#15364d"/);
    assert.match(item,/stroke="#78d8dc"/);
    assert.match(item,/stroke="#ffffff"/);
    assert.doesNotMatch(item,/(waratah|nsw-government|transport-for-nsw|roundel)/i);
  }
  assert.match(index,/rel="icon" href="favicon\.svg"/);
});

test('primary header offers exactly five task destinations rather than nine analysis links',()=>{
  const links=[...index.matchAll(/<a href="([^"]+)" data-nav="([^"]+)">([^<]+)<\/a>/g)]
    .map(([,href,key,label])=>({href,key,label}));
  assert.deepEqual(links,[
    {href:'#/',key:'overview',label:'Today'},
    {href:'#/map',key:'map',label:'Network map'},
    {href:'#/trackwork',key:'trackwork',label:'Trackwork'},
    {href:'#/service',key:'insights',label:'Insights'},
    {href:'#/trip',key:'trip',label:'Plan a trip'},
  ]);
  assert.match(index,/<nav class="nav" aria-label="Primary navigation">/);
  assert.match(index,/class="footer-links"><a href="#\/about">About the data<\/a>/);
});

test('all existing deep links and data models still have separate route handlers',()=>{
  assert.match(app,/hash\.startsWith\('#\/service'\).*viewService\(main\)/);
  assert.match(app,/hash\.startsWith\('#\/crowding'\).*viewPatronage\(main, D\.meta\)/);
  assert.match(app,/hash\.startsWith\('#\/stations'\).*viewStationPatronage\(main, D\.meta\)/);
  assert.match(app,/hash\.startsWith\('#\/map'\).*viewMap\(main\)/);
  assert.match(app,/hash\.startsWith\('#\/trackwork'\).*viewTrackwork\(main\)/);
  assert.match(app,/hash\.startsWith\('#\/trip'\).*viewTrip\(main\)/);
  assert.match(app,/hash\.startsWith\('#\/log'\).*viewLog\(main\)/);
  assert.match(app,/hash\.startsWith\('#\/about'\).*viewAbout\(main\)/);
  assert.match(app,/hash\.match\(\/\^#\\\/line\\\/\(\[A-Za-z0-9\]\+\)\/\)/);
  assert.match(app,/INSIGHT_SECTIONS=Object\.freeze/);
  assert.match(app,/addInsightsNavigation\(main,hash\)/);
  assert.match(app,/insightRoute\?'insights'/);
  for(const [k,label] of [['service','Reliability'],['crowding','Crowding'],
    ['stations','Stations'],['log','History']]){
    assert.ok(app.includes("['"+k+"','"+label+"','#/"+k+"']"));
  }
});

test('the UX layer is last, has responsive accessible links and does not mutate maps',()=>{
  const css=index.match(/<link rel="stylesheet" href="([^"]+)">/g);
  assert.match(css.at(-1),/ux-refresh\.css/);
  assert.match(ux,/\.site-header \.nav a\[aria-current="page"\]/);
  assert.match(ux,/\.insights-tabs a\[aria-current="page"\]/);
  assert.match(ux,/min-height:44px/);
  assert.match(ux,/@media \(max-width:640px\)/);
  assert.match(ux,/grid-template-columns:repeat\(5,minmax\(0,1fr\)\)/);
  assert.match(ux,/\.map-frame \{/);
  assert.doesNotMatch(ux,/OFFICIAL_STOPS|reconcilePdfStations|OFFICIAL_CORRIDORS/);
  assert.match(app,/page-eyebrow/);
});
