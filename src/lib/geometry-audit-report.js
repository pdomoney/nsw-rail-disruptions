// Render Phase 2A's read-only diagnostic as evidence for human review.
const safeCsv = value => {
  if (value == null) return '""';
  const raw = String(value);
  const safe = /^[=+\-@\t\r]/.test(raw) ? "'" + raw : raw;
  return '"' + safe.replace(/"/g, '""') + '"';
};
const csv = rows => rows.map(row => row.map(safeCsv).join(',')).join('\n') + '\n';
const show = value => value == null ? 'not reported' : String(value).replace(/\|/g, '/').replace(/[\r\n]+/g, ' ');
export function formatGeometryAudit(report, { dataCommit = null } = {}) {
  if (report?.schema !== 'nsw-rail-geometry-audit/v1' || !report.byLine || !report.input || !report.summary)
    throw new Error('Unsupported or incomplete geometry audit report');
  if (dataCommit != null && !/^[a-f0-9]{40}$/.test(dataCommit))
    throw new Error('Collected data revision must be a full Git SHA');
  const lines = Object.entries(report.byLine).sort(([a],[b]) => a.localeCompare(b, 'en', {numeric:true}));
  const exceptions = [...(report.stationExceptions || [])].sort((a,b) => {
    if (a.distanceM == null && b.distanceM != null) return -1;
    if (b.distanceM == null && a.distanceM != null) return 1;
    return (b.distanceM || 0) - (a.distanceM || 0) ||
      String(a.line).localeCompare(String(b.line)) || String(a.station).localeCompare(String(b.station));
  });
  const lineRows = [['Line','Segments','Summed segment km (not unique track kilometres)',
    'Station/line pairs','Within tolerance','Review offsets','Missing geometry',
    'p95 offset m','Max offset m','Snapshot vehicle rows','With geographic coordinates','With schematic placement']];
  for (const [line,v] of lines) lineRows.push([line,v.segmentCount,v.routeLengthKm,v.stationLinePairs,
    v.withinTolerance,v.reviewOffsets,v.missingGeometry,v.p95StationOffsetM,v.maxStationOffsetM,
    v.snapshotVehicleRows,v.rowsWithGeographicCoordinates,v.rowsWithTrustedDiagramPlacement]);
  const exceptionRows = [['Line','Station','Reason','Distance metres','GTFS stop-time rows (sample)','Maximum stop-time rows on line','% of line maximum'],
    ...exceptions.map(e => [e.line,e.station,e.classification,e.distanceM,
      e.serviceEvidence?.gtfsStopTimeRows, e.serviceEvidence?.highestStationStopTimeRowsOnLine,
      e.serviceEvidence?.relativeToHighestStationPercent])];
  const markdown = [
    '# NSW Rail: geographic accuracy evidence',
    '',
    '**Collected data revision:** ' + (dataCommit || 'not supplied'),
    '**Network built:** ' + show(report.input.networkGeneratedAt),
    '**Live snapshot:** ' + show(report.input.liveSnapshotAt),
    '**Independent reference geometry:** ' + (report.reference ? 'Supplied; verify acquisition metadata and file checksum.' : 'Not supplied. External route agreement is not verified.'),
    '',
    '## Same-line station alignment',
    '',
    '- Station/line pairs: **' + show(report.summary.stationLinePairs) + '**',
    '- Within ' + show(report.input.stationToleranceM) + ' metres: **' + show(report.summary.withinTolerance) + '**',
    '- Offset review required: **' + show(report.summary.reviewOffsets) + '**',
    '- Missing line geometry: **' + show(report.summary.missingGeometry) + '**',
    '- Live vehicle rows in this snapshot: **' + show(report.summary.liveRows) + '**',
    '',
    '| Line | Within tolerance | Offset review | No geometry | p95 offset (m) | Geo coordinates / schematic matches |',
    '|---|---:|---:|---:|---:|---:|',
    ...lines.map(([line,v]) => '| '+show(line)+' | '+show(v.withinTolerance)+' / '+show(v.stationLinePairs)+
      ' | '+show(v.reviewOffsets)+' | '+show(v.missingGeometry)+' | '+show(v.p95StationOffsetM)+
      ' | '+show(v.rowsWithGeographicCoordinates)+' / '+show(v.rowsWithTrustedDiagramPlacement)+' |'),
    '',
    '## Highest-priority exceptions (first 30)',
    '',
    '**GTFS stop-time support:** ' + (report.stationServiceEvidence ?
      show(report.stationServiceEvidence.matchedExceptionCount)+' of '+show(exceptions.length)+' exceptions matched a source station count. '
      +'These counts measure GTFS stop_time rows, not trips currently running.' :
      'Not provided: no raw GTFS station feed records were used.'),
    '',
    '| Line | Station | Reason | Offset (m) | GTFS stop-time rows | % of line maximum |',
    '|---|---|---|---:|---:|---:|',
    ...exceptions.slice(0,30).map(e=>'| '+show(e.line)+' | '+show(e.station)+' | '+
      show(e.classification)+' | '+show(e.distanceM)+' | '+
      show(e.serviceEvidence?.gtfsStopTimeRows)+' | '+
      show(e.serviceEvidence?.relativeToHighestStationPercent)+' |'),
    '',
    '**Interpretation:** This is diagnostic, **not an accuracy certification**. Offsets may reflect real platform/interchange positions. Summed segments are not unique track kilometres. Vehicle counts are reported coordinate fields in one snapshot, not evidence of GPS precision. The 2024 TfNSW diagram has a separate image coordinate system. GTFS stop_time rows are not proof of routine daily stopping patterns. No station or train is automatically repositioned.',
    '',
    'Download the complete station-exceptions.csv and line-indicators.csv from this workflow run for detailed review.',
    ''
  ].join('\n');
  return { markdown, lineCsv:csv(lineRows), exceptionCsv:csv(exceptionRows) };
}
