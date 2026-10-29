// Operator-only comparison of historical ArcGIS shape IDs with a freshly
// fetched TfNSW Sydney Trains static GTFS ZIP. No map edits or inferred tracks.
import { parseCsv, forEachCsvRow } from './csv.js';
import { matchGtfsRoute } from './lines.js';
import { serviceRuns } from './gtfs-static.js';
import { project } from './netmap.js';

export const HISTORICAL_SHAPE_TARGETS = Object.freeze([
  {line:'T1',shapeId:'2-T1-W-sj2-1.1.R'},
  {line:'SCO',shapeId:'76-SCO-sj2-1.1.R'},
  {line:'SCO',shapeId:'2-SCO-sj2-1.1.R'},
  {line:'SHL',shapeId:'76-SHL-sj2-1.1.R'},
]);
export const REVIEW_SERVICE_DATES = Object.freeze(['20261029','20261030','20261031']);
const finite=v=>typeof v==='number' && Number.isFinite(v);
const oneDecimal=v=>v==null?null:Math.round(v*10)/10;
const key=(line,id)=>line+'|'+id;
const requireFiles=files=>{
  for(const file of ['routes.txt','trips.txt','shapes.txt'])
    if(!Buffer.isBuffer(files?.[file]))throw new Error('Current TfNSW GTFS bundle missing '+file);
};
const rowNumber=x=>{
  const v=Number(x);
  return x!==''&&finite(v)?v:null;
};
function serviceCalendar(files) {
  const services={};
  if(files['calendar.txt'])forEachCsvRow(files['calendar.txt'],[
    'service_id','monday','tuesday','wednesday','thursday','friday','saturday','sunday','start_date','end_date'
  ],cols=>{
    let mask=0;
    for(let i=1;i<=7;i++)if(cols[i]==='1')mask|=1<<(i-1);
    services[cols[0]]=[cols[8],cols[9],mask,[],[]];
  });
  if(files['calendar_dates.txt'])forEachCsvRow(files['calendar_dates.txt'],[
    'service_id','date','exception_type'
  ],([id,date,kind])=>{
    const s=(services[id] ||= ['', '', 0, [], []]);
    if(kind==='1')s[3].push(date);
    else if(kind==='2')s[4].push(date);
  });
  return services;
}
function geographicPoint(lat,lon) {
  return finite(lat)&&finite(lon)&&lat>=-39&&lat<=-26&&lon>=137.5&&lon<=155;
}
export function extractCurrentTargetShapes(files,{dates=REVIEW_SERVICE_DATES}={}) {
  requireFiles(files);
  if(!Array.isArray(dates)||!dates.length||dates.some(d=>!/^\d{8}$/.test(d)))
    throw new Error('Specify YYYYMMDD service days');
  const routes=new Map(parseCsv(files['routes.txt'].toString('utf8'),[
    'route_id','route_short_name','route_long_name','route_desc'
  ]).map(r=>[r.route_id,matchGtfsRoute(r)]));
  const calendars=serviceCalendar(files);
  const shapeTotals=new Map();
  const targetTripSets=new Map();
  const allLineShapes=new Map();
  const relevant=new Set(HISTORICAL_SHAPE_TARGETS.map(v=>key(v.line,v.shapeId)));
  forEachCsvRow(files['trips.txt'],[
    'route_id','service_id','trip_id','shape_id'
  ],([routeId,sid,tripId,shapeId])=>{
    const line=routes.get(routeId);
    if(!['T1','SCO','SHL'].includes(line)||!shapeId)return;
    const shapeKey=key(line,shapeId);
    const counter=shapeTotals.get(shapeKey)||{line,shapeId,trips:0,serviceDates:Object.fromEntries(dates.map(d=>[d,0]))};
    counter.trips++;
    for(const date of dates) if(serviceRuns(calendars[sid],date))counter.serviceDates[date]++;
    shapeTotals.set(shapeKey,counter);
    if(!allLineShapes.has(line)) allLineShapes.set(line,new Set());
    allLineShapes.get(line).add(shapeId);
    if(relevant.has(shapeKey)){
      const set=targetTripSets.get(shapeKey)||new Set();
      set.add(tripId);
      targetTripSets.set(shapeKey,set);
    }
  });
  const wantedIDs=new Set(HISTORICAL_SHAPE_TARGETS.map(v=>v.shapeId));
  const points=new Map();
  let malformed=0;
  forEachCsvRow(files['shapes.txt'],[
    'shape_id','shape_pt_lat','shape_pt_lon','shape_pt_sequence'
  ],([shapeId,lat,lon,seq])=>{
    if(!wantedIDs.has(shapeId))return;
    const la=rowNumber(lat),lo=rowNumber(lon),order=rowNumber(seq);
    if(!geographicPoint(la,lo)||!finite(order)){malformed++;return;}
    if(!points.has(shapeId))points.set(shapeId,[]);
    const list=points.get(shapeId);
    if(list.length>=25000)throw new Error('Target shape has excessive points: '+shapeId);
    list.push([order,lo,la]);
  });
  if(malformed>0)throw new Error('Source GTFS has '+malformed+
    ' malformed geometry rows in the target historical shape IDs; refuse a partial shape comparison');
  const shapes={};
  for(const {line,shapeId} of HISTORICAL_SHAPE_TARGETS) {
    const id=key(line,shapeId),trip=shapeTotals.get(id);
    const coords=(points.get(shapeId)||[]).sort((a,b)=>a[0]-b[0]).map(([,lon,lat])=>[lon,lat]);
    shapes[id]={
      line,shapeId,
      geometryPresent:coords.length>=2,
      currentTrips:trip?.trips||0,
      serviceDates:trip?.serviceDates||Object.fromEntries(dates.map(d=>[d,0])),
      exactTripIds:targetTripSets.get(id)?.size||0,
      coordinates:coords.length>=2?coords:[],
      status:coords.length<2?'shape-id-not-in-current-geometry':
        !trip?.trips?'shape-present-without-matched-current-line-trips':
        'shape-present-with-current-line-trips',
    };
  }
  const lineOverview={};
  for(const line of ['T1','SCO','SHL']) {
    const shapesForLine=[...shapeTotals.values()].filter(s=>s.line===line)
      .sort((a,b)=>b.trips-a.trips||a.shapeId.localeCompare(b.shapeId));
    lineOverview[line]={
      uniqueShapeIds:allLineShapes.get(line)?.size||0,
      tripCount:shapesForLine.reduce((n,v)=>n+v.trips,0),
      popularShapeIds:shapesForLine.slice(0,6).map(v=>({
        shapeId:v.shapeId,trips:v.trips,serviceDates:v.serviceDates,
      })),
    };
  }
  return {schema:'nsw-rail-current-gtfs-shape-exceptions/v1',dates,malformedTargetPoints:malformed,
    targets:shapes,lineOverview,note:'Only four historic exception shape IDs are geometrically loaded. Missing IDs may be retired, renamed or absent in the current GTFS. Calendar counts are from exact route and service_id membership, not operating evidence.'};
}
function paths(feature) {
  const g=feature?.geometry;
  if(g?.type==='LineString')return [g.coordinates];
  if(g?.type==='MultiLineString')return g.coordinates;
  return [];
}
function validPath(path) {
  return Array.isArray(path)&&path.length>=2&&path.every(p=>Array.isArray(p)&&p.length>=2&&geographicPoint(p[1],p[0]));
}
function samples(path,max=750,stepM=500) {
  if(!validPath(path))return [];
  const coords=path.map(([lon,lat])=>project(lat,lon)),out=[coords[0]];
  let traveled=0,next=stepM/10;
  for(let i=1;i<coords.length&&out.length<max;i++) {
    const a=coords[i-1],b=coords[i],distance=Math.hypot(a[0]-b[0],a[1]-b[1]);
    if(distance===0)continue;
    while(next<=traveled+distance&&out.length<max){
      const fraction=(next-traveled)/distance;
      out.push([a[0]+fraction*(b[0]-a[0]),a[1]+fraction*(b[1]-a[1])]);
      next+=stepM/10;
    }
    traveled+=distance;
  }
  if(out.length<max)out.push(coords.at(-1));
  return out;
}
function segments(paths) {
  const segments=[];
  for(const p of paths) {
    if(!validPath(p))continue;
    const coords=p.map(([lon,lat])=>project(lat,lon));
    for(let i=1;i<coords.length;i++) {
      const [a,b]=[coords[i-1],coords[i]];
      if(a[0]!==b[0]||a[1]!==b[1])segments.push([...a,...b]);
    }
  }
  return segments;
}
function near([x,y],segments,tolerance) {
  for(const [ax,ay,bx,by] of segments) {
    const dx=bx-ax,dy=by-ay,d2=dx*dx+dy*dy;
    const t=Math.max(0,Math.min(1,((x-ax)*dx+(y-ay)*dy)/d2));
    if(Math.hypot(x-(ax+t*dx),y-(ay+t*dy))<=tolerance/10)return true;
  }
  return false;
}
function proximity(source,target,toleranceM=100) {
  const tests=source.flatMap(path=>samples(path));
  const segs=segments(target);
  const nearCount=segs.length?tests.filter(point=>near(point,segs,toleranceM)).length:0;
  return {sampledPoints:tests.length,within100m:nearCount,
    percent:tests.length&&segs.length?oneDecimal(100*nearCount/tests.length):null};
}
const prop=(o,k)=>{const actual=Object.keys(o||{}).find(v=>v.toLowerCase()===k);return actual?o[actual]:null;};
export function compareHistoricalShapes(current,reference,{source=null}={}) {
  if(current?.schema!=='nsw-rail-current-gtfs-shape-exceptions/v1'||
    reference?.type!=='FeatureCollection'||!Array.isArray(reference.features))
    throw new Error('Expected validated current GTFS and historical GeoJSON input');
  const results=[];
  for(const target of HISTORICAL_SHAPE_TARGETS) {
    const shape=current.targets[key(target.line,target.shapeId)];
    if(!shape)throw new Error('Missing expected current shape evidence');
    const legacy=reference.features.filter(feature=>
      String(prop(feature?.properties,'route_short_name')||'').trim()===target.line &&
      String(prop(feature?.properties,'shape_id')||'').trim()===target.shapeId);
    const oldPaths=legacy.flatMap(paths).filter(validPath);
    const currentPaths=shape.geometryPresent?[shape.coordinates]:[];
    const historicalToCurrent=proximity(oldPaths,currentPaths);
    const currentToHistorical=proximity(currentPaths,oldPaths);
    const decision=!oldPaths.length?'historical-shape-id-not-found':
      !shape.geometryPresent?'current-gtfs-shape-id-not-found':
      historicalToCurrent.percent===100&&currentToHistorical.percent===100?'same-id-samples-within-100m':
      'same-id-geometry-difference-review';
    results.push({
      line:target.line,shapeId:target.shapeId,classification:decision,
      historicReferenceFeatures:legacy.length,current: {
        status:shape.status,
        geometryPresent:shape.geometryPresent,
        tripCount:shape.currentTrips,
        calendarTripCounts:shape.serviceDates,
        coordinatesCount:shape.coordinates.length,
      },
      historicalToCurrent,currentToHistorical,
      note:'Comparisons use the same exact shape_id, with 500m-spaced sample points (max 750 per path) in a local approximate projection, not entire-line geometry.',
    });
  }
  return {schema:'nsw-rail-historical-v-current-shape-review/v1',
    source,dates:current.dates,malformedCurrentTargetPoints:current.malformedTargetPoints,
    lines:current.lineOverview,exceptions:results,
    advisory:'Historical ArcGIS metadata can predate GTFS service changes; reuse of a shape ID does not guarantee temporal equivalence. Missing shape IDs are not proof of bad route placement. No geometry corrections authorised.'};
}
const csv=v=>{
  let t=String(v??'');
  if(/^[=+\-@\t\r]/.test(t))t="'"+t;
  return '"'+t.replace(/"/g,'""')+'"';
};
export function renderShapeReview(report) {
  if(report?.schema!=='nsw-rail-historical-v-current-shape-review/v1')
    throw new Error('Invalid shape reconciliation review');
  const head=['Line','Historical shape ID','Review classification','2026 GTFS shape present',
    'Current GTFS trips','20261029 active trips','20261030 active trips','20261031 active trips',
    'Historical→current within100m percent','Current→historical within100m percent'];
  const rows=[head,...report.exceptions.map(e=>[e.line,e.shapeId,e.classification,
    e.current.geometryPresent,e.current.tripCount,e.current.calendarTripCounts?.['20261029'],
    e.current.calendarTripCounts?.['20261030'],e.current.calendarTripCounts?.['20261031'],
    e.historicalToCurrent.percent,e.currentToHistorical.percent])];
  const csvContent=rows.map(row=>row.map(csv).join(',')).join('\n')+'\n';
  const md=[
    '# Historical ArcGIS vs current TfNSW Sydney Trains GTFS: shape-level review',
    '',
    '**Retrieved current GTFS:** '+String(report.source?.retrievedAt||'unknown'),
    '**Actual TfNSW source endpoint:** '+String(report.source?.gtfsEndpoint||'unknown'),
    '**GTFS ZIP SHA-256:** '+String(report.source?.gtfsSha256||'unknown'),
    '**Historical GeoJSON SHA-256:** '+String(report.source?.historicalSha256||'unknown'),
    '**Historical source metadata updates:** '+String(report.source?.historicalUpdateValues||'unknown'),
    '**Collected data branch revision:** '+String(report.source?.dataCommit||'unknown'),
    '',
    'These are **four historical candidate shape IDs**, not an exhaustive current-route validation. Both sources ultimately derive from GTFS and have different collection times.',
    '',
    '| Line | Historic shape ID | Classification | Current shape | 2026-10-30 trips | Old→current | Current→old |',
    '|---|---|---|---|---:|---:|---:|',
    ...report.exceptions.map(e=>'| '+e.line+' | '+e.shapeId+' | '+e.classification+
      ' | '+(e.current.geometryPresent?'yes':'NO')+' | '+
      (e.current.calendarTripCounts?.['20261030']??'unknown')+' | '+
      (e.historicalToCurrent.percent==null?'not comparable':e.historicalToCurrent.percent+'%')+
      ' | '+(e.currentToHistorical.percent==null?'not comparable':e.currentToHistorical.percent+'%')+' |'),
    '',
    '## Current source line-shape inventory (not certified geometry)',
    '',
    ...Object.entries(report.lines||{}).map(([line,info])=>'- '+line+': '+
      info.uniqueShapeIds+' shape IDs, '+info.tripCount+' total trip rows; leading IDs: '+
      info.popularShapeIds.map(s=>s.shapeId+' ('+s.trips+' trip rows)').join(', ')),
    '',
    '**Interpretation:** A missing exact historical shape ID may reflect a retired route variant or changed naming. Date-qualified trips come from GTFS calendar/calendar_dates, not realtime confirmation. The 100m sample measure only compares two shapes sharing the same exact ID. If the ID is missing, do not substitute an arbitrary same-line route. Never snap active coordinates to archived lines without independent current source evidence.',
    ''
  ].join('\n');
  return {markdown:md,csv:csvContent};
}
