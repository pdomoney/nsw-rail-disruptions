import test from 'node:test';
import fsNode from 'node:fs';
import {project} from '../src/lib/netmap.js';
import assert from 'node:assert/strict';
import { OFFICIAL_MAP, OFFICIAL_STOPS, OFFICIAL_CORRIDORS, normaliseStop,
  projectToSegment, buildOfficialAlignment, locateOfficialTrain, OFFICIAL_LINE_STOPS, officialDisruptionPins, PDF_STATION_CROSSWALK, buildVerifiedPdfAlignment, loadOfficialMapImage, officialMapAssetUrl } from '../site/official-map.js';

const stops=[
  ['Tallawong Station',100,100,'M1',1],
  ['Rouse Hill Station',200,100,'M1',0],
  ['Kellyville Station',300,100,'M1',0],
  ['Epping Station',400,120,'M1 T9',1],
  ['Chatswood Station',550,140,'M1 T1 T9',2],
  ['Central Station',700,300,'M1 T1 T2 T4 T8',2],
  ['Town Hall Station',720,260,'T1 T2 T3 T4 T8',2],
  ['Wynyard Station',740,220,'T1 T2 T3 T8',2],
  ['Strathfield Station',400,300,'T1 T2 T3 T9',2],
  ['Parramatta Station',300,300,'T1 T2 T5',2],
  ['Blacktown Station',200,300,'T1 T5',2],
  ['Richmond Station',80,220,'T1 T5',1],
  ['Hornsby Station',540,-80,'T1 T9',2],
  ['Bondi Junction Station',850,200,'T4',1],
];
const align=buildOfficialAlignment({stations:stops});

test('original source map and image geometry are explicitly labelled',()=>{
  assert.equal(OFFICIAL_MAP.width,1024);
  assert.equal(OFFICIAL_MAP.height,1447);
  assert.equal(OFFICIAL_MAP.edition,'30 October 2026');
  assert.match(OFFICIAL_MAP.source,/^https:\/\/transportnsw\.info/);
  assert.match(OFFICIAL_MAP.image,/\/assets\/tfnsw-sydney-rail-2024\.png\?asset=verified-render-v3$/);
  assert.match(OFFICIAL_MAP.licence,/creativecommons\.org/);
});

test('official map anchor coordinates lie within the unmodified original page',()=>{
  const stations=Object.keys(OFFICIAL_STOPS);
  assert.ok(stations.length>=40);
  for (const [name,[x,y]] of Object.entries(OFFICIAL_STOPS)) {
    assert.ok(x>0 && x<OFFICIAL_MAP.width && y>0 && y<OFFICIAL_MAP.height,name);
  }
  assert.ok(OFFICIAL_STOPS.Berowra[1] < OFFICIAL_STOPS.Hornsby[1]);
  assert.ok(OFFICIAL_STOPS.Richmond[0] < OFFICIAL_STOPS.Central[0]);
  assert.ok(OFFICIAL_STOPS.Cronulla[0] > OFFICIAL_STOPS.Sutherland[0]);
  assert.ok(OFFICIAL_STOPS['Bondi Junction'][0] > OFFICIAL_STOPS['Town Hall'][0]);
});

test('safely interpolates a train between two source-anchored stations',()=>{
  assert.ok(align.M1.some(e=>e.from==='Tallawong'&&e.to==='Rouse Hill'));
  const train=['M1',150,100,0,null,null,null,'Chatswood'];
  const position=locateOfficialTrain(train,align);
  assert.ok(position);
  assert.equal(position.from,'Tallawong');
  assert.equal(position.to,'Rouse Hill');
  assert.equal(position.confidence,'approximate');
  assert.ok(Math.abs(position.x-(OFFICIAL_STOPS.Tallawong[0]+OFFICIAL_STOPS['Rouse Hill'][0])/2)<1);
  assert.ok(Math.abs(position.y-(OFFICIAL_STOPS.Tallawong[1]+OFFICIAL_STOPS['Rouse Hill'][1])/2)<1);
});

test('missing, unreported or non-matching vehicle coordinates never create a map position',()=>{
  assert.equal(locateOfficialTrain(['M1',10000,10000],align),null);
  assert.equal(locateOfficialTrain(['M1',NaN,120],align),null);
  assert.equal(locateOfficialTrain(['M1',Infinity,300],align),null);
  assert.equal(locateOfficialTrain(['BMT',700,300],align),null);
  assert.equal(locateOfficialTrain(['L1',700,300],align),null);
  assert.equal(locateOfficialTrain(['T1',700,300],{T1:[]}),null);
  const noData=buildOfficialAlignment({stations:[]});
  assert.equal(locateOfficialTrain(['T1',700,300],noData),null);
});

test('2024 diagram refuses Southwest Metro positions near Sydenham terminus',()=>{
  const actual=project(-33.91409,151.15403);
  const fake={M1:[{
    from:'Waterloo',to:'Sydenham',
    geoA:project(-33.896,151.19),geoB:project(-33.91434,151.16655),
    pdfA:[768,708],pdfB:[704,781]
  }]};
  assert.equal(locateOfficialTrain(['M1',...actual],fake),null);
  assert.ok(locateOfficialTrain(['M1',...project(-33.896,151.19)],fake));
});

test('station identity is stable but line coverage requires explicit membership',()=>{
  assert.equal(normaliseStop('Town Hall Station'),normaliseStop('Town Hall'));
  assert.ok(align.T1.some(e=>e.from==='Richmond'&&e.to==='Blacktown')===false,
    'unanchored missing intermediary should never bridge across a gap');
  assert.ok(align.T1.some(e=>e.from==='Blacktown'&&e.to==='Parramatta'));
  assert.ok(!align.T4.some(e=>e.from==='Tallawong'));
  const nearest=projectToSegment([10,2],[0,0],[20,0]);
  assert.equal(nearest.t,.5);
  assert.equal(nearest.distance,2);
  assert.equal(projectToSegment([1,2],[4,5],[4,5]),null);
});

test('2024 route list is limited to printed T1-T9 and M1, with no fabricated Intercity map',()=>{
 const ids=Object.keys(OFFICIAL_CORRIDORS).sort();
 assert.ok(ids.includes('M1')&&ids.includes('T6'));
 assert.ok(!ids.includes('BMT')&&!ids.includes('SCO')&&!ids.includes('L1'));
});

test('train marker projection uses printed line-specific city strands at interchanges',()=>{
  assert.notDeepEqual(OFFICIAL_LINE_STOPS.T1.Central, OFFICIAL_LINE_STOPS.M1.Central);
  assert.ok(align.T1.some(e=>e.from==='Central'&&e.to==='Town Hall'));
  assert.ok(align.M1.some(e=>e.from==='Tallawong'&&e.to==='Rouse Hill'), 'fixture includes a validated Metro segment');
  const t1=align.T1.find(e=>e.from==='Central'&&e.to==='Town Hall');
  assert.deepEqual(t1.pdfA,OFFICIAL_LINE_STOPS.T1.Central);
  assert.deepEqual(t1.pdfB,OFFICIAL_LINE_STOPS.T1['Town Hall']);
  assert.ok(Math.abs(t1.pdfA[0]-OFFICIAL_LINE_STOPS.M1.Central[0])>20);
});

test('official map marks only explicitly named disrupted stations; no inferred corridors',()=>{
  const alert={kind:'incident',title:'Track issue near Chatswood',
    lines:['T1','M1'],
    pins:[[0,0,'Chatswood Station'],[0,0,'Nonexistent place']],
    spins:[[0,0,'Chatswood'],[0,0,'Central']]};
  const pins=officialDisruptionPins({overlays:[alert]});
  assert.deepEqual(pins.map(p=>p.name),['Chatswood','Central']);
  assert.equal(pins[0].kind,'incident');
  assert.equal(pins[0].title,alert.title);
  assert.deepEqual(officialDisruptionPins({overlays:[alert]},'T4'),[]);
  assert.deepEqual(officialDisruptionPins({overlays:[]}),[]);
});

test('production official train alignment uses only PDF-confirmed adjacent stations and current GTFS coordinates',()=>{
  const linesByName=new Map();
  for(const [line,stops] of PDF_STATION_CROSSWALK.byLine)for(const name of stops.keys()){
    const items=linesByName.get(name)||new Set();items.add(line);linesByName.set(name,items);
  }
  const network={stations:[...PDF_STATION_CROSSWALK.positions].map(([name,p])=>[
    name,p[0],p[1],[...(linesByName.get(name)||[])].join(' ')
  ])};
  const alignment=buildVerifiedPdfAlignment(network);
  const total=Object.values(alignment).reduce((n,arr)=>n+arr.length,0);
  assert.ok(total>=100,'Expected many verified adjacent station segments for T1-T9/M1');
  for(const [line,segments] of Object.entries(alignment))for(const s of segments){
    assert.deepEqual(s.pdfA,PDF_STATION_CROSSWALK.byLine.get(line).get(s.from));
    assert.deepEqual(s.pdfB,PDF_STATION_CROSSWALK.byLine.get(line).get(s.to));
    assert.ok(Math.hypot(s.pdfB[0]-s.pdfA[0],s.pdfB[1]-s.pdfA[1])>=2);
  }
  const withMissing={stations:network.stations.filter(x=>x[0]!=='Strathfield')};
  const shorter=buildVerifiedPdfAlignment(withMissing);
  assert.ok(Object.values(shorter).flat().every(e=>e.from!=='Strathfield'&&e.to!=='Strathfield'));
  assert.ok(Object.values(shorter).reduce((n,v)=>n+v.length,0)<total);
});

test('official map preflight requires an actually decoded image, never an HTTP HEAD response', async()=>{
  const create=(width,height,fail=false)=>()=>({
    naturalWidth:width,naturalHeight:height,
    onload:null,onerror:null,
    set src(value){this.requested=value;queueMicrotask(()=>fail?this.onerror?.():this.onload?.());}
  });
  assert.equal(await loadOfficialMapImage(OFFICIAL_MAP.image,create(2048,2896)),true);
  assert.equal(await loadOfficialMapImage(OFFICIAL_MAP.image,create(0,0)),false);
  assert.equal(await loadOfficialMapImage(OFFICIAL_MAP.image,create(2048,500)),false);
  assert.equal(await loadOfficialMapImage(OFFICIAL_MAP.image,create(0,0,true)),false);
  assert.equal(await loadOfficialMapImage(OFFICIAL_MAP.image,()=>({set src(_v){/* never fires */}}),5),false);
});

test('official TfNSW map uses a module-rooted, absolute GitHub Pages image URL, unaffected by routes',()=>{
  const base='https://pdomoney.github.io/nsw-rail-disruptions/official-map.fingerprint.js';
  const expected='https://pdomoney.github.io/nsw-rail-disruptions/assets/tfnsw-sydney-rail-2026.png?asset=20261030-pinned-7877f5be';
  assert.equal(officialMapAssetUrl(base),expected);
  assert.equal(officialMapAssetUrl('https://pdomoney.github.io/nsw-rail-disruptions/official-map.js'),expected);
  assert.ok(OFFICIAL_MAP.image.startsWith('file:') || OFFICIAL_MAP.image.startsWith('https:'));
});

test('official map failure remains visible instead of falling back to legacy hand-drawn',()=>{
  const fs=fsNode;
  const app=fs.readFileSync(new URL('../site/app.js',import.meta.url),'utf8');
  assert.ok(app.includes('Official TfNSW map image unavailable'));
  assert.ok(app.includes('Retry official image'));
  assert.ok(app.includes('Open the source image directly'));
  assert.ok(app.includes('official-map-load-preview'), 'native inline image recovery required on iPhone');
  assert.ok(app.includes('officialAvailable = true;'), 'successful preview should enable the official overlay');
  assert.doesNotMatch(app,/if \(kind === 'official' && !\(await checkOfficialMap\(\)\)\)\s*\{\s*kind\s*=\s*'diagram'/);
});
