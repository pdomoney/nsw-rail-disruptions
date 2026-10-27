// Correlate geometry exceptions with raw TfNSW GTFS stop_time counts.
// A stop-time count is not a daily service frequency, timetable validity or GPS proof.
import { stationKey } from './netmap.js';

export function addStationServiceEvidence(audit, feedFiles) {
  if (audit?.schema !== 'nsw-rail-geometry-audit/v1' || !Array.isArray(audit.stationExceptions))
    throw new Error('Expected existing geometry audit with station exceptions');
  if (!Array.isArray(feedFiles)) throw new Error('Expected station feed data array');
  const stations = new Map(), peaks = new Map(), coverage = [];
  for (const feed of feedFiles) {
    if (!feed || typeof feed !== 'object' || !feed.stations || typeof feed.stations !== 'object')
      throw new Error('Station feed must contain a stations object');
    coverage.push({ source: feed.source || null, builtAt: feed.builtAt || null });
    for (const item of Object.values(feed.stations)) {
      if (!item || !item.n || !item.c || typeof item.c !== 'object') continue;
      const key = stationKey(item.n);
      if (!key) continue;
      let counts = stations.get(key);
      if (!counts) stations.set(key, (counts = new Map()));
      // Several station stops may have the same name (platforms or directions).
      // Use the largest single recorded stop count, not a sum that double-counts them.
      for (const [line,raw] of Object.entries(item.c)) {
        if (!Number.isSafeInteger(raw) || raw < 0) continue;
        counts.set(line, Math.max(counts.get(line) || 0,raw));
        peaks.set(line,Math.max(peaks.get(line) || 0,raw));
      }
    }
  }
  let matched = 0;
  const exceptions = audit.stationExceptions.map(e => {
    const count = stations.get(stationKey(e.station))?.get(e.line);
    const peak = peaks.get(e.line);
    if (count != null) matched++;
    const serviceEvidence = {
      gtfsStopTimeRows: count ?? null,
      highestStationStopTimeRowsOnLine: peak ?? null,
      relativeToHighestStationPercent: count != null && peak > 0 ?
        Math.round(count / peak * 10000) / 100 : null,
    };
    return {...e, serviceEvidence};
  });
  return {
    ...audit,
    stationExceptions: exceptions,
    stationServiceEvidence: {
      status: 'GTFS stop_times row counts only; not day-specific scheduled frequency',
      duplicatePlatformPolicy: 'maximum matching record, not sum',
      feedSources: coverage, matchedExceptionCount: matched,
      exceptionCountWithoutEvidence: exceptions.length - matched,
    }
  };
}
