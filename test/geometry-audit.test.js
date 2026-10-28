import test from 'node:test';
import assert from 'node:assert/strict';
import { auditNetworkGeometry } from '../src/lib/geometry-audit.js';
import { project } from '../src/lib/netmap.js';

const network = {
  unit: 10, generatedAt: '2026-10-28T00:00:00Z',
  lines: { T1: [[0,0,100,0]], T2: [] },
  stations: [['Near',50,4,'T1',1], ['Offset',80,25,'T1',1], ['Without track',0,10,'T2',0]]
};
const live = {
  at: '2026-10-28T00:01:00Z',
  cols: ['line','x','y','delay','sx','sy'],
  trains: [['T1',12,1,null,null,null],['T1',90,0,null,50,30],['T2',null,null,null,null,null]]
};
test('per-line station-to-track offsets and vehicle-placement classes are auditable and read-only', () => {
  const before = JSON.stringify({ network, live });
  const report = auditNetworkGeometry(network, { live });
  assert.equal(report.summary.stationLinePairs, 3);
  assert.equal(report.summary.withinTolerance, 1);
  assert.equal(report.summary.reviewOffsets, 1);
  assert.equal(report.summary.missingGeometry, 1);
  assert.equal(report.byLine.T1.segmentCount, 1);
  assert.equal(report.byLine.T1.routeLengthKm, 1);
  assert.equal(report.byLine.T1.p95StationOffsetM, 250);
  assert.equal(report.byLine.T1.rowsWithGeographicCoordinates, 2);
  assert.equal(report.byLine.T1.rowsWithTrustedDiagramPlacement, 1);
  assert.equal(report.byLine.T2.rowsWithGeographicCoordinates, 0);
  assert.equal(report.stationExceptions.find(s => s.station === 'Offset').distanceM, 250);
  assert.equal(JSON.stringify({ network, live }), before);
});
test('optional external GeoJSON matching uses public route names and records unknown shapes', () => {
  const near = [[151,-33.87],[151.0108,-33.87]];
  const geojson = { type: 'FeatureCollection', features: [
    { type:'Feature',properties:{route_short_name:'T1',shape_id:'1'},geometry:{type:'LineString',coordinates:near} },
    { type:'Feature',properties:{route_short_name:'T1',shape_id:'2'},geometry:{type:'LineString',coordinates:[[151,-33.91],[151.0108,-33.91]]} },
    { type:'Feature',properties:{route_short_name:'OTHER'},geometry:{type:'LineString',coordinates:near} }
  ] };
  const report = auditNetworkGeometry(network, { reference: geojson, source: { url:'https://example.test/reference' } });
  assert.equal(report.reference.totalFeatures, 3);
  assert.equal(report.reference.unknownLineFeatures, 1);
  assert.equal(report.reference.comparedByLine.T1.features, 2);
  assert.ok(report.reference.comparedByLine.T1.sampleCoveragePercent < 100);
  assert.ok(report.reference.featureExceptions.some(e => e.shapeId === '2'));
  const locality=report.reference.featureExceptions.find(e=>e.shapeId==='2').outsideSamples;
  assert.ok(locality.length>0);
  assert.ok(locality[0].referenceLatitude < -33.89);
  assert.ok(locality[0].nearestInstalledRouteM > 100);
  assert.equal(report.input.source.url,'https://example.test/reference');
});
test('invalid data does not masquerade as a valid stop or route', () => {
  assert.deepEqual(project(-33.87,151),[0,0]);
  assert.throws(() => auditNetworkGeometry({stations:[]}),/published network/);
  assert.throws(() => auditNetworkGeometry(network,{reference:{}}),/FeatureCollection/);
  assert.equal(auditNetworkGeometry({lines:{T1:[[1,2,3]]},stations:[['Bad',NaN,0,'T1']]}).summary.missingGeometry,1);
});
