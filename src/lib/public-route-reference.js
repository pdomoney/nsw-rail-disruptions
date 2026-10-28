// Read-only operator evidence acquisition from NSW Government's publicly exposed ArcGIS view.
// This is a candidate corroboration source, not a certified independent survey of the railway.
export const PUBLIC_ROUTES_LAYER =
  'https://portal.data.nsw.gov.au/arcgis/rest/services/Hosted/TfNSW_GTFS_Routes_Public/FeatureServer/0';

const neededFields = ['objectid','route_short_name','route_id','shape_id','portal_last_updated','route_long_name'];
const isObject = v => v != null && typeof v === 'object' && !Array.isArray(v);
const finite = v => typeof v === 'number' && Number.isFinite(v);
// TfNSW's public hosted rail route view extends west of the NSW border:
// the 2026-10-28 layer metadata advertises about 138.56 E to 153.62 E.
// Validate a conservative eastern-Australian geographic envelope instead of
// mistaking legitimate regional/interstate routes for projected coordinates.
// Bounding-box validation is still NOT a route accuracy certification.
const inAustralianRailBounds = point => Array.isArray(point) && point.length >= 2 &&
  finite(point[0]) && finite(point[1]) &&
  point[0] >= 133 && point[0] <= 155 && point[1] >= -44 && point[1] <= -9;
function validGeometry(geometry) {
  const chains = geometry?.type === 'LineString' ? [geometry.coordinates]
    : geometry?.type === 'MultiLineString' ? geometry.coordinates : null;
  return Array.isArray(chains) && chains.length > 0 && chains.every(chain =>
    Array.isArray(chain) && chain.length >= 2 &&
    chain.every(inAustralianRailBounds));
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
  // FeatureServer can vary OID property casing in GeoJSON output. Always
  // require an ID that matches the requested batch: do not infer one by order.
  const objectId = feature => {
    const p = feature?.properties;
    const named = isObject(p) ? Object.entries(p).find(([name]) =>
      name.toLowerCase() === String(metadata.objectIdField || 'objectid').toLowerCase()) : null;
    const raw = named ? named[1] : feature?.id;
    return raw == null || raw === '' ? null : Number(raw);
  };
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
      const oid=objectId(feature);
      // Detailed non-sensitive diagnostics: the object ID and failure reason
      // let operators review a specific public-source feature without dumping
      // potentially large route coordinates into GitHub Actions logs.
      if(!Number.isSafeInteger(oid) || !expected.has(oid))
        throw new Error('Unrecognised public route feature ID: '+
          String(oid)+' (batch '+batch[0]+'–'+batch.at(-1)+')');
      if(seen.has(oid))
        throw new Error('Duplicated public route feature ID: '+oid);
      if(feature?.type!=='Feature' || !isObject(properties))
        throw new Error('Unexpected ArcGIS GeoJSON feature structure for object ID '+oid);
      if(!validGeometry(feature.geometry))
        throw new Error('Invalid projected route geometry or out-of-envelope coordinates for public object ID '+
          oid+' (GeoJSON type '+String(feature.geometry?.type||'none')+')');
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
      layerAdvertisedExtent:metadata.extent || null,
      acquiredAt,
      spatialReference:'EPSG:4326 requested from ArcGIS; validated NSW longitude/latitude',
      featureCount:features.length,
      namedTrainFeatures:matchedNames,
      portalLastUpdatedValues:[...sourceRevisions].sort(),
      note:'Public NSW ArcGIS hosted GTFS Routes view; equivalence and publication version relative to TfNSW portal GeoJSON unverified. This is not an independent engineering track survey.',
    },
  };
}
