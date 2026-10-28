// Read-only evidence for 2026-10-30 M1 Southwest Metro opening.
// Opening-time, GTFS route geometry, timetable records and observed positions
// are separate signals. Never certify physical service operation from these alone.
import { FLAG, TRIP_COLUMNS } from './service.js';
import { SOUTHWEST_OPENING } from './mode-geometry-readiness.js';
import { stationKey } from './netmap.js';
import { sydDate } from './time.js';

export const OPENING_SERVICE_DAY = '2026-10-30';
export const OPENING_SECOND = 4 * 3600 + 31 * 60;
const SOURCE_MAX_AGE_MS = 15 * 60 * 1000;
const column = Object.fromEntries(TRIP_COLUMNS.map((name, index) => [name, index]));
const number = x => typeof x === 'number' && Number.isFinite(x);
const dateMs = value => {
  const timestamp = Date.parse(value || '');
  return Number.isFinite(timestamp) ? timestamp : null;
};
const isBankstown = text => /\bbankstown\b/i.test(String(text || ''));
const afterOpening = (start, end) => number(end) && end >= OPENING_SECOND &&
  (start == null || !number(start) || start <= end);

// This is a rough review area WEST of Sydenham, not an inferred vehicle route or
// a geofence claiming passenger service. Positions come unchanged from TfNSW.
export function positionOnSouthwestSide(lat, lon) {
  return number(lat) && number(lon) &&
    lat >= -33.95 && lat <= -33.89 &&
    lon >= 151.025 && lon < 151.16;
}
export function auditSouthwestServiceEvidence({
  openingDay = null,
  positions = null,
  metroStations = null,
  refreshedSchedule = null,
  at = new Date().toISOString(),
} = {}) {
  const asOf = dateMs(at);
  if (asOf == null) throw new Error('Opening evidence needs a valid ISO audit timestamp');
  const opening = dateMs(SOUTHWEST_OPENING);
  const dayRecord = openingDay?.date === OPENING_SERVICE_DAY ? openingDay.record : null;
  const feed = dayRecord?.feeds?.metro ?? null;
  const cols = Object.fromEntries((dayRecord?.cols || TRIP_COLUMNS).map((name,i)=>[name,i]));
  const rows = Array.isArray(feed?.trips) ? feed.trips : [];
  const originIds = new Set(Object.entries(metroStations?.stations||{})
    .filter(([,st]) => stationKey(st?.n) === 'bankstown' && (st?.l||[]).includes('M1'))
    .map(([id])=>id));
  const scheduled = rows.filter(row => row[cols.line] === 'M1' &&
    !(row[cols.flags] & FLAG.UNSCHEDULED) &&
    (isBankstown(row[cols.headsign]) || originIds.has(String(row[cols.origin]||''))) &&
    afterOpening(row[cols.start],row[cols.end]));
  const terminalHeads = scheduled.filter(row => isBankstown(row[cols.headsign])).length;
  const originBankstown = scheduled.filter(row => originIds.has(String(row[cols.origin]||''))).length;
  // Separate current static GTFS snapshot can supersede a midnight-frozen
  // timetable without rewriting historical service-day trip observations.
  const latest=refreshedSchedule?.schema==='nsw-rail-metro-opening-static-snapshot/v1' &&
    refreshedSchedule.openingServiceDay===OPENING_SERVICE_DAY &&
    dateMs(refreshedSchedule.capturedAt)!=null &&
    dateMs(refreshedSchedule.timetableBuiltAt)!=null &&
    dateMs(refreshedSchedule.capturedAt)>=opening &&
    dateMs(refreshedSchedule.capturedAt)<=asOf &&
    dateMs(refreshedSchedule.timetableBuiltAt)<=asOf?refreshedSchedule:null;
  const rawCandidates=latest?.bankstownCandidateTrips;
  const currentCandidates=Number.isSafeInteger(rawCandidates)&&rawCandidates>=0?rawCandidates:null;
  const observedRunning = scheduled.filter(row => {
    const flags=row[cols.flags]||0;
    return (flags & FLAG.RAN)!==0 && number(row[cols.first_seen]) &&
      row[cols.first_seen]>=OPENING_SECOND && number(row[cols.last_seen]) &&
      row[cols.last_seen]>=row[cols.first_seen];
  }).length;
  const coveredAfter = (feed?.coverage||[]).some(pair=>
    Array.isArray(pair) && number(pair[0]) && number(pair[1]) &&
    pair[1]>=OPENING_SECOND && pair[1]>=pair[0]);
  const snapshotAt = dateMs(positions?.at);
  const metroFeedAt = dateMs(positions?.feeds?.metro);
  const validSnapshot = asOf >= opening && snapshotAt!=null && metroFeedAt!=null &&
    snapshotAt >= opening && metroFeedAt >= opening &&
    sydDate(snapshotAt) === OPENING_SERVICE_DAY &&
    asOf>=snapshotAt && asOf-snapshotAt<=SOURCE_MAX_AGE_MS &&
    snapshotAt>=metroFeedAt && snapshotAt-metroFeedAt<=SOURCE_MAX_AGE_MS;
  const ix = Object.fromEntries((positions?.cols||[]).map((name,i)=>[name,i]));
  const hasPositionFields = ['feed','line','lat','lon'].every(key=>ix[key]!=null);
  const metroLive = validSnapshot && hasPositionFields ?
    (positions.trains||[]).filter(row=>row[ix.feed]==='metro' && row[ix.line]==='M1') : [];
  const southwesternPositions=metroLive.filter(row=>
    positionOnSouthwestSide(row[ix.lat],row[ix.lon]));
  let status='before-announced-opening';
  if(asOf>=opening) {
    if(!dayRecord||!feed)status='awaiting-opening-day-service-record';
    else if(!scheduled.length && currentCandidates>0)
      status='refreshed-static-candidates-not-in-frozen-service-day';
    else if(!scheduled.length)status='no-bankstown-terminal-trips-in-frozen-schedule';
    else if(observedRunning && southwesternPositions.length && coveredAfter)
      status='multiple-feed-operational-indicators-uncertified';
    else if(observedRunning)status='observed-running-flag-requires-corroboration';
    else status='bankstown-scheduled-trips-no-running-evidence';
  }
  return {
    schema:'nsw-rail-metro-opening-evidence/v1',
    at,opening:SOUTHWEST_OPENING,serviceDay:OPENING_SERVICE_DAY,
    serviceRecordAvailable:!!feed,
    serviceRecordFinalised:!!openingDay?.final,
    serviceCoverageAfterOpening:coveredAfter,
    timetableBuiltAt:feed?.timetable||null,
    postOpeningStaticSnapshotAvailable:!!latest,
    currentStaticTimetableBuiltAt:latest?.timetableBuiltAt||null,
    currentStaticTimetableFetchedAfterOpening:!!latest?.fetchedAfterOpening,
    currentStaticCalendarQualifiedM1Trips:latest?.calendarQualifiedM1Trips??null,
    currentStaticBankstownCandidateTrips:currentCandidates,
    timetableTripCount:rows.filter(row=>row[cols.line]==='M1' &&
      !(row[cols.flags]&FLAG.UNSCHEDULED)).length,
    bankstownCandidateTrips:scheduled.length,
    bankstownHeadsignTrips:terminalHeads,
    bankstownOriginTrips:originBankstown,
    candidateTripsSeenRunningAfterOpening:observedRunning,
    sourceMetroStationIdCount:originIds.size,
    latestVehicleSnapshotAt:positions?.at||null,
    latestMetroVehicleFeedAt:positions?.feeds?.metro||null,
    currentOpeningDayVehicleSnapshot:!!validSnapshot,
    liveMetroPositions:metroLive.length,
    liveMetroPositionsWestOfSydenham:southwesternPositions.length,
    status,
    operationIndependentlyConfirmed:false,
    caveats:[
      'Candidate terminal trips use GTFS headsign or originating station ID; trip stop sequences are not preserved in the daily service recorder.',
      'RAN is an aggregate realtime-trip observation flag. It does not independently certify passage over Southwest track or every station served.',
      'A position west of Sydenham is an unchanged feed-reported observation within a review envelope, not proof of passenger service, a measured GPS position, or a route correction.',
      'A frozen opening-day timetable may predate the last TfNSW revision. Zero Bankstown candidates is a data-evidence gap, not proof that Metro is closed.',
      'A newer Metro static source can contain Bankstown trips absent from the frozen calendar, but these are not matched to realtime running observations and never certify passenger service.',
    ],
  };
}
const csvValue = value => {
  let str=String(value ?? '');
  if(/^[=+\-@\t\r]/.test(str))str="'"+str;
  return '"'+str.replace(/"/g,'""')+'"';
};
export function formatSouthwestServiceEvidence(result,{dataCommit=null}={}) {
  if(result?.schema!=='nsw-rail-metro-opening-evidence/v1')
    throw new Error('Unsupported Metro opening evidence report');
  const fields=[
    ['Data branch revision',dataCommit],['Audit timestamp',result.at],
    ['Announced opening',result.opening],['Opening date',result.serviceDay],
    ['Evidence status',result.status],['Opening-day service record available',result.serviceRecordAvailable],
    ['Service record finalised',result.serviceRecordFinalised],
    ['Frozen Metro GTFS timetable timestamp',result.timetableBuiltAt],
    ['Separate Metro static source snapshot available',result.postOpeningStaticSnapshotAvailable],
    ['Current static timetable fetched timestamp',result.currentStaticTimetableBuiltAt],
    ['Current static timetable fetched after opening',result.currentStaticTimetableFetchedAfterOpening],
    ['Current static calendar-qualified M1 trips',result.currentStaticCalendarQualifiedM1Trips],
    ['Current static Bankstown candidate trips',result.currentStaticBankstownCandidateTrips],
    ['All scheduled M1 trips',result.timetableTripCount],
    ['Bankstown-terminal candidate scheduled trips',result.bankstownCandidateTrips],
    ['Bankstown headsign scheduled trips',result.bankstownHeadsignTrips],
    ['Bankstown originating station scheduled trips',result.bankstownOriginTrips],
    ['Candidate trips first seen running after opening',result.candidateTripsSeenRunningAfterOpening],
    ['Coverage interval after opening',result.serviceCoverageAfterOpening],
    ['Opening-day realtime position snapshot current',result.currentOpeningDayVehicleSnapshot],
    ['Live M1 feed positions in valid snapshot',result.liveMetroPositions],
    ['Live M1 positions west of Sydenham',result.liveMetroPositionsWestOfSydenham],
    ['Operation independently confirmed',result.operationIndependentlyConfirmed]
  ];
  const markdown=[
    '# M1 Southwest Metro opening: actual service evidence (read only)',
    '',
    '**Status: '+String(result.status)+'**',
    '**Data branch revision:** '+(dataCommit||'unavailable'),
    '**Officially announced opening:** 30 October 2026, 4:31am AEDT',
    '',
    '| Evidence | Observed value |',
    '|---|---|',
    ...fields.slice(5).map(([k,v])=>'| '+k+' | '+(v==null?'unavailable':String(v))+' |'),
    '',
    '**Interpretation:** Presence of M1 tracks and 11 stations in static GTFS is separate from evidence of timetable service or realtime observed movement. This automated report **never independently confirms passenger service**.',
    '',
    '## Caveats',
    ...result.caveats.map(x=>'- '+x),
    ''
  ].join('\n');
  const csv=[['Evidence','Value'],...fields].map(row=>row.map(csvValue).join(',')).join('\n')+'\n';
  return {markdown,csv};
}
