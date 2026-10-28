// Read-only per-mode route source audit for the Sydney Metro Southwest opening.
// Neither proximity nor post-opening GTFS presence alone proves passenger service.
import { project, projectChains, stationKey } from './netmap.js';

export const SOUTHWEST_OPENING = '2026-10-30T04:31:00+11:00';
export const SOUTHWEST_STATIONS = Object.freeze([
  'Sydenham','Marrickville','Dulwich Hill','Hurlstone Park','Canterbury',
  'Campsie','Belmore','Lakemba','Wiley Park','Punchbowl','Bankstown',
]);
export const MODE_SOURCE_RULES = Object.freeze({
  M1:{feed:'metro',mode:'metro'},
  T6:{feed:'sydneytrains',mode:'train'},
  L4:{feed:'lr-parramatta',mode:'lightrail'},
  T1:{feed:'sydneytrains',mode:'train'},
  SCO:{feed:'sydneytrains',mode:'intercity'},
  SHL:{feed:'sydneytrains',mode:'intercity'},
});
const numeric = x => typeof x === 'number' && Number.isFinite(x);
const rounded = x => numeric(x) ? Math.round(x * 10) / 10 : null;
const ageHours=(builtAt, at)=>{
  const time=Date.parse(builtAt||''),now=Date.parse(at);
  return Number.isFinite(time) && Number.isFinite(now) ? rounded((now-time)/3600000) : null;
};
function segmentsFor(encoded, grid) {
  const out=[];
  for(const chain of projectChains(encoded,grid)) {
    for(let i=1;i<chain.length;i++) {
      const [ax,ay]=chain[i-1],[bx,by]=chain[i];
      if([ax,ay,bx,by].every(numeric) && (ax!==bx||ay!==by))
        out.push([ax,ay,bx,by]);
    }
  }
  return out;
}
function metresToSegments(lat,lon,segments) {
  if(!numeric(lat)||!numeric(lon)||!segments.length)return null;
  const [x,y]=project(lat,lon);
  let best=Infinity;
  for(const [ax,ay,bx,by] of segments) {
    const dx=bx-ax,dy=by-ay;
    const t=Math.max(0,Math.min(1,((x-ax)*dx+(y-ay)*dy)/(dx*dx+dy*dy)));
    best=Math.min(best,Math.hypot(x-(ax+t*dx),y-(ay+t*dy)));
  }
  return rounded(best*10);
}
export function auditModeGeometry({networks,stations,at=new Date().toISOString()}={}) {
  if(!networks||!stations||!Number.isFinite(Date.parse(at)))throw new Error('Mode audit needs feed inputs and a valid ISO time');
  const lines={};
  for(const [line,rule] of Object.entries(MODE_SOURCE_RULES)) {
    const net=networks[rule.feed]||{},feed=stations[rule.feed]||{};
    const shapes=net.lines?.[line]||[];
    const segments=segmentsFor(shapes,net.grid||1e4);
    const matches=Object.values(feed.stations||{}).filter(st=>
      (st.l||[]).includes(line)&&numeric(st.la)&&numeric(st.lo));
    const stationDistances=matches.map(st=>({
      name:st.n,
      distanceM:metresToSegments(st.la,st.lo,segments),
    }));
    const known=stationDistances.map(s=>s.distanceM).filter(numeric);
    const sourceAgeHours=ageHours(net.builtAt,at),stationAgeHours=ageHours(feed.builtAt,at);
    const coordinateFreshness=sourceAgeHours==null||stationAgeHours==null?'unverified':
      sourceAgeHours<0||stationAgeHours<0?'future-dated':
      sourceAgeHours>72||stationAgeHours>72?'older-than-72-hours':'within-72-hours';
    lines[line]={
      mode:rule.mode,feed:rule.feed,geometrySource:net.source||null,
      stationSource:feed.source||null,networkBuiltAt:net.builtAt||null,
      stationBuiltAt:feed.builtAt||null,sourceAgeHours,stationAgeHours,
      coordinateFreshness,shapeChainCount:shapes.length,
      segmentCount:segments.length,stationCount:matches.length,
      within150m:known.filter(x=>x<=150).length,
      review150mTo1km:known.filter(x=>x>150&&x<=1000).length,
      outside1km:known.filter(x=>x>1000).length,
      missingGeometry:matches.length-known.length,
      stationDistances,
    };
  }
  const metroFeed=stations.metro||{}, metroNet=networks.metro||{};
  const corridorSegments=segmentsFor(metroNet.lines?.M1||[],metroNet.grid||1e4);
  const metroStops=Object.values(metroFeed.stations||{});
  const corridor=SOUTHWEST_STATIONS.map(name=>{
    const matches=metroStops.filter(stop=>stationKey(stop.n)===stationKey(name) &&
      (stop.l||[]).includes('M1') && numeric(stop.la)&&numeric(stop.lo));
    const distances=matches.map(stop=>metresToSegments(stop.la,stop.lo,corridorSegments)).filter(numeric);
    return {
      station:name,
      presentInMetroFeed:matches.length>0,
      minRouteOffsetM:distances.length?Math.min(...distances):null,
      within1km:distances.some(x=>x<=1000),
    };
  });
  const passed=Date.parse(at)>=Date.parse(SOUTHWEST_OPENING);
  const afterOpeningGeometry=Number.isFinite(Date.parse(metroNet.builtAt)) &&
    Date.parse(metroNet.builtAt)>=Date.parse(SOUTHWEST_OPENING);
  const allStopsLocated=corridor.every(x=>x.within1km);
  return {
    schema:'nsw-rail-mode-geometry-readiness/v1',
    at, opening:SOUTHWEST_OPENING,
    note:'Map source proximity and GTFS feed timestamps do not establish active passenger trips, service calendars or route continuity',
    lines,
    southwest:{
      phase:passed?'after-announced-opening-time-unverified':'pre-announced-opening',
      feedBuiltAfterOpening:afterOpeningGeometry,
      stationsExpected:corridor.length,stationsOnMappedLineWithin1km:corridor.filter(x=>x.within1km).length,
      allStopsLocated,
      status:!allStopsLocated?'geometry-or-stop-evidence-incomplete':
        !passed?'pre-opening-static-feed-present':
        !afterOpeningGeometry?'opening-time-passed-feed-not-refreshed':
        'post-opening-static-geometry-present-service-unverified',
      corridor,
    },
  };
}
export function formatModeGeometryReadiness(report,{dataCommit=null}={}) {
  if(report?.schema!=='nsw-rail-mode-geometry-readiness/v1'||!report.lines||!report.southwest)
    throw new Error('Invalid mode readiness report');
  const csv=v=>'"'+String(v??'').replace(/"/g,'""')+'"';
  const safe=v=>String(v??'not reported').replace(/[\r\n|]/g,' ');
  const escapeCsv=v=>csv(/^[=+\-@\t\r]/.test(String(v??''))?"'"+v:v);
  const ids=Object.keys(MODE_SOURCE_RULES);
  const lineRows=[['Line','Mode','GTFS feed','Published network timestamp','Source freshness','Segments','Stations','Within 150m','150m to 1km','Over 1km','No route geometry'],
    ...ids.map(id=>{const s=report.lines[id]||{};return [id,s.mode,s.feed,s.networkBuiltAt,
      s.coordinateFreshness,s.segmentCount,s.stationCount,s.within150m,
      s.review150mTo1km,s.outside1km,s.missingGeometry];})];
  const corridorRows=[['Station','Present in Metro feed','Nearest M1 route metres','Within 1km'],
    ...report.southwest.corridor.map(v=>[v.station,v.presentInMetroFeed,v.minRouteOffsetM,v.within1km])];
  const makeCsv=rows=>rows.map(row=>row.map(escapeCsv).join(',')).join('\n')+'\n';
  const markdown=[
    '# Sydney rail mode-specific route geometry evidence',
    '',
    '**Data revision:** '+safe(dataCommit),
    '**Audit time:** '+safe(report.at),
    '**Announced M1 Southwest opening:** Friday 30 October 2026, 4:31am AEDT',
    '**Opening evidence status:** '+safe(report.southwest.status),
    '**Post-opening Metro GTFS snapshot obtained:** '+(report.southwest.feedBuiltAfterOpening?'yes':'no'),
    '',
    'This is a **static geometry/stop proximity audit**, not evidence that any particular passenger service is operating. Never infer an opening from a map path alone.',
    '',
    '| Line | Source feed | Built | Freshness | Route segments | Stops | ≤150m | 150m–1km | >1km |',
    '|---|---|---|---|---:|---:|---:|---:|---:|',
    ...ids.map(id=>{const x=report.lines[id];return '| '+id+' | '+safe(x.feed)+
      ' | '+safe(x.networkBuiltAt)+' | '+safe(x.coordinateFreshness)+' | '+safe(x.segmentCount)+
      ' | '+safe(x.stationCount)+' | '+safe(x.within150m)+' | '+safe(x.review150mTo1km)+
      ' | '+safe(x.outside1km)+' |';}),
    '',
    '## Southwest Metro: 11 official stops, Sydenham through Bankstown',
    '',
    'Stops with valid geographic coordinates within 1 km of recorded M1 GTFS paths: **'+
      report.southwest.stationsOnMappedLineWithin1km+' / '+report.southwest.stationsExpected+'**',
    '',
    '| Station | Metro GTFS source | Same-line route offset (m) | Within 1km |',
    '|---|---|---:|---|',
    ...report.southwest.corridor.map(s=>'| '+safe(s.station)+' | '+
      (s.presentInMetroFeed?'present':'NOT PRESENT')+' | '+safe(s.minRouteOffsetM)+
      ' | '+(s.within1km?'yes':'NO')+' |'),
    '',
    '## Evidence limitations and next investigation',
    '',
    '- Post-opening geometry presence must **not** be labelled a verified passenger trip. Calendar-specific scheduled services, actual realtime M1 trips and opening-day data need separate verification.',
    '- Station-route distances can reflect platform placement and feed simplification. Do not snap a 161 m Bankstown platform offset without trusted station/platform evidence.',
    '- The historical February 2024 ArcGIS sample found T1, SCO and SHL shape mismatches. These must be localised and compared with newer feeds before modifying 2026 route geometry.',
    '- T6, M1 and L4 are sourced from separate active GTFS feeds even if they are absent from the older ArcGIS hosted layer.',
    '',
  ].join('\n');
  return {markdown,lineCsv:makeCsv(lineRows),corridorCsv:makeCsv(corridorRows)};
}
