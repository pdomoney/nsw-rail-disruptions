import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {auditDiagramTimetableFeed,summariseDiagramCrosscheck}
  from '../src/lib/2026-diagram-timetable-crosscheck.js';
const B=s=>Buffer.from(s,'utf8');
const at='2026-10-30T04:30:00.000Z'; // 15:30 AEDT
const ts=Math.floor(Date.parse(at)/1000);
const sydenham=[-33.91434,151.16655],marrickville=[-33.91409,151.15403];
function mock(){
  const map={
    routes:{'r-m':'M1'},
    sched:{
      trips:{'trip-1':['M1','daily',54000,57600,0,null,null,null,'Bankstown',null]},
      services:{daily:['20261001','20261031',127,[],[]]}
    },
    stations:{
      syd:{n:'Sydenham Station',l:['M1'],la:sydenham[0],lo:sydenham[1]},
      mar:{n:'Marrickville Station',l:['M1'],la:marrickville[0],lo:marrickville[1]}
    }
  };
  const files={
    'trips.txt':B('route_id,trip_id,shape_id,service_id,trip_headsign\nr-m,trip-1,shape1,daily,Bankstown\n'),
    'stops.txt':B('stop_id,stop_name,parent_station,stop_lat,stop_lon\n'+
      'syd,Sydenham Station,,-33.91434,151.16655\n'+
      'mar,Marrickville Station,,-33.91409,151.15403\n'),
    'stop_times.txt':B('trip_id,stop_id,stop_sequence,arrival_time,departure_time\n'+
      'trip-1,syd,1,15:00:00,15:00:00\ntrip-1,mar,2,16:00:00,16:00:00\n'),
    'shapes.txt':B('shape_id,shape_pt_lat,shape_pt_lon,shape_pt_sequence\n'+
      'shape1,-33.91434,151.16655,1\n'+
      'shape1,-33.91409,151.15403,2\n')
  };
  const vehicleFeed={header:{timestamp:ts},entity:[{
    vehicle:{timestamp:ts,trip:{tripId:'trip-1',routeId:'r-m',startDate:'20261030'},
      position:{lat:(sydenham[0]+marrickville[0])/2,
        lon:(sydenham[1]+marrickville[1])/2}}
  }]};
  const tripUpdateFeed={header:{timestamp:ts},entity:[{
    tripUpdate:{trip:{tripId:'trip-1',startDate:'20261030'},delay:60}
  }]};
  return {feedKey:'metro',staticMap:map,files,vehicleFeed,tripUpdateFeed,at};
}
test('corroborates a positioned M1 vehicle only with exact trip, source shape, date and scheduled pair',()=>{
  const r=auditDiagramTimetableFeed(mock());
  assert.equal(r.vehicles.length,1);
  const v=r.vehicles[0];
  assert.equal(v.classification,'coordinate-and-timetable-corroborated');
  assert.equal(v.shapeDistanceMetres,0);
  assert.deepEqual(v.printedStationPair,['Sydenham','Marrickville']);
  assert.equal(v.serviceCalendarRuns,true);
  assert.equal(v.tripTimeWindowPlausible,true);
  assert.equal(v.scheduledPairWindowPlausible,true);
  assert.equal(v.tripUpdateMatched,true);
  assert.equal(v.tripUpdateDelaySec,60);
  assert.equal(r.counts.M1.byClassification['coordinate-and-timetable-corroborated'],1);
  assert.match(summariseDiagramCrosscheck([r],{source:[]}),/independent-source cross-check/);
});
test('calendar-excluded date and cancelled trip cannot be corroborated',()=>{
  const v=mock();
  v.staticMap.sched.services.daily[4].push('20261030');
  assert.equal(auditDiagramTimetableFeed(v).vehicles[0].classification,'source-conflict');
  v.staticMap.sched.services.daily[4]=[];
  v.tripUpdateFeed.entity[0].tripUpdate.trip.scheduleRelationship=3;
  assert.equal(auditDiagramTimetableFeed(v).vehicles[0].classification,'source-conflict');
});
test('vehicle must be near the exact GTFS trip shape even when a station pair looks plausible',()=>{
  const v=mock();
  v.files['shapes.txt']=B('shape_id,shape_pt_lat,shape_pt_lon,shape_pt_sequence\n'+
    'shape1,-33.92,151.16655,1\nshape1,-33.92,151.15403,2\n');
  const row=auditDiagramTimetableFeed(v).vehicles[0];
  assert.equal(row.markerVisible,true);
  assert.ok(row.shapeDistanceMetres>150);
  assert.equal(row.classification,'off-trip-gtfs-shape');
});
test('missing service day and out-of-window schedule must not pass',()=>{
  const v=mock();
  delete v.vehicleFeed.entity[0].vehicle.trip.startDate;
  delete v.tripUpdateFeed.entity[0].tripUpdate.trip.startDate;
  assert.equal(auditDiagramTimetableFeed(v).vehicles[0].classification,'timetable-not-corroborated');
  v.vehicleFeed.entity[0].vehicle.trip.startDate='20261030';
  v.files['stop_times.txt']=B('trip_id,stop_id,stop_sequence,arrival_time,departure_time\n'+
    'trip-1,syd,1,21:00:00,21:00:00\ntrip-1,mar,2,22:00:00,22:00:00\n');
  assert.equal(auditDiagramTimetableFeed(v).vehicles[0].classification,'timetable-not-corroborated');
});
test('stale report, route conflict and missing source shape remain separate failures',()=>{
  const v=mock();
  v.vehicleFeed.header.timestamp-=950;
  assert.equal(auditDiagramTimetableFeed(v).vehicles[0].classification,'stale-realtime-feed');
  v.vehicleFeed.header.timestamp=ts;
  v.vehicleFeed.entity[0].vehicle.trip.routeId='other-route';
  assert.equal(auditDiagramTimetableFeed(v).vehicles[0].classification,'source-conflict');
  v.vehicleFeed.entity[0].vehicle.trip.routeId='r-m';
  v.files['shapes.txt']=B('shape_id,shape_pt_lat,shape_pt_lon,shape_pt_sequence\n');
  assert.equal(auditDiagramTimetableFeed(v).vehicles[0].classification,'current-static-evidence-incomplete');
});
test('operator workflow uses authenticated source only and never publishes maps',()=>{
  const w=fs.readFileSync(new URL('../.github/workflows/crosscheck-2026-diagram-timetable.yml',import.meta.url),'utf8');
  const script=fs.readFileSync(new URL('../scripts/audit-2026-diagram-timetable.mjs',import.meta.url),'utf8');
  assert.match(w,/workflow_dispatch:/);
  assert.match(w,/secrets.TFNSW_API_KEY/);
  assert.match(w,/contents: read/);
  assert.doesNotMatch(w,/deploy-pages|pages: write|src\/collect\.js/);
  assert.match(script,/vehiclePositions/);
  assert.match(script,/tripUpdateFeed:updates/);
  assert.doesNotMatch(script,/writeJson\(/);
});
