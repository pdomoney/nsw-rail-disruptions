import test from 'node:test';
import assert from 'node:assert/strict';
import {project} from '../src/lib/netmap.js';
import {METRO_SOUTHWEST_OPENED,SOUTHWEST_NEW_STOPS,reportedSouthwestMetroRegion,
 reportedSouthwestMetroProjected,southwestMetroMapSummary} from '../site/metro-southwest.js';
const network=()=>({lines:{M1:[[1,2,3,4]]},stations:[
  ...SOUTHWEST_NEW_STOPS.map((name,i)=>[name+' Station',i,10,'M1',0]),
  ['Sydenham Station',33,33,'M1 T4',1],['Lakemba bus stop',12,22,'T6',0]
]});
const pt=(lat,lon,head)=>['M1',...project(lat,lon),0,null,null,6,head];
const live=()=>({at:'2026-10-29T20:54:02Z',trains:[
  pt(-33.917,-0+151.035,'Tallawong'),pt(-33.914,151.155,'Bankstown'),
  pt(-33.80,151.19,'Bankstown'),['T6',...project(-33.917,151.035),0,null,null,8,'Bankstown'],
]});
test('opening facts and all ten new stations are distinct from passenger tracking',()=>{
  const a=southwestMetroMapSummary(network(),live(),Date.parse('2026-10-29T20:55:00Z'));
  assert.equal(a.newStationsInSource,10);
  assert.deepEqual(a.missingStations,[]);
  assert.equal(a.sourceHasMetroLine,true);
  assert.equal(a.m1Positions,3);
  assert.equal(a.southwestReportedPositions,2);
  assert.equal(a.bankstownHeadsignPositions,2);
  assert.equal(a.officiallyOpened,true);
  const before=southwestMetroMapSummary(network(),live(),METRO_SOUTHWEST_OPENED-1);
  assert.equal(before.officiallyOpened,false);
});
test('no stale snapshot is presented as live Bankstown Metro tracking',()=>{
  const old=southwestMetroMapSummary(network(),live(),Date.parse('2026-10-30T00:30:00Z'));
  assert.equal(old.positionsFresh,false);
  assert.equal(old.m1Positions,null);
  assert.equal(old.southwestReportedPositions,null);
  assert.equal(old.positionTimestamp,null);
});
test('southwest region flag uses reported geospatial coordinates only and cannot turn T6 into M1',()=>{
  assert.equal(reportedSouthwestMetroRegion(-33.917,151.035),true);
  assert.equal(reportedSouthwestMetroRegion(-33.88,151.20),false);
  assert.equal(reportedSouthwestMetroProjected(...project(-33.917,151.035)),true);
  assert.equal(reportedSouthwestMetroProjected(...project(-33.88,151.20)),false);
  assert.equal(reportedSouthwestMetroProjected(NaN,Infinity),false);
});
test('missing Metro shape and missing Southwest station names remain visible as gaps',()=>{
  const incomplete={stations:[['Bankstown Station',1,2,'T6',0]],lines:{}};
  const result=southwestMetroMapSummary(incomplete,null,Date.parse('2026-10-30T07:30:00+11:00'));
  assert.equal(result.newStationsInSource,0);
  assert.equal(result.sourceHasMetroLine,false);
  assert.equal(result.expectedNewStations,10);
  assert.equal(result.positionsFresh,false);
});
