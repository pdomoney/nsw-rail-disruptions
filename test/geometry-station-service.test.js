import test from 'node:test';
import assert from 'node:assert/strict';
import { addStationServiceEvidence } from '../src/lib/station-service-evidence.js';
import { formatGeometryAudit } from '../src/lib/geometry-audit-report.js';

const audit = {
  schema:'nsw-rail-geometry-audit/v1',
  input:{stationToleranceM:150},
  summary:{stationLinePairs:2,withinTolerance:0,reviewOffsets:2,missingGeometry:0,liveRows:0},
  byLine:{T9:{stationLinePairs:2,reviewOffsets:2}},
  stationExceptions:[
    {line:'T9',station:'Campbelltown',classification:'review-offset',distanceM:33472.7},
    {line:'T9',station:'Another',classification:'review-offset',distanceM:170}
  ]
};
const feed = {source:'/v2/gtfs/schedule/sydneytrains',builtAt:'2026-10-28T00:00Z',stations:{
  a:{n:'Campbelltown Station',c:{T9:1,T8:3808}},
  duplicate:{n:'Campbelltown Station, Platform 1',c:{T9:1}},
  b:{n:'Another Station',c:{T9:1000}},
}};
test('GTFS stop-time evidence joins to station names without platform double-counting', () => {
  const original=JSON.stringify(audit);
  const result=addStationServiceEvidence(audit,[feed]);
  assert.equal(result.stationExceptions[0].serviceEvidence.gtfsStopTimeRows,1);
  assert.equal(result.stationExceptions[0].serviceEvidence.highestStationStopTimeRowsOnLine,1000);
  assert.equal(result.stationExceptions[0].serviceEvidence.relativeToHighestStationPercent,0.1);
  assert.equal(result.stationExceptions[1].serviceEvidence.gtfsStopTimeRows,1000);
  assert.equal(result.stationServiceEvidence.matchedExceptionCount,2);
  const csv=formatGeometryAudit(result).exceptionCsv;
  assert.match(csv,/GTFS stop-time rows/);
  assert.match(csv,/0.1/);
  assert.match(formatGeometryAudit(result).markdown,/not trips currently running/);
  assert.equal(JSON.stringify(audit),original);
});
test('absent counts remain explicitly unavailable, never fabricated zero',()=>{
  const result=addStationServiceEvidence(audit,[{stations:{a:{n:'Unrelated',c:{T9:20}}}}]);
  assert.equal(result.stationExceptions[0].serviceEvidence.gtfsStopTimeRows,null);
  assert.equal(result.stationServiceEvidence.exceptionCountWithoutEvidence,2);
  assert.throws(()=>addStationServiceEvidence({},[feed]),/Expected existing/);
  assert.throws(()=>addStationServiceEvidence(audit,[{}]),/stations object/);
});
