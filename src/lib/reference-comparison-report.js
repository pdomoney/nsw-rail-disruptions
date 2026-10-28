// Human-review evidence only. Public GeoJSON may share TfNSW feed provenance.
const safe = value => String(value ?? 'not reported').replace(/[\r\n|]/g,' ');
const csvValue = value => {
  let v=value==null?'':String(value);
  if(/^[=+\-@\t\r]/.test(v)) v="'"+v;
  return '"'+v.replace(/"/g,'""')+'"';
};
// Interpret hosted-layer update fields as dated metadata, never as a guaranteed
// geometry release date. A stale year is a reason to inspect, not a failure.
export function sourceUpdateMetadata(values, builtAt) {
  const dates = (Array.isArray(values) ? values : []).filter(value =>
    typeof value === 'string' && /^\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2})?/.test(value))
    .map(value => ({label:value,date:new Date(value.slice(0,10)+'T00:00:00Z')}))
    .filter(x => Number.isFinite(x.date.getTime()));
  if(!dates.length)return {latest:'not reported',ageDays:null,status:'unverified'};
  dates.sort((a,b)=>b.date-a.date);
  const later=new Date(builtAt);
  const ageDays=Number.isFinite(later.getTime()) ?
    Math.floor((later.getTime()-dates[0].date.getTime()) / 86400000) : null;
  return {latest:dates[0].label,ageDays,status:ageDays==null?'unknown':
    ageDays>365?'over_one_year_old':ageDays<0?'newer_than_build':'recent_metadata_only'};
}

export function formatReferenceComparison(report) {
  if(report?.schema !== 'nsw-rail-geometry-audit/v1' || !report.reference || !report.input?.source)
    throw new Error('Expected audited reference geometry and recorded source');
  const ref=report.reference, src=report.input.source;
  const lines=Object.entries(ref.comparedByLine || {}).sort(([a],[b])=>a.localeCompare(b,'en',{numeric:true}));
  const matched=lines.reduce((n,[,v])=>n+(v.nearRouteSamples||0),0);
  const samples=lines.reduce((n,[,v])=>n+(v.samples||0),0);
  const exceptions=Array.isArray(ref.featureExceptions)?ref.featureExceptions:[];
  const installed=Object.keys(report.byLine||{}).sort((a,b)=>a.localeCompare(b,'en',{numeric:true}));
  const hasReference=new Set(lines.map(([name])=>name));
  const missing=installed.filter(line=>!hasReference.has(line));
  const stamp=sourceUpdateMetadata(src.portalLastUpdatedValues,report.input.networkGeneratedAt);
  const hasExplicitInstalledInventory=installed.length>0;
  // Include every installed line so zero-source lines do not disappear from CSV.
  const csvLines=hasExplicitInstalledInventory ? installed : lines.map(([name])=>name);
  const rows=[['Line','Reference status','Reference features','Sampled points','Points within 100m of installed GTFS','Reference to installed coverage percent'],
    ...csvLines.map(name => {
      const value=ref.comparedByLine?.[name];
      return [name,value?'matched_reference':'no_matching_reference',value?.features??0,
        value?.samples??0,value?.nearRouteSamples??0,value?.sampleCoveragePercent??null];
    })];
  const csv=rows.map(row=>row.map(csvValue).join(',')).join('\n')+'\n';
  const markdown=[
    '# Candidate NSW ArcGIS geometry cross-check',
    '',
    '**Status:** read-only candidate source; NOT verified equivalent to the TfNSW portal GeoJSON.',
    '**ArcGIS source:** '+safe(src.url),
    '**Acquisition date:** '+safe(src.downloadedOn),
    '**Reference file SHA-256:** '+safe(src.sha256),
    '**Complete ArcGIS object IDs retrieved:** '+safe(src.sourceObjectIdCount),
    '**Excluded geometry features:** '+safe(src.excludedGeometryCount),
    '**Reference comparison coverage:** '+safe(src.comparisonCoverage),
    '**Hosted source latest update field:** '+safe(stamp.latest),
    '**Hosted source metadata age (days):** '+safe(stamp.ageDays),
    '**Hosted source metadata status:** '+safe(stamp.status),
    '**Built GTFS network:** '+safe(report.input.networkGeneratedAt),
    '',
    '## Reference geometry near installed GTFS shapes',
    '',
    '- Total public ArcGIS features (all transport routes): **'+safe(ref.totalFeatures)+'**',
    '- Source features without a matching installed rail line identifier: **'+safe(ref.unknownLineFeatures)+'**',
    '- Source features that matched installed rail line identifiers: **'+safe(ref.totalFeatures-ref.unknownLineFeatures-ref.invalidGeometryFeatures)+'**',
    '- Invalid geometry features at comparison stage: **'+safe(ref.invalidGeometryFeatures)+'**',
    '- Installed network line identifiers: **'+(hasExplicitInstalledInventory?installed.length:'not reported')+'**',
    '- Installed lines represented in reference sample: **'+lines.length+'**',
    '- Installed lines without a reference match: **'+(hasExplicitInstalledInventory?missing.join(', ')||'none':'not reported')+'**',
    '- Samples compared for matching lines: **'+safe(samples)+'**',
    '- Matched samples within 100 metres: **'+safe(matched)+'**',
    '- Sample proximity among matched features: **'+(samples?((matched/samples)*100).toFixed(1):'not available')+'%** (NOT network-wide accuracy)',
    '',
    ...(stamp.status==='over_one_year_old'
      ? ['**Historical source warning:** The public hosted source update field is more than one year older than the rebuilt network. It cannot validate later network changes, missing modes, or new services.']
      : []),
    '',
    '| Installed line | Source match | Features | Samples | Near site paths | % near |',
    '|---|---|---:|---:|---:|---:|',
    ...csvLines.map(name=>{
      const v=ref.comparedByLine?.[name];
      return '| '+safe(name)+' | '+(v?'matched':'NO REFERENCE')+' | '+safe(v?.features??0)+
        ' | '+safe(v?.samples??0)+' | '+safe(v?.nearRouteSamples??0)+
        ' | '+(v?safe(v.sampleCoveragePercent)+'%':'not available')+' |';
    }),
    '',
    '## Route shape sample exceptions (first 25)',
    '',
    '| Line | Shape ID | Near / sampled |',
    '|---|---|---:|',
    ...exceptions.slice(0,25).map(e=>'| '+safe(e.line)+' | '+safe(e.shapeId)+' | '+safe(e.matchedSamples)+' / '+safe(e.sampledPoints)+' |'),
    '',
    '**Interpretation:** All ArcGIS feature IDs retrieved does NOT mean that all installed rail lines are covered. Source update fields describe hosted dataset metadata and do not prove shape effective dates. Unmatched ArcGIS features may be buses or other transport services; do not count them as rail geometry failures. See reference-rejections.json for invalid geometries. This is a one-directional source-to-site comparison, not proof of route completeness or track surveying accuracy. A high 100 m sample score can be obtained from an old or partial candidate source. Both sources may share TfNSW GTFS provenance. Metro, new Sydney Trains services, intercity and light rail require current per-mode sources and trip/calendar review. No station, route or train is repositioned by this workflow.',
    ''
  ].join('\n');
  return {markdown,csv,summary:{referenceFeatures:ref.totalFeatures,matchedLines:lines.length,matchedSamples:matched,sampledPoints:samples,
    installedLines:hasExplicitInstalledInventory?installed.length:null,
    missingReferenceLines:hasExplicitInstalledInventory?missing:[],
    hostedSourceMetadataStatus:stamp.status}};
}
