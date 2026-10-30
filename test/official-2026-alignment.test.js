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

test('only 2026 source-circle-backed conventional train corridors may display markers',()=>{
  const expected={T1:27,T2:13,T3:8,T4:28,T5:18,T7:2,T8:14,T9:6};
  for(const [line,count] of Object.entries(expected))
    assert.equal(Object.keys(PDF_2026_LINE_STOPS[line]||{}).length,count,line);
  assert.deepEqual(PDF_2026_LINE_STOPS.T7.Lidcombe,[448.6,672.95]);
  assert.deepEqual(PDF_2026_LINE_STOPS.T7['Olympic Park'],[469.26,591.66]);
  const network={stations:[
    station('Lidcombe',-33.863,151.046,'T7'),
    station('Olympic Park',-33.849,151.071,'T7'),
    station('Bondi Junction',-33.891,151.249,'T4'),
    station('Kings Cross',-33.875,151.222,'T4'),
    station('Sydenham',-33.914,151.166,'T4'),
    station('Wolli Creek',-33.928,151.153,'T4'),
  ]};
  const a=build2026PdfAlignment(network);
  assert.ok(a.T7.some(e=>e.from==='Lidcombe'&&e.to==='Olympic Park'));
  assert.ok(!a.T4.some(e=>e.from==='Bondi Junction'&&e.to==='Kings Cross'),
    'unverified 2026 stop pair must not receive train symbols');
  assert.ok(a.T4.some(e=>e.from==='Sydenham'&&e.to==='Wolli Creek'));
  assert.ok(!source2026StationHits('T4').some(([name])=>name==='Bondi Junction'));
  assert.ok(source2026StationHits('T7').some(([name])=>name==='Olympic Park'));
});

test('T4 official 2026 source rings provide every adjacent southern corridor from Wolli Creek through Sutherland',()=>{
  const stops=[
    ['Wolli Creek',-33.92855,151.15411],
    ['Arncliffe',-33.93646,151.14730],
    ['Banksia',-33.94529,151.14043],
    ['Rockdale',-33.95188,151.13686],
    ['Kogarah',-33.96215,151.13264],
    ['Carlton',-33.96827,151.12434],
    ['Allawah',-33.96958,151.11433],
    ['Hurstville',-33.96745,151.10276],
    ['Penshurst',-33.96613,151.08939],
    ['Mortdale',-33.97059,151.08129],
    ['Oatley',-33.98085,151.07897],
    ['Como',-34.00427,151.06800],
    ['Jannali',-34.01613,151.06466],
    ['Sutherland',-34.03179,151.05719],
  ];
  const network={stations:stops.map(([name,lat,lon])=>station(name,lat,lon,'T4 SCO'))};
  const alignment=build2026PdfAlignment(network);
  assert.equal(alignment.T4.length,stops.length-1);
  for(let i=1;i<stops.length;i++){
    const [from,to]=[stops[i-1][0],stops[i][0]];
    assert.ok(alignment.T4.some(edge=>edge.from===from&&edge.to===to),from+' → '+to);
  }
  const expected={
    'Hurstville':[688.76,942.64],
    'Penshurst':[688.78,962.62],
    'Mortdale':[688.78,982.79],
    'Oatley':[688.78,1002.96],
    'Como':[688.78,1023.14],
    'Jannali':[688.78,1043.31],
    'Sutherland':[688.76,1063.48],
  };
  for(const [name,xy] of Object.entries(expected)){
    assert.deepEqual(PDF_2026_LINE_STOPS.T4[name],xy);
    assert.deepEqual(source2026StationHits('T4').find(([n])=>n===name)?.[1],xy);
  }
});

test('T4 train at Penshurst–Mortdale or Oatley–Como is restored, never snapped to another line',()=>{
  const stops=[
    ['Hurstville',-33.96745,151.10276],
    ['Penshurst',-33.96613,151.08939],
    ['Mortdale',-33.97059,151.08129],
    ['Oatley',-33.98085,151.07897],
    ['Como',-34.00427,151.068],
  ];
  const alignment=build2026PdfAlignment({
    stations:stops.map(([name,lat,lon])=>station(name,lat,lon,'T4 SCO'))
  });
  for(const [from,to] of [['Penshurst','Mortdale'],['Mortdale','Oatley'],['Oatley','Como']]){
    const e=alignment.T4.find(edge=>edge.from===from&&edge.to===to);
    assert.ok(e,from+' to '+to+' should be supported');
    const midpoint=e.geoA.map((n,i)=>Math.round((n+e.geoB[i])/2));
    const position=locate2026Train(['T4',...midpoint],alignment);
    assert.ok(position,from+' to '+to+' vehicle was missing before PR68');
    assert.deepEqual([position.from,position.to],[from,to]);
    assert.ok(Math.abs(position.x-688.78)<0.05, 'icon must lie on source T4 track');
    assert.ok(position.y>=Math.min(e.pdfA[1],e.pdfB[1]));
    assert.ok(position.y<=Math.max(e.pdfA[1],e.pdfB[1]));
  }
  const actualPosition=project(-33.98977,151.07547);
  const pos=locate2026Train(['T4',...actualPosition],alignment);
  assert.ok(pos);
  assert.deepEqual([pos.from,pos.to],['Oatley','Como']);
  assert.ok(pos.distanceMetres<=250);
  assert.equal(locate2026Train(['T8',...actualPosition],alignment),null);
});

test('T4 Cronulla and Waterfall branches retain distinct, source-backed endpoints',()=>{
  for(const name of ['Loftus','Engadine','Heathcote','Waterfall',
    'Kirrawee','Gymea','Miranda','Caringbah','Woolooware','Cronulla'])
    assert.ok(PDF_2026_LINE_STOPS.T4[name],name);
  const lines=ROUTES_2026.T4;
  const south=lines.find(route=>route.includes('Heathcote'));
  const cronulla=lines.find(route=>route.includes('Kirrawee'));
  assert.deepEqual(south.slice(south.indexOf('Sutherland')),
    ['Sutherland','Loftus','Engadine','Heathcote','Waterfall']);
  assert.deepEqual(cronulla,['Sutherland','Kirrawee','Gymea',
    'Miranda','Caringbah','Woolooware','Cronulla']);
});
