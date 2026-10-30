#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {FEEDS} from '../src/config/feeds.js';
import {tfnswGetFirst} from '../src/lib/http.js';
import {readZip} from '../src/lib/zip.js';
import {buildRouteMap} from '../src/lib/gtfs-static.js';
import {decodeFeed} from '../src/lib/gtfs-rt.js';
import {auditDiagramTimetableFeed,summariseDiagramCrosscheck}
  from '../src/lib/2026-diagram-timetable-crosscheck.js';
const args=process.argv.slice(2);
const option=name=>{const i=args.indexOf(name);return i<0?null:args[i+1];};
const hash=b=>createHash('sha256').update(b).digest('hex');
function csv(v) {
  let str=String(v??'');
  if(/^[=+\-@\t\r]/.test(str))str="'"+str;
  return '"'+str.replaceAll('"','""')+'"';
}
try{
  const out=option('--out-dir'),dataCommit=option('--data-commit');
  if(!out||!(process.env.TFNSW_API_KEY||'').trim())
    throw Error('Require --out-dir and current TfNSW API key secret');
  const reports=[],source=[];
  for(const key of ['metro','sydneytrains']){
    const feed=FEEDS.find(f=>f.key===key);
    if(!feed?.schedule||!feed.realtime||!feed.vehiclePositions)
      throw Error('Missing TfNSW feed configuration for '+key);
    const stat=await tfnswGetFirst(feed.schedule,{timeoutMs:120000,retries:1});
    const files=readZip(stat.buf,[
      'trips.txt','routes.txt','stops.txt','stop_times.txt',
      'shapes.txt','calendar.txt','calendar_dates.txt'
    ]);
    const map=buildRouteMap(stat.buf,feed);
    const vp=await tfnswGetFirst(feed.vehiclePositions,{timeoutMs:45000,retries:1});
    const tu=await tfnswGetFirst(feed.realtime,{timeoutMs:45000,retries:1});
    const at=new Date().toISOString(),vehicles=decodeFeed(vp.buf),updates=decodeFeed(tu.buf);
    const delta=Math.abs((vehicles.header?.timestamp||0)-(updates.header?.timestamp||0));
    const age=(Date.parse(at)/1000)-(vehicles.header?.timestamp||0);
    if(delta>180||age>900||age<0)
      throw Error(key+' realtime feed skew or staleness: '+delta+' / '+age+'s');
    const report=auditDiagramTimetableFeed({
      feedKey:key,staticMap:map,files,vehicleFeed:vehicles,tripUpdateFeed:updates,at
    });
    source.push({feedKey:key,staticHash:hash(stat.buf),
      vehicleHash:hash(vp.buf),updateHash:hash(tu.buf),
      staticEndpoint:stat.path,vehicleEndpoint:vp.path,updateEndpoint:tu.path,at});
    reports.push(report);
    console.log(key+': '+report.vehicles.length+' reviewed vehicle positions');
  }
  const payload={schema:'nsw-rail-diagram-time-coordinate-audit/v1',
    dataCommit:dataCommit||null,at:new Date().toISOString(),source,reports,
    note:'Static GTFS and near-synchronous vehicle and trip feeds; no production changes.'};
  fs.mkdirSync(out,{recursive:true});
  fs.writeFileSync(path.join(out,'coordinate-timetable-audit.json'),
    JSON.stringify(payload,null,2)+'\n');
  const markdown=summariseDiagramCrosscheck(reports,{source});
  fs.writeFileSync(path.join(out,'coordinate-timetable-audit.md'),markdown+'\n');
  const cols=['feed','line','tripId','classification','headsign','latitude','longitude',
    'shapeId','shapeDistanceMetres','serviceDay','serviceCalendarRuns','tripUpdateMatched',
    'tripTimeWindowPlausible','scheduledPairWindowPlausible','scheduledPairOnTrip',
    'printedStationPair','printedX','printedY','stationPairGapM','routeConflict','markerVisible'];
  const rows=reports.flatMap(r=>r.vehicles);
  const values=rows.map(r=>cols.map(c=>csv(Array.isArray(r[c])?r[c].join(' to '):r[c])).join(','));
  fs.writeFileSync(path.join(out,'coordinate-timetable-audit.csv'),
    [cols.map(csv).join(','),...values].join('\n')+'\n');
  console.log(markdown);
}catch(e){
  console.error('Crosscheck failed safely: '+e.message);
  process.exitCode=1;
}
