import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {project} from '../src/lib/netmap.js';
import {LINES} from '../src/config/lines.js';
import {
  officialDiagramCoverage,SHARED_PRINTED_CORRIDORS_2026,ROUTES_2026,
  build2026PdfAlignment,locate2026Train,source2026StationHits,
} from '../site/official-2026-alignment.js';

const station=(name,lat,lon,lines)=>[name+' Station',...project(lat,lon),lines,1];
const pointBetween=(a,b)=>a.map((x,i)=>Math.round((x+b[i])/2));

test('all tracked lines have an explicit printed/shared/outside status',()=>{
  const list=new Set(LINES.map(line=>line.id));
  const unique=new Set([...Object.keys(ROUTES_2026),...Object.keys(SHARED_PRINTED_CORRIDORS_2026)]);
  for(const id of list){
    const c=officialDiagramCoverage(id);
    assert.ok(['printed','shared','outside-published-diagram'].includes(c.status),id);
    assert.equal(c.status==='outside-published-diagram',!unique.has(id),id);
  }
  for(const l of ['SCO','BMT','CCN','SHL'])
    assert.equal(officialDiagramCoverage(l).status,'shared',l);
  for(const l of ['HUN','L1','L2','L3','L4','NLR'])
    assert.equal(officialDiagramCoverage(l).status,'outside-published-diagram',l);
});
test('South Coast near Como maps to actual T4 source circle, not a guessed Intercity pixel',()=>{
  const net={stations:[
    station('Oatley',-33.98085,151.07897,'SCO T4'),
    station('Como',-34.00427,151.068,'SCO T4'),
    station('Jannali',-34.01613,151.06466,'SCO T4'),
    station('Sutherland',-34.03179,151.05719,'SCO T4'),
  ]};
  const edges=build2026PdfAlignment(net);
  assert.ok(edges.SCO.some(e=>e.from==='Oatley'&&e.to==='Como'&&e.printedLine==='T4'));
  assert.ok(edges.SCO.some(e=>e.from==='Como'&&e.to==='Jannali'&&e.printedLine==='T4'));
  const target=edges.SCO.find(e=>e.from==='Oatley'&&e.to==='Como');
  const position=locate2026Train(['SCO',...pointBetween(target.geoA,target.geoB)],edges);
  assert.ok(position,'SCO geographic train near Como must become eligible on printed T4');
  assert.ok(Math.abs(position.x-688.78)<.03);
  assert.ok(position.y>=1002.96&&position.y<=1023.14);
  assert.equal(position.confidence,'approximate-2026-verified-pair');
  const stationTargets=source2026StationHits('SCO',net);
  assert.ok(stationTargets.some(([name])=>name==='Como'));
  assert.ok(stationTargets.some(([name])=>name==='Oatley'));
  assert.ok(!stationTargets.some(([name])=>name==='Hornsby'));
});
test('BMT CCN and SHL share only physically approved printed station pairs',()=>{
  const net={stations:[
    station('Seven Hills',-33.77428,150.9362,'BMT T1'),
    station('Toongabbie',-33.78728,150.95137,'BMT T1'),
    station('Town Hall',-33.8733,151.206,'CCN T1'),
    station('Wynyard',-33.8659,151.206,'CCN T1'),
    station('East Hills',-33.9601,150.988,'SHL T8'),
    station('Panania',-33.957,150.999,'SHL T8'),
  ]};
  const edges=build2026PdfAlignment(net);
  for(const [line,from,to,printed] of [
    ['BMT','Seven Hills','Toongabbie','T1'],
    ['CCN','Town Hall','Wynyard','T1'],
    ['SHL','East Hills','Panania','T8'],
  ]){
    assert.ok(edges[line].some(e=>e.from===from&&e.to===to&&e.printedLine===printed),line);
  }
  assert.deepEqual(edges.HUN,undefined);
  assert.deepEqual(edges.L4,undefined);
});
test('missing membership does not turn an SCO train into a T4 train',()=>{
  const net={stations:[
    station('Oatley',-33.98085,151.07897,'SCO T4'),
    station('Como',-34.00427,151.068,'T4'),
  ]};
  const a=build2026PdfAlignment(net);
  assert.equal(a.SCO.length,0);
  assert.ok(a.T4.some(e=>e.from==='Oatley'&&e.to==='Como'));
  assert.equal(locate2026Train(['SCO',...project(-33.99,151.074)],a),null);
});
test('ambiguous Intercity source strands fail closed instead of selecting adjacent parallel line',()=>{
  const edge=(printedLine,offset)=>({from:'A',to:'B',printedLine,
    geoA:[0,offset],geoB:[200,offset],
    pdfA:[200,500],pdfB:[400,500]});
  assert.equal(locate2026Train(['CCN',100,5],{CCN:[
    edge('T1',0),edge('T9',10)
  ]}),null);
  const one=locate2026Train(['CCN',100,5],{CCN:[edge('T1',0)]});
  assert.ok(one);
});
test('geographic map portrait layout matches the TfNSW diagram without moving GTFS positions',()=>{
  const app=fs.readFileSync(new URL('../site/app.js',import.meta.url),'utf8');
  const css=fs.readFileSync(new URL('../site/map-enhancements.css',import.meta.url),'utf8');
  const geo=fs.readFileSync(new URL('../site/geo-map.js',import.meta.url),'utf8');
  assert.match(app,/map-frame-geographic/);
  assert.match(css,/\.map-frame\.map-frame-geographic \.geo-map\s*\{[\s\S]*?aspect-ratio:1024\s*\/\s*1447/);
  assert.match(css,/\.map-frame\.map-frame-geographic\s*\{[\s\S]*?max-width:1020px/);
  assert.match(geo,/geographicCoordinates\(x, y\)/);
  assert.match(geo,/groupReportedVehicles\(observations/);
  assert.match(app,/D\.meta\.lines\.map\(l=>l\.id\)/);
  assert.match(app,/officialDiagramCoverage\(lineFilter\)/);
  assert.match(app,/Use the Geographic Map for its reported positions/);
});
