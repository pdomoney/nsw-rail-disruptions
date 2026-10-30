// Operator-only cross-check of current TfNSW GTFS static, vehicle and trip feeds
// against the separately vetted October 2026 schematic station corridors.
// Does not amend positions, schedules or any published map.
import {forEachCsvRow} from './csv.js';
import {serviceRuns,gtfsTime} from './gtfs-static.js';
import {stationKey,project} from './netmap.js';
import {sydDate} from './time.js';
import {build2026PdfAlignment,locate2026Train} from '../../site/official-2026-alignment.js';

const MAX_FEED_AGE_SECONDS=900;
const MAX_SHAPE_DISTANCE_M=150;
const MAX_TRIP_WINDOW_EARLY_S=600;
const MAX_TRIP_WINDOW_LATE_S=1800;
const calendarDayDiff=(a,b)=>{
  const toUTC=s=>Date.UTC(+s.slice(0,4),+s.slice(4,6)-1,+s.slice(6,8));
  return (toUTC(b)-toUTC(a))/86400000;
};
const toYmd=s=>String(s||'').replaceAll('-','');
const clock=new Intl.DateTimeFormat('en-GB',{
  timeZone:'Australia/Sydney',hourCycle:'h23',hour:'2-digit',minute:'2-digit',second:'2-digit'
});
const secondsSydney=t=>{
  const parts=Object.fromEntries(clock.formatToParts(new Date(t)).map(p=>[p.type,p.value]));
  return 3600*Number(parts.hour)+60*Number(parts.minute)+Number(parts.second);
};
const goodGeo=(lat,lon)=>Number.isFinite(lat)&&Number.isFinite(lon)&&
  lat>=-39&&lat<=-26&&lon>=137.5&&lon<=155;
const nearPolyline=(loc,points)=>{
  if(!Array.isArray(points)||points.length<2)return null;
  const [px,py]=project(loc.lat,loc.lon);
  let min=Infinity;
  for(let i=1;i<points.length;i++){
    const a=points[i-1],b=points[i];
    const dx=b[0]-a[0],dy=b[1]-a[1],length2=dx*dx+dy*dy;
    if(!length2)continue;
    const t=Math.max(0,Math.min(1,((px-a[0])*dx+(py-a[1])*dy)/length2));
    min=Math.min(min,Math.hypot(px-a[0]-t*dx,py-a[1]-t*dy)*10);
  }
  return Number.isFinite(min)?Math.round(min):null;
};
const validDate=s=>/^\d{8}$/.test(String(s||''))&&!Number.isNaN(Date.parse(
  String(s).slice(0,4)+'-'+String(s).slice(4,6)+'-'+String(s).slice(6,8)+'T00:00:00Z'));
const pairInTrip=(stops,from,to)=>{
  const a=stops.findIndex(s=>stationKey(s.name)===stationKey(from));
  const b=stops.findIndex((s,i)=>i>a&&stationKey(s.name)===stationKey(to));
  if(a<0||b<0)return null;
  return {from:stops[a],to:stops[b],startIndex:a,endIndex:b};
};
const selectedReason=(r)=>{
  if(r.feedAgeSec>MAX_FEED_AGE_SECONDS||r.feedAgeSec<0)return 'stale-realtime-feed';
  if(!r.tripInCurrentGtfs||!r.shapeId||r.shapeDistanceMetres==null)
    return 'current-static-evidence-incomplete';
  if(r.routeConflict||r.cancelledByTripUpdate||r.serviceCalendarRuns===false)
    return 'source-conflict';
  if(r.shapeDistanceMetres>MAX_SHAPE_DISTANCE_M)return 'off-trip-gtfs-shape';
  if(!r.markerVisible)return 'diagram-marker-not-displayed';
  if(r.scheduledPairOnTrip===false)return 'diagram-pair-not-in-trip-stop-sequence';
  if(!r.serviceDay||r.serviceCalendarRuns==null||r.scheduledPairOnTrip==null||
    r.tripTimeWindowPlausible!==true)return 'timetable-not-corroborated';
  return 'coordinate-and-timetable-corroborated';
};

export function auditDiagramTimetableFeed({
  feedKey,staticMap,files,vehicleFeed,tripUpdateFeed,at=new Date().toISOString()
}={}) {
  if(!['metro','sydneytrains'].includes(feedKey))throw Error('Unsupported audit mode');
  if(!staticMap?.sched?.trips||!staticMap?.sched?.services)
    throw Error('Current static GTFS timetable and service calendar required');
  for(const file of ['trips.txt','stop_times.txt','stops.txt','shapes.txt'])
    if(!Buffer.isBuffer(files?.[file]))throw Error('Current GTFS missing '+file);
  if(!Array.isArray(vehicleFeed?.entity))throw Error('No decoded TfNSW vehicle feed');
  if(!Array.isArray(tripUpdateFeed?.entity))throw Error('No decoded TfNSW trip updates');
  const acquired=Date.parse(at),feedTime=Number(vehicleFeed.header?.timestamp)*1000;
  if(!Number.isFinite(acquired)||!Number.isFinite(feedTime)||feedTime<=0)
    throw Error('Capture and feed header timestamps required');
  const age=Math.round((acquired-feedTime)/1000);
  const today=toYmd(sydDate(feedTime));
  const serviceClock=secondsSydney(feedTime);
  const seen=vehicleFeed.entity.filter(e=>e.vehicle?.trip?.tripId&&e.vehicle?.position&&
    goodGeo(e.vehicle.position.lat,e.vehicle.position.lon)).map(e=>({
    id:e.vehicle.trip.tripId,
    routeId:e.vehicle.trip.routeId||null,
    startDate:e.vehicle.trip.startDate||null,
    lat:e.vehicle.position.lat,lon:e.vehicle.position.lon,
    updatedAt:e.vehicle.timestamp||vehicleFeed.header.timestamp
  }));
  const tripIDs=new Set(seen.map(e=>e.id));
  const tripMeta=new Map();
  forEachCsvRow(files['trips.txt'],['route_id','trip_id','shape_id','service_id','trip_headsign'],
    ([routeId,tripId,shapeId,sid,headsign])=>{
      if(tripIDs.has(tripId))tripMeta.set(tripId,{routeId,shapeId,sid,headsign});
    });
  const shapeIds=new Set([...tripMeta.values()].map(v=>v.shapeId).filter(Boolean));
  const stops=new Map();
  forEachCsvRow(files['stops.txt'],['stop_id','stop_name','parent_station','stop_lat','stop_lon'],
    ([id,name,parent,lat,lon])=>stops.set(id,{name,parent,lat:Number(lat),lon:Number(lon)}));
  const timeline=new Map();
  forEachCsvRow(files['stop_times.txt'],['trip_id','stop_id','stop_sequence','arrival_time','departure_time'],
    ([tripId,stopId,sequence,arrival,departure])=>{
      if(!tripIDs.has(tripId))return;
      const stop=stops.get(stopId);
      const parent=stop?.parent&&stops.has(stop.parent)?stops.get(stop.parent):stop;
      const arr=gtfsTime(arrival),dep=gtfsTime(departure);
      const entry={sequence:Number(sequence),name:parent?.name||stop?.name||stopId,
        arrivalSec:arr,departureSec:dep};
      if(!timeline.has(tripId))timeline.set(tripId,[]);
      timeline.get(tripId).push(entry);
    });
  for(const seq of timeline.values())seq.sort((a,b)=>a.sequence-b.sequence);
  const sourceShapes=new Map(),invalidShapes=new Set();
  forEachCsvRow(files['shapes.txt'],['shape_id','shape_pt_lat','shape_pt_lon','shape_pt_sequence'],
    ([id,lat,lon,sequence])=>{
      if(!shapeIds.has(id))return;
      const la=Number(lat),lo=Number(lon),n=Number(sequence);
      if(!goodGeo(la,lo)||!Number.isFinite(n)){invalidShapes.add(id);return;}
      if(!sourceShapes.has(id))sourceShapes.set(id,[]);
      sourceShapes.get(id).push([n,...project(la,lo)]);
    });
  for(const [id,pts] of sourceShapes) {
    if(pts.length<2||invalidShapes.has(id)){sourceShapes.delete(id);continue;}
    pts.sort((a,b)=>a[0]-b[0]);
    sourceShapes.set(id,pts.map(([,x,y])=>[x,y]));
  }
  const tu=new Map();
  for(const e of tripUpdateFeed.entity){
    const t=e.tripUpdate?.trip;
    if(t?.tripId&&tripIDs.has(t.tripId))tu.set(t.tripId,e.tripUpdate);
  }
  const inputStations=Object.values(staticMap.stations||{})
    .filter(v=>goodGeo(v.la,v.lo))
    .map(v=>[v.n,...project(v.la,v.lo),(v.l||[]).join(' ')]);
  const alignment=build2026PdfAlignment({stations:inputStations});
  const result=[];
  for(const vp of seen){
    const trip=staticMap.sched.trips[vp.id],meta=tripMeta.get(vp.id),upd=tu.get(vp.id);
    const line=trip?.[0]||null;
    if(feedKey==='metro'&&line!=='M1'||feedKey==='sydneytrains'&&(!line||!/^T[1-9]$/.test(line)))
      continue; // report only lines actually drawn on the 2026 PDF
    const startDate=vp.startDate||upd?.trip?.startDate||null;
    const day=validDate(startDate)?startDate:null;
    const eligible=day&&trip?serviceRuns(staticMap.sched.services[trip[1]],day):null;
    const routeConflict=!!(trip&&vp.routeId&&
      (staticMap.routes[vp.routeId]!==line||meta?.routeId!==vp.routeId));
    const cancelled=upd?.trip?.scheduleRelationship===3||upd?.trip?.scheduleRelationship===7;
    const coords={lat:vp.lat,lon:vp.lon};
    const shape=meta?.shapeId&&sourceShapes.get(meta.shapeId);
    const distance=shape?nearPolyline(coords,shape):null;
    const stationPair=line?locate2026Train([line,...project(vp.lat,vp.lon)],alignment):null;
    const ordered=timeline.get(vp.id)||[];
    const schedulePair=stationPair?pairInTrip(ordered,stationPair.from,stationPair.to):null;
    const offset=day?calendarDayDiff(day,today):null;
    const relative=offset==null?null:serviceClock+offset*86400;
    const first=ordered.find(s=>Number.isFinite(s.departureSec??s.arrivalSec));
    const last=[...ordered].reverse().find(s=>Number.isFinite(s.arrivalSec??s.departureSec));
    const plausible=relative!=null&&first&&last?
      relative>=(first.departureSec??first.arrivalSec)-MAX_TRIP_WINDOW_EARLY_S&&
      relative<=(last.arrivalSec??last.departureSec)+MAX_TRIP_WINDOW_LATE_S:null;
    const pairWindow=schedulePair&&relative!=null?
      relative>=(schedulePair.from.departureSec??schedulePair.from.arrivalSec)-MAX_TRIP_WINDOW_EARLY_S&&
      relative<=(schedulePair.to.arrivalSec??schedulePair.to.departureSec)+MAX_TRIP_WINDOW_LATE_S:null;
    const row={
      // A short stable-on-this-run pseudonym rather than exposing raw trip IDs.
      tripId:vp.id,feed:feedKey,line,headsign:meta?.headsign||trip?.[8]||null,
      latitude:vp.lat,longitude:vp.lon,routeId:vp.routeId,
      sourceRouteId:meta?.routeId||null,shapeId:meta?.shapeId||null,
      tripInCurrentGtfs:!!trip&&!!meta,serviceDay:day,
      serviceCalendarRuns:eligible,routeConflict,
      cancelledByTripUpdate:!!cancelled,tripUpdateMatched:!!upd,
      tripUpdateDelaySec:Number.isFinite(upd?.delay)?upd.delay:null,
      feedAgeSec:age,positionAgeSec:Math.round((acquired-vp.updatedAt*1000)/1000),
      shapeDistanceMetres:distance,
      markerVisible:!!stationPair,
      printedStationPair:stationPair?[stationPair.from,stationPair.to]:null,
      printedX:stationPair?Math.round(stationPair.x*100)/100:null,
      printedY:stationPair?Math.round(stationPair.y*100)/100:null,
      stationPairGapM:stationPair?.distanceMetres??null,
      scheduledPairOnTrip:stationPair?!!schedulePair:null,
      scheduledFromSec:schedulePair?(schedulePair.from.departureSec??schedulePair.from.arrivalSec):null,
      scheduledToSec:schedulePair?(schedulePair.to.arrivalSec??schedulePair.to.departureSec):null,
      tripTimeWindowPlausible:plausible,
      scheduledPairWindowPlausible:pairWindow,
      sourceStopCount:ordered.length
    };
    row.classification=selectedReason(row);
    result.push(row);
  }
  const stats=Object.fromEntries([...new Set(result.map(r=>r.line))].sort()
    .map(line=>[line,{total:result.filter(r=>r.line===line).length,
      byClassification:Object.fromEntries([...new Set(result.filter(r=>r.line===line).map(r=>r.classification))]
        .sort().map(k=>[k,result.filter(r=>r.line===line&&r.classification===k).length]))}]));
  return {schema:'nsw-rail-gtfs-diagram-timetable-crosscheck/v1',
    feedKey,captureAt:at,feedTimestamp:new Date(feedTime).toISOString(),
    tripUpdateTimestamp:tripUpdateFeed.header?.timestamp?
      new Date(tripUpdateFeed.header.timestamp*1000).toISOString():null,
    feedAgeSec:age,serviceDateSydney:today,counts:stats,vehicles:result,
    policies:{maxFeedAgeSeconds:MAX_FEED_AGE_SECONDS,
      maxSourceShapeMetres:MAX_SHAPE_DISTANCE_M,maxScheduleEarlySeconds:MAX_TRIP_WINDOW_EARLY_S,
      maxScheduleLateSeconds:MAX_TRIP_WINDOW_LATE_S,
      note:'Timetable windows are plausibility checks, not proof of exact punctuality. Diagram locations are station-pair interpolations: this does not validate the printed curve between anchors.'}};
}
export function summariseDiagramCrosscheck(reports,{source=[]}={}) {
  if(reports.some(r=>r.schema!=='nsw-rail-gtfs-diagram-timetable-crosscheck/v1'))
    throw Error('Unsupported GTFS diagram crosscheck report');
  const all=reports.flatMap(r=>r.vehicles);
  const count=key=>all.filter(v=>v.classification===key).length;
  const md=['# TfNSW current GTFS coordinate, trip and timetable cross-check',
    '',...source.map(s=>'- '+s.feedKey+': static SHA-256 '+s.staticHash+
      ', vehicle SHA-256 '+s.vehicleHash+', trip-update SHA-256 '+s.updateHash+
      '; endpoints '+s.staticEndpoint+' / '+s.vehicleEndpoint+' / '+s.updateEndpoint),
    '',
    '**Snapshot(s):** '+reports.map(r=>r.feedKey+' '+r.feedTimestamp).join('; '),
    '**Vehicle records in reviewed lines:** '+all.length,
    '**Coordinate and timetable corroborated:** '+count('coordinate-and-timetable-corroborated'),
    '**Timetable not corroborated:** '+count('timetable-not-corroborated'),
    '**Source conflicts / off shape / wrong pair:** '+(
      count('source-conflict')+count('off-trip-gtfs-shape')+count('diagram-pair-not-in-trip-stop-sequence')),
    '**Not displayed or source incomplete:** '+(count('diagram-marker-not-displayed')+
      count('current-static-evidence-incomplete')),
    '',
    '| Line | Source positions | Corroborated | Unverified / omitted |',
    '|---|---:|---:|---:|'];
  for(const r of reports)for(const [line,s] of Object.entries(r.counts))
    md.push('| '+line+' | '+s.total+' | '+(s.byClassification['coordinate-and-timetable-corroborated']||0)+
      ' | '+(s.total-(s.byClassification['coordinate-and-timetable-corroborated']||0))+' |');
  md.push('', '**Interpretation:** This is a point-in-time independent-source cross-check of the',
    'vehicle trip ID, static GTFS shape, source calendar, scheduled stops, and reviewed PDF station pair.',
    'A pass means these signals are consistent within stated tolerances; it is not independent',
    'GPS measurement, actual train running certification, or full PDF curve calibration.',
    'No map, source feed or timetable is modified by this operator-only report.','');
  return md.join('\n');
}
