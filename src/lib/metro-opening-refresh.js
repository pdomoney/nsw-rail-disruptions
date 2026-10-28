// Time-bounded refresh of the Metro GTFS static timetable at the announced
// Southwest opening. This changes only when TfNSW's *actual schedule feed*
// is requested; it never creates route geometry or claims service operations.
export const METRO_OPENING_UTC_MS=Date.parse('2026-10-30T04:31:00+11:00');
const WINDOW_MS=48*60*60*1000;
const RETRY_MS=6*60*60*1000;
const timestamp=text=>{
  const n=Date.parse(text||'');
  return Number.isFinite(n)?n:null;
};
export function shouldRefreshMetroOpeningMap({
  feedKey,nowMs,builtAt,lastAttemptAt,
}={}) {
  if(feedKey!=='metro' || !Number.isFinite(nowMs))return false;
  if(nowMs<METRO_OPENING_UTC_MS || nowMs>=METRO_OPENING_UTC_MS+WINDOW_MS)return false;
  const built=timestamp(builtAt);
  if(built!=null && built>=METRO_OPENING_UTC_MS)return false;
  const attempted=timestamp(lastAttemptAt);
  if(attempted!=null && attempted<=nowMs && nowMs-attempted<RETRY_MS)return false;
  return true;
}
