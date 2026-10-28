// Additional source evidence: never replace the frozen service-day timetable.
import { scheduledTrips } from './gtfs-static.js';
import { stationKey } from './netmap.js';
import { METRO_OPENING_UTC_MS } from './metro-opening-refresh.js';
const WINDOW_MS=48*3600000;
const OPENING_SECOND=4*3600+31*60;
const bankstown=s=>/\bbankstown\b/i.test(String(s||''));
export function metroOpeningScheduleSnapshot(map,nowMs=Date.now()) {
  if(!Number.isFinite(nowMs) || nowMs<METRO_OPENING_UTC_MS ||
    nowMs>=METRO_OPENING_UTC_MS+WINDOW_MS || !map?.sched?.trips ||
    !map?.sched?.services) return null;
  const built=Date.parse(map.builtAt||'');
  if(!Number.isFinite(built)) return null;
  const bankIds=new Set(Object.entries(map.stations||{})
    .filter(([,st])=>stationKey(st?.n)==='bankstown' &&
      (st?.l||[]).includes('M1')).map(([id])=>String(id)));
  const all=scheduledTrips(map,'20261030').filter(row=>row[1]==='M1');
  const eligible=all.filter(row=>row[4]!=null && row[4]>=OPENING_SECOND);
  const heads=eligible.filter(row=>bankstown(row[8]));
  const origins=eligible.filter(row=>bankIds.has(String(row[9]||'')));
  const candidates=new Set([...heads,...origins].map(row=>row[0]));
  return {
    schema:'nsw-rail-metro-opening-static-snapshot/v1',
    openingServiceDay:'2026-10-30',
    capturedAt:new Date(nowMs).toISOString(),
    timetableBuiltAt:map.builtAt,
    feedPath:map.source||null,
    fetchedAfterOpening:built>=METRO_OPENING_UTC_MS,
    calendarQualifiedM1Trips:all.length,
    tripsOverlappingOpeningOrLater:eligible.length,
    bankstownHeadsignTrips:heads.length,
    bankstownOriginTrips:origins.length,
    bankstownCandidateTrips:candidates.size,
    note:'Static source schedule counts only, not the frozen service-day record, realtime observations or proof of passenger operations. Fetch time is not upstream release time.',
  };
}
