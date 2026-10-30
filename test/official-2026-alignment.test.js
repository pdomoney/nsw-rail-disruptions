import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {project} from '../src/lib/netmap.js';
import {
 PDF_2026_SHA256,PDF_2026_EDITION,STOP_PIXELS_2026,PDF_2026_LINE_STOPS,
 ROUTES_2026,source2026StationHits,build2026PdfAlignment,locate2026Train,
 officialDisruptionPins2026
} from '../site/official-2026-alignment.js';
const station=(name,lat,lon,lines)=>[name+' Station',...project(lat,lon),lines,1];
const data=()=>({stations:[
 station('Tallawong',-33.69163,150.90602,'M1'),
 station('Rouse Hill',-33.69199,150.92431,'M1'),
 station('Sydenham',-33.91434,151.16655,'M1 T4'),
 station('Marrickville',-33.91409,151.15403,'M1'),
 station('Dulwich Hill',-33.9111,151.14099,'M1'),
 station('Campsie',-33.91048,151.10263,'M1'),
 station('Wiley Park',-33.92301,151.06728,'M1'),
 station('Punchbowl',-33.92538,151.05587,'M1'),
 station('Bankstown',-33.91786,151.03469,'M1 T6'),
 station('Yagoona',-33.9063,151.02498,'T6'),
 station('Lidcombe',-33.863,151.046,'T6 T1 T2 T3 T7'),
]});
test('2026 source footprint and every explicitly reviewed PDF anchor stay on the original page',()=>{
  assert.equal(PDF_2026_EDITION,'30 October 2026');
  assert.match(PDF_2026_SHA256,/^[a-f0-9]{64}$/);
  for(const [name,p] of Object.entries(STOP_PIXELS_2026)){
    assert.equal(p.length,2,name);
    assert.ok(p.every(Number.isFinite),name);
    assert.ok(p[0]>=25&&p[0]<=1000&&p[1]>=150&&p[1]<=1250,name);
  }
  assert.ok(STOP_PIXELS_2026.Bankstown[0]<STOP_PIXELS_2026.Sydenham[0]);
  assert.ok(STOP_PIXELS_2026.Bankstown[1]>STOP_PIXELS_2026.Sydenham[1]);
  assert.ok((ROUTES_2026.M1||[]).flat().includes('Bankstown'));
  assert.ok((ROUTES_2026.T6||[]).flat().includes('Bankstown'));
});
test('M1 Southwest station-to-station positions use 2026 PDF coordinates, not 2024',()=>{
  const source=data();
  const a=build2026PdfAlignment(source);
  assert.ok(a.M1.some(e=>e.from==='Sydenham'&&e.to==='Marrickville'));
  assert.ok(a.M1.some(e=>e.from==='Punchbowl'&&e.to==='Bankstown'));
  assert.ok(a.T6.some(e=>e.from==='Yagoona'&&e.to==='Bankstown'));
  const e=a.M1.find(e=>e.from==='Punchbowl'&&e.to==='Bankstown');
  const midpoint=e.geoA.map((v,i)=>Math.round((v+e.geoB[i])/2));
  const estimate=locate2026Train(['M1',...midpoint],a);
  assert.ok(estimate);
  assert.equal(estimate.confidence,'approximate-2026-verified-pair');
  assert.equal(estimate.from,'Punchbowl');
  assert.equal(estimate.to,'Bankstown');
  const lower=Math.min(e.pdfA[0],e.pdfB[0]);
  const upper=Math.max(e.pdfA[0],e.pdfB[0]);
  assert.ok(estimate.x>=lower&&estimate.x<=upper);
});
test('only existing source line memberships and same-line adjacent stops are eligible',()=>{
  const source=data();
  const a=build2026PdfAlignment(source);
  assert.ok(a.M1.every(e=>e.from!=='Yagoona'&&e.to!=='Yagoona'));
  assert.equal(a.T2.length,0);
  const missing={stations:source.stations.filter(r=>!r[0].startsWith('Punchbowl'))};
  const b=build2026PdfAlignment(missing);
  assert.ok(!b.M1.some(e=>e.from==='Wiley Park'&&e.to==='Bankstown'));
  assert.ok(!b.M1.some(e=>e.from==='Punchbowl'&&e.to==='Bankstown'));
});
test('faraway, malformed and irrelevant feed positions never appear on the schematic',()=>{
  const a=build2026PdfAlignment(data());
  assert.equal(locate2026Train(['M1',NaN,0],a),null);
  assert.equal(locate2026Train(['M1',30000,30000],a),null);
  assert.equal(locate2026Train(['L1',...project(-33.91,151.1)],a),null);
  const e=a.M1.find(e=>e.from==='Tallawong'&&e.to==='Rouse Hill');
  assert.ok(e);
  const midpoint=e.geoA.map((v,i)=>Math.round((v+e.geoB[i])/2));
  assert.equal(locate2026Train(['M1',midpoint[0],midpoint[1]+1000],a),null);
});
test('source named-station taps and disruption pins stay bounded to 2026 registry',()=>{
  const active=source2026StationHits('M1');
  assert.ok(active.some(([name])=>name==='Bankstown'));
  assert.ok(!source2026StationHits('T4').some(([name])=>name==='Punchbowl'));
  const pins=officialDisruptionPins2026({overlays:[
    {kind:'closed',title:'Closure at Bankstown',lines:['M1'],
      pins:[[1,2,'Bankstown Station'],[0,0,'Unknown Place']],
      spins:[[1,2,'Bankstown Station']]}
  ]},'M1');
  assert.equal(pins.length,1);
  assert.deepEqual(pins[0].xy,PDF_2026_LINE_STOPS.M1.Bankstown);
  assert.equal(officialDisruptionPins2026({overlays:[]},'M1').length,0);
});
test('the new 2026 alignment cannot accidentally import old 2024 circle symbols',()=>{
  const code=fs.readFileSync(new URL('../site/official-2026-alignment.js',import.meta.url),'utf8');
  const map=fs.readFileSync(new URL('../site/official-map.js',import.meta.url),'utf8');
  assert.doesNotMatch(code,/PDF_SYMBOLS_2024|REFERENCE_2024_ROUTES/);
  assert.match(map,/build2026PdfAlignment\(network\)/);
  assert.match(map,/locate2026Train\(train,alignment\)/);
  assert.doesNotMatch(map,/calibrationPending:true/);
});

test('official October 2026 PDF crosswalk uses line-specific source ring locations',()=>{
  const m=PDF_2026_LINE_STOPS.M1,t6=PDF_2026_LINE_STOPS.T6;
  assert.equal(Object.keys(m).length,31);
  assert.equal(Object.keys(t6).length,6);
  assert.deepEqual(m.Bankstown,[486.74,800.81]);
  assert.deepEqual(m.Punchbowl,[514.27,800.81]);
  assert.deepEqual(m.Sydenham,[703.93,750.91]);
  assert.deepEqual(m.Chatswood,[658.07,447.15]);
  assert.deepEqual(t6.Bankstown,[481.92,796]);
  assert.deepEqual(t6.Yagoona,[469.52,783.89]);
  const taps=source2026StationHits('M1');
  const bank=taps.find(([name])=>name==='Bankstown');
  assert.deepEqual(bank[1],m.Bankstown);
  assert.notDeepEqual(m.Bankstown,t6.Bankstown);
  const t6Tap=source2026StationHits('T6').find(([name])=>name==='Bankstown');
  assert.deepEqual(t6Tap[1],t6.Bankstown);
});
test('geographic tolerance is bounded at 250 metres even for an otherwise matched station pair',()=>{
  const a=build2026PdfAlignment(data());
  const edge=a.M1.find(e=>e.from==='Tallawong'&&e.to==='Rouse Hill');
  assert.ok(edge);
  const midpoint=edge.geoA.map((v,i)=>(v+edge.geoB[i])/2);
  const direction=[edge.geoB[0]-edge.geoA[0],edge.geoB[1]-edge.geoA[1]];
  const norm=Math.hypot(...direction);
  const nearby=[midpoint[0]-direction[1]/norm*15,midpoint[1]+direction[0]/norm*15];
  const far=[midpoint[0]-direction[1]/norm*32,midpoint[1]+direction[0]/norm*32];
  assert.ok(locate2026Train(['M1',...nearby],{M1:[edge]}));
  assert.equal(locate2026Train(['M1',...far],{M1:[edge]}),null);
});
