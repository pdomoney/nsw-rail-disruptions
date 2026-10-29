import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {extractCurrentTargetShapes,compareHistoricalShapes,renderShapeReview} from '../src/lib/current-shape-reconciliation.js';
const B=s=>Buffer.from(s,'utf8');
const current=()=>extractCurrentTargetShapes({
  'routes.txt':B('route_id,route_short_name,route_long_name\nrt1,T1,T1 Western\nsco,SCO,South Coast\nshl,SHL,Southern Highlands\n'),
  'trips.txt':B('route_id,service_id,trip_id,shape_id\n'+
    'rt1,weekday,t1,2-T1-W-sj2-1.1.R\n'+
    'rt1,extra,t2,2-T1-W-sj2-1.1.R\n'+
    'sco,weekday,s1,76-SCO-sj2-1.1.R\n'+
    'sco,weekday,s2,76-SCO-sj2-1.1.R\n'+
    'shl,weekday,h1,new-SHL-shape\n'),
  'shapes.txt':B('shape_id,shape_pt_lat,shape_pt_lon,shape_pt_sequence\n'+
    '2-T1-W-sj2-1.1.R,-33.87,151.0,1\n'+
    '2-T1-W-sj2-1.1.R,-33.87,151.01,2\n'+
    '76-SCO-sj2-1.1.R,-34.00,151.00,1\n'+
    '76-SCO-sj2-1.1.R,-34.01,151.00,2\n'),
  'calendar.txt':B('service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date\n'+
    'weekday,1,1,1,1,1,0,0,20261001,20261031\n'+
    'extra,0,0,0,0,0,0,0,20261001,20261031\n'),
  'calendar_dates.txt':B('service_id,date,exception_type\nextra,20261030,1\nweekday,20261029,2\n'),
});
const ref=()=>({type:'FeatureCollection',features:[
  {type:'Feature',properties:{route_short_name:'T1',shape_id:'2-T1-W-sj2-1.1.R'},geometry:{
    type:'LineString',coordinates:[[151,-33.87],[151.01,-33.87]]
  }},
  {type:'Feature',properties:{route_short_name:'SCO',shape_id:'76-SCO-sj2-1.1.R'},geometry:{
    type:'LineString',coordinates:[[151,-34.2],[151,-34.21]]
  }},
  {type:'Feature',properties:{route_short_name:'SHL',shape_id:'76-SHL-sj2-1.1.R'},geometry:{
    type:'LineString',coordinates:[[150,-34.7],[150.01,-34.7]]
  }}
]});
test('current trip shape IDs and GTFS calendar exceptions are checked on actual service days',()=>{
  const c=current(),t=c.targets['T1|2-T1-W-sj2-1.1.R'];
  assert.equal(t.geometryPresent,true);
  assert.equal(t.currentTrips,2);
  assert.deepEqual(t.serviceDates,{'20261029':0,'20261030':2,'20261031':0});
  assert.equal(c.targets['SCO|76-SCO-sj2-1.1.R'].currentTrips,2);
  assert.equal(c.targets['SCO|2-SCO-sj2-1.1.R'].geometryPresent,false);
  assert.equal(c.lineOverview.SHL.uniqueShapeIds,1);
  assert.equal(c.malformedTargetPoints,0);
});
test('old versus current compares only matching exact shape IDs and both directions',()=>{
  const shape=current(),before=JSON.stringify(shape);
  const report=compareHistoricalShapes(shape,ref(),{source:{
    gtfsEndpoint:'/v2/gtfs/schedule/sydneytrains',gtfsSha256:'a'.repeat(64),
  }});
  assert.equal(report.exceptions.length,4);
  assert.equal(report.exceptions[0].classification,'same-id-samples-within-100m');
  assert.equal(report.exceptions[0].historicalToCurrent.percent,100);
  assert.equal(report.exceptions[0].currentToHistorical.percent,100);
  assert.equal(report.exceptions[1].classification,'same-id-geometry-difference-review');
  assert.equal(report.exceptions[2].classification,'historical-shape-id-not-found');
  assert.equal(report.exceptions[3].classification,'current-gtfs-shape-id-not-found');
  assert.equal(JSON.stringify(shape),before);
  const output=renderShapeReview(report);
  assert.match(output.markdown,/calendar\/calendar_dates/);
  assert.match(output.csv,/same-id-geometry-difference-review/);
});
test('bad GTFS files, dates or malformed historical GeoJSON cannot produce a passing result',()=>{
  assert.throws(()=>extractCurrentTargetShapes({}),/missing routes.txt/);
  assert.throws(()=>extractCurrentTargetShapes({
    'routes.txt':B('route_id\n'),'trips.txt':B('trip_id\n'),'shapes.txt':B('shape_id\n')
  },{dates:['2026-10-30']}),/YYYYMMDD/);
  assert.throws(()=>compareHistoricalShapes(current(),{}),/validated current GTFS/);
  const invalid={
    'routes.txt':B('route_id,route_short_name\nr,T1\n'),
    'trips.txt':B('route_id,service_id,trip_id,shape_id\nr,s,t,2-T1-W-sj2-1.1.R\n'),
    'shapes.txt':B('shape_id,shape_pt_lat,shape_pt_lon,shape_pt_sequence\n'+
      '2-T1-W-sj2-1.1.R,999,151,1\n'+
      '2-T1-W-sj2-1.1.R,-33.87,151,2\n'),
  };
  assert.throws(()=>extractCurrentTargetShapes(invalid),/malformed geometry rows/);
  assert.throws(()=>renderShapeReview({}),/Invalid shape/);
});
test('operator-only workflow uses the existing TfNSW API secret and never publishes routes',()=>{
  const workflow=fs.readFileSync(new URL('../.github/workflows/compare-current-sydneytrains-shapes.yml',import.meta.url),'utf8');
  assert.match(workflow,/workflow_dispatch:/);
  assert.match(workflow,/secrets.TFNSW_API_KEY/);
  assert.match(workflow,/historical-v-current-shapes\.json/);
  assert.doesNotMatch(workflow,/deploy-pages|pages: write|node src\/collect\.js/);
});
