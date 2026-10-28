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
  await assert.rejects(()=>fetchPublicRailRouteReference({
    fetchImpl:source([metadata,{objectIds:[1]},{type:'FeatureCollection',features:[bad]}]).fetchImpl,
  }),/invalid NSW WGS84/);
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
    /invalid NSW WGS84 polyline geometry; batch offset=0; objectId=42; geometryType=LineString; coordinatePairs=2/
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
