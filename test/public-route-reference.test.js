import test from 'node:test';
import assert from 'node:assert/strict';
import {fetchPublicRailRouteReference,PUBLIC_ROUTES_LAYER} from '../src/lib/public-route-reference.js';

const metadata={
  name:'Routes',geometryType:'esriGeometryPolyline',supportedQueryFormats:'JSON, geoJSON, PBF',
  serviceItemId:'abc',fields:['objectid','route_short_name','route_id','shape_id',
    'portal_last_updated','route_long_name'].map(name=>({name}))
};
const feature=(objectid,route_short_name='T1')=>({
  type:'Feature',id:objectid,properties:{
    objectid,route_short_name,route_id:'id',shape_id:'shape-'+objectid,
    portal_last_updated:'2026-10-23',
  },
  geometry:{type:'LineString',coordinates:[[151,-33.87],[151.001,-33.87]]}
});
function source(responses) {
  const requested=[];
  const fetchImpl=async url=>{
    const parsed=new URL(url);requested.push(parsed);
    const value=responses.shift();
    return {ok:true,json:async()=>value};
  };
  return {fetchImpl,requested};
}
test('downloads complete paginated reference with captured source metadata, not guessed GPS',async()=>{
  const input=source([metadata,{objectIds:[3,1,2]},
    {type:'FeatureCollection',features:[feature(1),feature(2,'T8')]},
    {type:'FeatureCollection',features:[feature(3,'CCN')]}]);
  const {geojson,provenance}=await fetchPublicRailRouteReference({
    fetchImpl:input.fetchImpl,batchSize:2,acquiredAt:'2026-10-28T01:00:00Z',
  });
  assert.equal(geojson.features.length,3);
  assert.equal(provenance.namedTrainFeatures,3);
  assert.equal(provenance.layerUrl,PUBLIC_ROUTES_LAYER);
  assert.deepEqual(provenance.portalLastUpdatedValues,['2026-10-23']);
  assert.match(provenance.status,/not_verified_portal_download/);
  assert.equal(input.requested[2].searchParams.get('objectIds'),'1,2');
  assert.equal(input.requested[3].searchParams.get('objectIds'),'3');
  assert.equal(input.requested[2].searchParams.get('outSR'),'4326');
});
test('refuses incomplete or malformed responses, changed layer schemas and non-NSW coordinates',async()=>{
  await assert.rejects(()=>fetchPublicRailRouteReference({
    fetchImpl:source([{...metadata,name:'Unknown'}]).fetchImpl,
  }),/metadata changed/);
  await assert.rejects(()=>fetchPublicRailRouteReference({
    fetchImpl:source([metadata,{objectIds:[1,2]},{type:'FeatureCollection',features:[feature(1)]}]).fetchImpl,
  }),/partial/);
  const bad=feature(1);bad.geometry.coordinates[0]=[15100000,-33.87];
  const excluded=await fetchPublicRailRouteReference({
    fetchImpl:source([metadata,{objectIds:[1,2]},{
      type:'FeatureCollection',features:[bad,feature(2)]
    }]).fetchImpl,
  });
  assert.equal(excluded.geojson.features.length,1);
  assert.equal(excluded.provenance.excludedGeometryCount,1);
  assert.equal(excluded.provenance.comparisonCoverage,'partial_with_explicit_exclusions');
  assert.equal(excluded.rejectedFeatures[0].objectId,1);
  await assert.rejects(()=>fetchPublicRailRouteReference({
    fetchImpl:source([metadata,{objectIds:[1,1]}]).fetchImpl,
  }),/object ID list/);
  await assert.rejects(()=>fetchPublicRailRouteReference({
    fetchImpl:source([metadata,{objectIds:[1]},{type:'FeatureCollection',features:[feature(1,'ZZ')]}]).fetchImpl,
  }),/recognisable/);
  await assert.rejects(()=>fetchPublicRailRouteReference({batchSize:1001}),/Batch size/);
});
test('requests cannot escape the pinned NSW public ArcGIS layer',async()=>{
  const input=source([metadata,{objectIds:[1]},{type:'FeatureCollection',features:[feature(1)]}]);
  await fetchPublicRailRouteReference({fetchImpl:input.fetchImpl});
  assert.ok(input.requested.every(url=>url.href.startsWith(PUBLIC_ROUTES_LAYER)));
});

test('identifies exactly which feature violates GIS geometry bounds without dumping data',async()=>{
  const bad=feature(42);
  bad.geometry.coordinates[1]=[0,0];
  await assert.rejects(
    ()=>fetchPublicRailRouteReference({fetchImpl:source([
      metadata,{objectIds:[42]},{type:'FeatureCollection',features:[bad]}
    ]).fetchImpl}),
    /No recognisable train route names/
  );
});
test('recognises GeoJSON feature OBJECTID fields irrespective of casing',async()=>{
  const f=feature(7);
  delete f.properties.objectid;
  f.properties.ObjectId=7;
  const result=await fetchPublicRailRouteReference({fetchImpl:source([
    metadata,{objectIds:[7]},{type:'FeatureCollection',features:[f]}
  ]).fetchImpl});
  assert.equal(result.geojson.features.length,1);
});

test('NSW public layer extent includes interstate route links, and bad multi-part segments are quarantined',async()=>{
  const west=feature(1);
  west.geometry={type:'MultiLineString',coordinates:[
    [[138.56,-34.2],[139.1,-34.5]],
    [[151,-33.87],[151.001,-33.87]],
  ]};
  const degenerate=feature(2,'T8');
  degenerate.geometry={type:'MultiLineString',coordinates:[
    [[151,-33.87]],[[151,-33.88],[151.01,-33.88]]
  ]};
  const response=await fetchPublicRailRouteReference({fetchImpl:source([
    metadata,{objectIds:[1,2,3]},
    {type:'FeatureCollection',features:[west,degenerate,feature(3)]}
  ]).fetchImpl});
  assert.equal(response.geojson.features.length,2);
  assert.equal(response.provenance.sourceObjectIdCount,3);
  assert.equal(response.rejectedFeatures[0].objectId,2);
  assert.equal(response.rejectedFeatures[0].reason,'empty-or-one-vertex-part');
  assert.equal(response.rejectedFeatures[0].part,0);
  assert.equal(response.provenance.comparisonCoverage,'partial_with_explicit_exclusions');
});
test('too many quarantined features stop the comparison instead of implying complete results',async()=>{
  const invalid=n=>{const f=feature(n);f.geometry.coordinates[0]=[0,0];return f;};
  await assert.rejects(()=>fetchPublicRailRouteReference({fetchImpl:source([
    metadata,{objectIds:[1,2,3,4]},
    {type:'FeatureCollection',features:[invalid(1),invalid(2),invalid(3),feature(4)]}
  ]).fetchImpl}),/Too many invalid ArcGIS reference features/);
});
