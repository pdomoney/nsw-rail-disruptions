import test from 'node:test';
import assert from 'node:assert/strict';
import {formatReferenceComparison,sourceUpdateMetadata} from '../src/lib/reference-comparison-report.js';
const audit={
  schema:'nsw-rail-geometry-audit/v1',
  input:{networkGeneratedAt:'2026-10-28T00:00Z',source:{
    url:'https://portal.data.nsw.gov.au/arcgis/rest/services/Hosted/TfNSW_GTFS_Routes_Public/FeatureServer/0',
    downloadedOn:'2026-10-28',sha256:'a'.repeat(64),sourceObjectIdCount:4,
    excludedGeometryCount:1,comparisonCoverage:'partial_with_explicit_exclusions',
    portalLastUpdatedValues:['2024-02-01 10:43']
  }},
  byLine:{T1:{},T2:{},M1:{},L4:{},T6:{}},
  reference:{
    totalFeatures:4,unknownLineFeatures:1,invalidGeometryFeatures:0,
    comparedByLine:{
      T2:{features:1,samples:3,nearRouteSamples:1,sampleCoveragePercent:33.3},
      T1:{features:2,samples:12,nearRouteSamples:12,sampleCoveragePercent:100}
    },
    featureExceptions:[{line:'T2',shapeId:'=HYPERLINK("malicious")',matchedSamples:1,sampledPoints:3,
      featureIndex:3,outsideSamples:[{sampleIndex:1,referenceLatitude:-34.1,referenceLongitude:151.3,nearestInstalledRouteM:240}]}],
  }
};
test('comparison records source and diagnostic coverage, without claiming accurate track',()=>{
  const result=formatReferenceComparison(audit);
  assert.deepEqual(result.summary,{referenceFeatures:4,matchedLines:2,matchedSamples:13,sampledPoints:15,
    installedLines:5,missingReferenceLines:['L4','M1','T6'],hostedSourceMetadataStatus:'over_one_year_old'});
  assert.match(result.markdown,/one-directional source-to-site/);
  assert.match(result.markdown,/NOT verified equivalent/);
  assert.match(result.markdown,/Excluded geometry features:\*\* 1/);
  assert.match(result.markdown,/partial_with_explicit_exclusions/);
  assert.ok(result.csv.indexOf('"T1"')<result.csv.indexOf('"T2"'));
  assert.match(result.markdown,/Installed lines without a reference match: \*\*L4, M1, T6\*\*/);
  assert.match(result.markdown,/Historical source warning/);
  assert.match(result.csv,/"M1","no_matching_reference","0"/);
  assert.match(result.markdown,/NOT network-wide accuracy/);
  assert.match(result.exceptionLocationCsv,/Reference latitude/);
  assert.match(result.exceptionLocationCsv,/240/);
  assert.match(result.markdown,/NOT authoritative vehicle or track coordinates/);
});
test('rejects unsupported input or missing source identity',()=>{
  assert.throws(()=>formatReferenceComparison({}),/Expected audited/);
  assert.throws(()=>formatReferenceComparison({...audit,reference:null}),/Expected audited/);
  assert.throws(()=>formatReferenceComparison({...audit,input:{}}),/Expected audited/);
});

test('hosted update metadata is not silently presented as current',()=>{
  assert.equal(sourceUpdateMetadata(['2024-02-01 10:43'],'2026-10-28T22:19:52Z').status,'over_one_year_old');
  assert.equal(sourceUpdateMetadata([], '2026-10-28T00:00Z').status,'unverified');
  assert.equal(sourceUpdateMetadata(['not a date'],'2026-10-28T00:00Z').ageDays,null);
  assert.equal(sourceUpdateMetadata(['2024-02-01 10:43','2025-02-02 11:11'],'2026-10-28T00:00Z').latest,'2025-02-02 11:11');
});
test('missing byLine inventory reports unknown site coverage rather than fabricating missing line counts',()=>{
  const noInventory={...audit,byLine:undefined};
  const r=formatReferenceComparison(noInventory);
  assert.equal(r.summary.installedLines,null);
  assert.match(r.markdown,/Installed network line identifiers: \*\*not reported\*\*/);
});
