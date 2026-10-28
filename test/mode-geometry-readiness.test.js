import test from 'node:test';
import assert from 'node:assert/strict';
import {auditModeGeometry,formatModeGeometryReadiness,SOUTHWEST_OPENING,SOUTHWEST_STATIONS} from '../src/lib/mode-geometry-readiness.js';
const shape = (lat,lon)=>[Math.round(lat*1e4),Math.round(lon*1e4),0,4];
const net=(line,date='2026-10-29T01:00:00Z')=>({grid:1e4,builtAt:date,
  source:'/v2/gtfs/schedule/metro',lines:{[line]:[shape(-33.92,151.05)]}});
const stop=(name,lat,lon,line)=>({n:name+' Station',la:lat,lo:lon,l:[line]});
const st=(line,entries,date='2026-10-29T01:00:00Z')=>({builtAt:date,
  source:'/v2/gtfs/schedule/metro',
  stations:Object.fromEntries(entries.map((e,i)=>['stop'+i,stop(...e,line)]))});
const inputs=()=>{
const southwest=SOUTHWEST_STATIONS.map((name,i)=>[name,-33.92,151.05+i*.00001]);
return {networks:{
  metro:net('M1'),sydneytrains:{...net('T6'),lines:{T6:[shape(-33.92,151.05)],T1:[shape(-33.92,151.05)],SCO:[shape(-33.92,151.05)],SHL:[shape(-33.92,151.05)]}},
  'lr-parramatta':net('L4')},
  stations:{
    metro:st('M1',southwest),
    sydneytrains:{...st('T6',[['Bankstown',-33.92,151.05]]),
      stations:{a:stop('Bankstown',-33.92,151.05,'T6'),b:stop('Central',-33.92,151.05,'T1'),c:stop('Kiama',-33.92,151.05,'SCO'),d:stop('Moss Vale',-33.92,151.05,'SHL')}},
    'lr-parramatta':st('L4',[['Westmead',-33.92,151.05]]),
  }};
};
test('pre-opening snapshot identifies all 11 stations but never claims passenger services have started',()=>{
  const data=inputs(),immutable=JSON.stringify(data);
  const result=auditModeGeometry({...data,at:'2026-10-29T10:00:00+11:00'});
  assert.equal(result.opening,SOUTHWEST_OPENING);
  assert.equal(result.southwest.status,'pre-opening-static-feed-present');
  assert.equal(result.southwest.stationsOnMappedLineWithin1km,11);
  assert.equal(result.lines.T6.feed,'sydneytrains');
  assert.equal(result.lines.L4.feed,'lr-parramatta');
  assert.equal(result.lines.M1.feed,'metro');
  assert.equal(JSON.stringify(data),immutable,'audit is read-only');
});
test('opening time alone never creates a service or post-opening feed assertion',()=>{
  const data=inputs();
  const result=auditModeGeometry({...data,at:'2026-10-30T05:00:00+11:00'});
  assert.equal(result.southwest.phase,'after-announced-opening-time-unverified');
  assert.equal(result.southwest.status,'opening-time-passed-feed-not-refreshed');
  const refreshed=inputs();
  refreshed.networks.metro.builtAt='2026-10-30T05:15:00+11:00';
  const later=auditModeGeometry({...refreshed,at:'2026-10-30T06:00:00+11:00'});
  assert.equal(later.southwest.status,'post-opening-static-geometry-present-service-unverified');
});
test('missing Bankstown segment is an explicit evidence gap, not a guessed extension',()=>{
  const data=inputs();
  data.stations.metro.stations.stop10.la=-35;
  const result=auditModeGeometry({...data,at:'2026-10-30T05:00:00+11:00'});
  assert.equal(result.southwest.status,'geometry-or-stop-evidence-incomplete');
  assert.equal(result.southwest.stationsOnMappedLineWithin1km,10);
  const formatted=formatModeGeometryReadiness(result,{dataCommit:'a'.repeat(40)});
  assert.match(formatted.markdown,/static geometry\/stop proximity audit/);
  assert.match(formatted.corridorCsv,/"Bankstown","true"/);
  assert.match(formatted.markdown,/T1, SCO and SHL/);
  assert.match(formatted.lineCsv,/"L4","lightrail","lr-parramatta"/);
});
test('bad input errors and missing mode feed are explicit',()=>{
  assert.throws(()=>auditModeGeometry({networks:{},stations:{},at:'not-an-ISO-date'}),/valid ISO time/);
  const data=inputs();delete data.networks['lr-parramatta'];
  assert.equal(auditModeGeometry({...data,at:'2026-10-29T10:00:00+11:00'}).lines.L4.missingGeometry,1);
});
