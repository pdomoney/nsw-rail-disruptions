// Read-only operator evidence acquisition from NSW Government's publicly exposed ArcGIS view.
// This is a candidate corroboration source, not a certified independent survey of the railway.
export const PUBLIC_ROUTES_LAYER =
  'https://portal.data.nsw.gov.au/arcgis/rest/services/Hosted/TfNSW_GTFS_Routes_Public/FeatureServer/0';

const neededFields = ['objectid','route_short_name','route_id','shape_id','portal_last_updated','route_long_name'];
const isObject = v => v != null && typeof v === 'object' && !Array.isArray(v);
const finite = v => typeof v === 'number' && Number.isFinite(v);
// ArcGIS's *actual published layer extent* reaches ~138.56°E, west of NSW.
// Keep a conservative buffered footprint for this NSW-origin multi-state GTFS
// view; reject Web Mercator metre coordinates and world-spanning bad points.
// Layer: portal.data.nsw.gov.au/.../TfNSW_GTFS_Routes_Public/FeatureServer/0
const SOURCE_FOOTPRINT = Object.freeze({
  minLongitude: 137.5, maxLongitude: 155,
  minLatitude: -39, maxLatitude: -26,
});
const inSourceFootprint = ([longitude,latitude]) => finite(longitude) && finite(latitude)
  && longitude >= SOURCE_FOOTPRINT.minLongitude && longitude <= SOURCE_FOOTPRINT.maxLongitude
  && latitude >= SOURCE_FOOTPRINT.minLatitude && latitude <= SOURCE_FOOTPRINT.maxLatitude;
function geometryIssue(geometry) {
  const paths = geometry?.type === 'LineString' ? [geometry.coordinates]
    : geometry?.type === 'MultiLineString' ? geometry.coordinates : null;
  if (!Array.isArray(paths) || !paths.length)
    return {reason:'unsupported-or-empty-geometry',part:null,vertex:null};
  for(let part=0;part<paths.length;part++) {
    const points=paths[part];
    if (!Array.isArray(points) || points.length<2)
      return {reason:'empty-or-one-vertex-part',part,vertex:null};
    for(let vertex=0;vertex<points.length;vertex++) {
      const point=points[vertex];
      if (!Array.isArray(point) || point.length<2 || !inSourceFootprint(point))
        return {reason:'invalid-or-outside-published-footprint-coordinate',part,vertex};
    }
  }
  return null;
}
function parameters(path, params) {
  const url = new URL(PUBLIC_ROUTES_LAYER + path);
  for (const [key,value] of Object.entries(params)) url.searchParams.set(key,String(value));
  return url.toString();
}
async function getJson(fetchImpl,url) {
  const response = await fetchImpl(url, {
    headers:{'Accept':'application/geo+json, application/json'},
    signal:AbortSignal.timeout(30000),
  });
  if (!response?.ok) throw new Error('NSW ArcGIS request failed with status '+response?.status);
  const data = await response.json();
  if (!isObject(data) || isObject(data.error))
    throw new Error('NSW ArcGIS returned an invalid response or service error');
  return data;
}
export async function fetchPublicRailRouteReference({
  fetchImpl = fetch, batchSize = 125, acquiredAt = new Date().toISOString(),
} = {}) {
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 500)
    throw new Error('Batch size must be 1 to 500');
  const metadata = await getJson(fetchImpl,parameters('',{f:'json'}));
  const actualFields = new Set((metadata.fields||[]).map(field=>field.name?.toLowerCase()));
  if (metadata.name !== 'Routes' || metadata.geometryType !== 'esriGeometryPolyline'
      || !/geojson/i.test(metadata.supportedQueryFormats||'')
      || neededFields.some(field=>!actualFields.has(field)))
    throw new Error('Public layer metadata changed; operator must review the source');
  const idsResponse = await getJson(fetchImpl,parameters('/query',{
    f:'json',where:'1=1',returnIdsOnly:'true',
  }));
  const ids = idsResponse.objectIds;
  if (!Array.isArray(ids) || ids.length===0 || ids.length>25000
      || ids.some(id=>!Number.isSafeInteger(id) || id<0) ||
        new Set(ids).size!==ids.length)
    throw new Error('Unexpected route object ID list; abort incomplete comparison');
  ids.sort((a,b)=>a-b);
  const features=[], rejectedFeatures=[], seen=new Set(), sourceRevisions=new Set();
  for(let start=0;start<ids.length;start+=batchSize) {
    const batch=ids.slice(start,start+batchSize);
    const result=await getJson(fetchImpl,parameters('/query',{
      f:'geojson',where:'1=1',objectIds:batch.join(','),
      outFields:neededFields.join(','),outSR:'4326',returnGeometry:'true',
    }));
    if(result.type!=='FeatureCollection' || !Array.isArray(result.features)
        || result.features.length!==batch.length)
      throw new Error('ArcGIS route query returned a partial or unexpected feature page');
    const expected=new Set(batch);
    for(const feature of result.features) {
      const properties=feature?.properties;
      const key = Object.keys(properties || {}).find(k => k.toLowerCase() === 'objectid');
      const rawId = key ? properties[key] : feature?.id;
      const oid = Number(rawId);
      const fail = reason => {
        // Log only feature index and geometry shape; never source payloads or tokens.
        throw new Error('ArcGIS feature validation: '+reason+
          '; batch offset='+start+'; objectId='+(Number.isSafeInteger(oid)?oid:'missing')+
          '; geometryType='+String(feature?.geometry?.type || 'missing')+
          '; coordinatePairs='+(
            feature?.geometry?.type==='LineString' ? feature.geometry.coordinates?.length :
            feature?.geometry?.type==='MultiLineString' ? feature.geometry.coordinates?.length : 'unknown'));
      };
      if(!isObject(properties) || feature?.type!=='Feature') fail('invalid feature structure');
      if(!Number.isSafeInteger(oid) || !expected.has(oid)) fail('unexpected object ID');
      if(seen.has(oid)) fail('duplicate object ID');
      // An invalid geometry is not imported, normalised, or silently accepted.
      // Keep a source-ID/reason exception record and continue only when the
      // excluded share remains explicitly below a conservative safety ceiling.
      seen.add(oid);
      const issue=geometryIssue(feature.geometry);
      if (issue) {
        rejectedFeatures.push({
          objectId:oid,
          route: String(properties.route_short_name || ''),
          shapeId: String(properties.shape_id || ''),
          geometryType: String(feature.geometry?.type || 'missing'),
          ...issue,
        });
      } else {
        features.push(feature);
      }
      if(properties.portal_last_updated != null)
        sourceRevisions.add(String(properties.portal_last_updated));
    }
  }
  if(seen.size!==ids.length) throw new Error('Missing route features from public ArcGIS snapshot');
  const maxQuarantine=Math.max(2,Math.min(100,Math.ceil(ids.length*0.01)));
  if(rejectedFeatures.length>maxQuarantine)
    throw new Error('Too many invalid ArcGIS reference features: '+rejectedFeatures.length+
      '/'+ids.length+' (limit '+maxQuarantine+'); first objectId='+
      rejectedFeatures[0].objectId+' reason='+rejectedFeatures[0].reason);
  const matchedNames=features.filter(feature=>/^(T[1-9]|BMT|CCN|HUN|SCO|SHL)$/
    .test(String(feature.properties.route_short_name||'').trim())).length;
  if(!matchedNames) throw new Error('No recognisable train route names; do not assume source parity');
  return {
    geojson:{type:'FeatureCollection',features},
    rejectedFeatures,
    provenance:{
      status:'candidate_public_arcgis_crosscheck_not_verified_portal_download',
      layerUrl:PUBLIC_ROUTES_LAYER,
      layerServiceItemId:metadata.serviceItemId||null,
      layerName:metadata.name,
      acquiredAt,
      spatialReference:'EPSG:4326 requested; buffered extent of public NSW-origin multi-state route layer',
      sourceObjectIdCount:ids.length,
      featureCount:features.length,
      excludedGeometryCount:rejectedFeatures.length,
      excludedGeometryLimit:maxQuarantine,
      comparisonCoverage:rejectedFeatures.length ? 'partial_with_explicit_exclusions' : 'complete_validated',
      footprint:SOURCE_FOOTPRINT,
      namedTrainFeatures:matchedNames,
      portalLastUpdatedValues:[...sourceRevisions].sort(),
      note:'Public NSW ArcGIS hosted GTFS Routes view; equivalence and publication version relative to TfNSW portal GeoJSON unverified. This is not an independent engineering track survey.',
    },
  };
}
