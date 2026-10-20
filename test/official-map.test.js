import test from 'node:test';
import assert from 'node:assert/strict';
import { OFFICIAL_MAP, OFFICIAL_STOPS, OFFICIAL_CORRIDORS, normaliseStop,
  projectToSegment, buildOfficialAlignment, locateOfficialTrain } from '../site/official-map.js';

const stops=[
  ['Tallawong Station',100,100,'M1',1],
  ['Rouse Hill Station',200,100,'M1',0],
  ['Kellyville Station',300,100,'M1',0],
  ['Epping Station',400,120,'M1 T9',1],
  ['Chatswood Station',550,140,'M1 T1 T9',2],
  ['Central Station',700,300,'M1 T1 T2 T4 T8',2],
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
  assert.equal(OFFICIAL_MAP.edition,'30 September 2024');
  assert.match(OFFICIAL_MAP.source,/^https:\/\/transportnsw\.info/);
  assert.match(OFFICIAL_MAP.image,/\.png$/);
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
