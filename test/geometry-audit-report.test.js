import test from 'node:test';
import assert from 'node:assert/strict';
import { formatGeometryAudit } from '../src/lib/geometry-audit-report.js';

const data = {
  schema:'nsw-rail-geometry-audit/v1',
  input:{networkGeneratedAt:'2026-10-28T00:00:00Z',liveSnapshotAt:null,stationToleranceM:150},
  summary:{stationLinePairs:3,withinTolerance:1,reviewOffsets:1,missingGeometry:1,liveRows:0},
  byLine:{
    T2:{stationLinePairs:1,withinTolerance:0,reviewOffsets:0,missingGeometry:1},
    T1:{stationLinePairs:2,withinTolerance:1,reviewOffsets:1,missingGeometry:0,p95StationOffsetM:250,rowsWithGeographicCoordinates:2,rowsWithTrustedDiagramPlacement:1}
  },
  stationExceptions:[
    {line:'T1',station:'=HYPERLINK("bad")',classification:'review-offset',distanceM:250},
    {line:'T2',station:'Missing',classification:'missing-geometry',distanceM:null}
  ]
};
test('reviewable same-line exceptions, snapshot counts and safe CSV exports',()=>{
  const out=formatGeometryAudit(data,{dataCommit:'a'.repeat(40)});
  assert.match(out.markdown,/not an accuracy certification/i);
  assert.match(out.markdown,/External route agreement is not verified/);
  assert.ok(out.markdown.indexOf('| T1 |') < out.markdown.indexOf('| T2 |'));
  assert.match(out.lineCsv,/With geographic coordinates/);
  assert.match(out.exceptionCsv,/'=HYPERLINK/);
  assert.match(out.exceptionCsv,/""bad""/);
  assert.ok(out.exceptionCsv.indexOf('Missing') < out.exceptionCsv.indexOf('HYPERLINK'));
});
test('invalid input is rejected without inventing data provenance',()=>{
  assert.throws(()=>formatGeometryAudit({}),/Unsupported/);
  assert.throws(()=>formatGeometryAudit(data,{dataCommit:'unknown'}),/full Git SHA/);
  assert.match(formatGeometryAudit({...data,reference:{totalFeatures:1}}).markdown,/Supplied/);
});
