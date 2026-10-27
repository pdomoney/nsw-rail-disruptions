// Geographic map presentation evidence from TfNSW GTFS shapes and stop positions.
// This metadata NEVER changes the underlying line, station, trip or alert data.
import { auditNetworkGeometry } from './geometry-audit.js';

// 1 km is a conservative DISPLAY-ONLY proximity boundary, separate from
// the 150 m audit outlier threshold. It avoids treating a 160 m platform
// / interchange offset as proof that a station is off its route.
export const DISPLAY_ROUTE_PROXIMITY_M = 1000;

export function buildGeographicStationProximity(network, { thresholdM = DISPLAY_ROUTE_PROXIMITY_M } = {}) {
  if (!(Number.isFinite(thresholdM) && thresholdM > 0))
    throw new Error('Invalid geographic display proximity threshold');
  const audit = auditNetworkGeometry(network, {stationToleranceM:thresholdM});
  const flagged = new Map();
  for (const e of audit.stationExceptions) {
    if (e.classification !== 'review-offset') continue;
    if (!flagged.has(e.station)) flagged.set(e.station, new Set());
    flagged.get(e.station).add(e.line);
  }
  return {
    version: 1,
    thresholdM,
    method: 'station centre to nearest same-line TfNSW GTFS route segment, display only',
    distant: Object.fromEntries([...flagged].map(([station, lines]) => [station, [...lines].sort()])),
  };
}
