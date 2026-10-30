#!/usr/bin/env node
// Read-only review of EVERY tracked line against a pinned TfNSW collected data
// snapshot and the approved 2026 network diagram station-pair registry.
// Positional eligibility is not a substitute for GTFS trip/timetable proof.
import fs from 'node:fs';
import path from 'node:path';
import {LINES} from '../src/config/lines.js';
import {project} from '../src/lib/netmap.js';
import {
  officialDiagramCoverage,build2026PdfAlignment,locate2026Train,
} from '../site/official-2026-alignment.js';

const root=process.argv[2],output=process.argv[3];
if(!root||!output)throw Error('Usage: node scripts/audit-2026-all-line-coverage.mjs DATA_DIR OUTPUT_DIR');
const read=file=>JSON.parse(fs.readFileSync(path.join(root,file),'utf8'));
const provenance=[];
const names=new Map();
const nameKey=name=>String(name||'').normalize('NFKC').toLowerCase()
  .replace(/\bstation\b/g,'').replace(/[^\p{L}\p{N}]+/gu,'');
for(const feed of ['sydneytrains','metro']) {
  const snapshot=read('stations/'+feed+'.json');
  provenance.push({feed,snapshotAt:snapshot.builtAt||null,source:snapshot.source||null});
  for(const st of Object.values(snapshot.stations||{})){
    if(!Number.isFinite(st.la)||!Number.isFinite(st.lo))continue;
    const key=nameKey(st.n),prior=names.get(key);
    if(!prior)names.set(key,{n:st.n,lat:st.la,lon:st.lo,l:new Set(st.l||[])});
    else for(const line of st.l||[])prior.l.add(line);
  }
}
const network={stations:[...names.values()].map(x=>[x.n,...project(x.lat,x.lon),[...x.l].join(' '),1])};
const alignment=build2026PdfAlignment(network);
const live=read('live/positions.json'),col=Object.fromEntries(live.cols.map((name,i)=>[name,i]));
for(const id of ['line','lat','lon'])if(!Number.isInteger(col[id]))
  throw Error('Expected TfNSW position column: '+id);
const reported=new Map();
for(const row of live.trains||[]) {
  const line=row[col.line],lat=row[col.lat],lon=row[col.lon];
  if(!Number.isFinite(lat)||!Number.isFinite(lon))continue;
  if(!reported.has(line))reported.set(line,[]);
  reported.get(line).push({latitude:lat,longitude:lon});
}
const rows=LINES.map(l=>{
  const coverage=officialDiagramCoverage(l.id);
  const edges=alignment[l.id]||[];
  const positions=reported.get(l.id)||[];
  let eligible=0;
  const omitted=[];
  for(const p of positions) {
    const pos=locate2026Train([l.id,...project(p.latitude,p.longitude)],alignment);
    if(pos)eligible++;
    else omitted.push(p);
  }
  return {line:l.id,mode:l.mode,sourceStatus:coverage.status,
    sourceCorridors:coverage.sources,sourceVerifiedPairs:edges.length,
    feedPositions:positions.length,eligibleDiagramMarkers:eligible,
    withheldPositions:omitted.length,reportType:'eligibility-not-trip-or-timetable-validation'};
});
const source={liveTimestamp:live.at||null,provenance,coveragePolicy:
  'Outside official 2026 Sydney rail PDF is not displayed; shared source geometry used only on validated station pairs.'};
fs.mkdirSync(output,{recursive:true});
fs.writeFileSync(path.join(output,'all-line-coverage.json'),JSON.stringify({source,rows},null,2)+'\n');
const md=['# TfNSW 2026 diagram coverage of every tracked line','',
  'Vehicle snapshot: **'+(source.liveTimestamp||'unknown')+'**',
  'This is a *read-only* coverage diagnostic, not evidence that each static trip is valid.','',
  '| Line | Mode | Source coverage | Verified corridor pairs | Feed vehicles | Eligible icons | Withheld |',
  '|---|---|---|---:|---:|---:|---:|'];
for(const row of rows)md.push('| '+row.line+' | '+row.mode+' | '+row.sourceStatus+
  (row.sourceCorridors.length?' ('+row.sourceCorridors.join(', ')+')':'')+
  ' | '+row.sourceVerifiedPairs+' | '+row.feedPositions+' | '+
  row.eligibleDiagramMarkers+' | '+row.withheldPositions+' |');
md.push('', 'Notes: An eligible icon is interpolated within 250m of an approved printed station pair.',
  'Unsupported lines (including HUN and light rail) are outside the actual Sydney rail PDF.',
  'Vehicle trips and scheduled stops still require the separate live GTFS source cross-check.',
  'No live-data, printed-source image or map positions were modified.','');
fs.writeFileSync(path.join(output,'all-line-coverage.md'),md.join('\n'));
console.log(md.join('\n'));
