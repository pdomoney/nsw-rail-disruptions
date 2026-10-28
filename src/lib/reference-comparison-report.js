// Human-review evidence only. Public GeoJSON may share TfNSW feed provenance.
const safe = value => String(value ?? 'not reported').replace(/[\r\n|]/g,' ');
const csvValue = value => {
  let v=value==null?'':String(value);
  if(/^[=+\-@\t\r]/.test(v)) v="'"+v;
  return '"'+v.replace(/"/g,'""')+'"';
};
export function formatReferenceComparison(report) {
  if(report?.schema !== 'nsw-rail-geometry-audit/v1' || !report.reference || !report.input?.source)
    throw new Error('Expected audited reference geometry and recorded source');
  const ref=report.reference, src=report.input.source;
  const lines=Object.entries(ref.comparedByLine || {}).sort(([a],[b])=>a.localeCompare(b,'en',{numeric:true}));
  const matched=lines.reduce((n,[,v])=>n+(v.nearRouteSamples||0),0);
  const samples=lines.reduce((n,[,v])=>n+(v.samples||0),0);
  const exceptions=Array.isArray(ref.featureExceptions)?ref.featureExceptions:[];
  const rows=[['Line','Reference features','Sampled points','Points within 100m of installed GTFS','Reference to installed coverage percent'],
    ...lines.map(([name,v])=>[name,v.features,v.samples,v.nearRouteSamples,v.sampleCoveragePercent])];
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
    '**Built GTFS network:** '+safe(report.input.networkGeneratedAt),
    '',
    '## Reference geometry near installed GTFS shapes',
    '',
    '- Reference route features: **'+safe(ref.totalFeatures)+'**',
    '- Features with unrecognised line in installed network: **'+safe(ref.unknownLineFeatures)+'**',
    '- Features with invalid geometry: **'+safe(ref.invalidGeometryFeatures)+'**',
    '- Samples compared for matching lines: **'+safe(samples)+'**',
    '- Matched samples within 100 metres: **'+safe(matched)+'**',
    '',
    '| Line | Features | Samples | Near site paths | % near |',
    '|---|---:|---:|---:|---:|',
    ...lines.map(([name,v])=>'| '+safe(name)+' | '+safe(v.features)+' | '+safe(v.samples)+' | '+safe(v.nearRouteSamples)+' | '+safe(v.sampleCoveragePercent)+'% |'),
    '',
    '## Route shape sample exceptions (first 25)',
    '',
    '| Line | Shape ID | Near / sampled |',
    '|---|---|---:|',
    ...exceptions.slice(0,25).map(e=>'| '+safe(e.line)+' | '+safe(e.shapeId)+' | '+safe(e.matchedSamples)+' / '+safe(e.sampledPoints)+' |'),
    '',
    '**Source exclusions:** See reference-rejections.json. Invalid source features are excluded from the sampled comparison and are not silently corrected. If any exclusions exist, coverage is partial. This is a one-directional source-to-site comparison, not proof of route completeness or track surveying accuracy. Both sources may be built from similar TfNSW GTFS data. Routes may differ because of timetable validity, special patterns, route variants, geometry simplification and update dates. Metro and light rail require separately verified reference sources. No station, route or train is repositioned by this workflow.',
    ''
  ].join('\n');
  return {markdown,csv,summary:{referenceFeatures:ref.totalFeatures,matchedLines:lines.length,matchedSamples:matched,sampledPoints:samples}};
}
