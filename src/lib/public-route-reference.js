// Read-only operator evidence acquisition from NSW Government's publicly exposed ArcGIS view.
// This is a candidate corroboration source, not a certified independent survey of the railway.
export const PUBLIC_ROUTES_LAYER =
  'https://portal.data.nsw.gov.au/arcgis/rest/services/Hosted/TfNSW_GTFS_Routes_Public/FeatureServer/0';

const neededFields = ['objectid','route_short_name','route_id','shape_id','portal_last_updated','route_long_name'];
const isObject = v => v != null && typeof v === 'object' && !Array.isArray(v);
const finite = v => typeof v === 'number' && Number.isFinite(v);
const inNSW = ([longitude,latitude]) => finite(longitude) && finite(latitude)
  && longitude >= 140 && longitude <= 155 && latitude >= -39 && latitude <= -27;
function validGeometry(geometry) {
  const chains = geometry?.type === 'LineString' ? [geometry.coordinates]
    : geometry?.type === 'MultiLineString' ? geometry.coordinates : null;
  return Array.isArray(chains) && chains.length > 0 && chains.every(chain =>
    Array.isArray(chain) && chain.length >= 2 &&
    chain.every(point => Array.isArray(point) && point.length >= 2 && inNSW(point)));
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
  const features=[], seen=new Set(), sourceRevisions=new Set();
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
      if(!validGeometry(feature.geometry)) fail('invalid NSW WGS84 polyline geometry');
      seen.add(oid);
      if(properties.portal_last_updated != null)
        sourceRevisions.add(String(properties.portal_last_updated));
      features.push(feature);
    }
  }
  if(seen.size!==ids.length) throw new Error('Missing route features from public ArcGIS snapshot');
  const matchedNames=features.filter(feature=>/^(T[1-9]|BMT|CCN|HUN|SCO|SHL)$/
    .test(String(feature.properties.route_short_name||'').trim())).length;
  if(!matchedNames) throw new Error('No recognisable train route names; do not assume source parity');
  return {
    geojson:{type:'FeatureCollection',features},
    provenance:{
      status:'candidate_public_arcgis_crosscheck_not_verified_portal_download',
      layerUrl:PUBLIC_ROUTES_LAYER,
      layerServiceItemId:metadata.serviceItemId||null,
      layerName:metadata.name,
      acquiredAt,
      spatialReference:'EPSG:4326 requested from ArcGIS; validated NSW longitude/latitude',
      featureCount:features.length,
      namedTrainFeatures:matchedNames,
      portalLastUpdatedValues:[...sourceRevisions].sort(),
      note:'Public NSW ArcGIS hosted GTFS Routes view; equivalence and publication version relative to TfNSW portal GeoJSON unverified. This is not an independent engineering track survey.',
    },
  };
}
