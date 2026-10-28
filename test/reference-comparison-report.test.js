import test from 'node:test';
import assert from 'node:assert/strict';
import {formatReferenceComparison} from '../src/lib/reference-comparison-report.js';
const audit={
  schema:'nsw-rail-geometry-audit/v1',
  input:{networkGeneratedAt:'2026-10-28T00:00Z',source:{
    url:'https://portal.data.nsw.gov.au/arcgis/rest/services/Hosted/TfNSW_GTFS_Routes_Public/FeatureServer/0',
    downloadedOn:'2026-10-28',sha256:'a'.repeat(64),sourceObjectIdCount:4,
    excludedGeometryCount:1,comparisonCoverage:'partial_with_explicit_exclusions'
  }},
  reference:{
    totalFeatures:4,unknownLineFeatures:1,invalidGeometryFeatures:0,
    comparedByLine:{
      T2:{features:1,samples:3,nearRouteSamples:1,sampleCoveragePercent:33.3},
      T1:{features:2,samples:12,nearRouteSamples:12,sampleCoveragePercent:100}
    },
    featureExceptions:[{line:'T2',shapeId:'=HYPERLINK("malicious")',matchedSamples:1,sampledPoints:3}],
  }
};
test('comparison records source and diagnostic coverage, without claiming accurate track',()=>{
  const result=formatReferenceComparison(audit);
  assert.deepEqual(result.summary,{referenceFeatures:4,matchedLines:2,matchedSamples:13,sampledPoints:15});
  assert.match(result.markdown,/one-directional source-to-site/);
  assert.match(result.markdown,/NOT verified equivalent/);
  assert.match(result.markdown,/Excluded geometry features:\*\* 1/);
  assert.match(result.markdown,/partial_with_explicit_exclusions/);
  assert.ok(result.csv.indexOf('"T1"')<result.csv.indexOf('"T2"'));
});
test('rejects unsupported input or missing source identity',()=>{
  assert.throws(()=>formatReferenceComparison({}),/Expected audited/);
  assert.throws(()=>formatReferenceComparison({...audit,reference:null}),/Expected audited/);
  assert.throws(()=>formatReferenceComparison({...audit,input:{}}),/Expected audited/);
});
