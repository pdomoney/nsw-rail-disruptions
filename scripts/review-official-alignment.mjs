// Review artefact, generated from the SAME station registry used by the web app.
// Ensures route and station visual alignment can be accepted before a production merge.
import fs from 'node:fs';
import path from 'node:path';
import {buildSchematic} from '../src/lib/schematic.js';
import {OFFICIAL_MAP,PDF_STATION_CROSSWALK,OFFICIAL_STOPS}
 from '../site/official-map.js';
import {REFERENCE_2024_ROUTES,OFFICIAL_LINE_PALETTE}
 from '../site/official-vector-stops.js';

const dest=process.argv[2]||'test-artifacts/official-review';
fs.mkdirSync(dest,{recursive:true});
const esc=t=>String(t).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const S=buildSchematic();
const onMap=new Map();
for(const [line,routes] of Object.entries(REFERENCE_2024_ROUTES)){
  for(const route of routes)for(const name of route){
    if(!onMap.has(name))onMap.set(name,new Set());
    onMap.get(name).add(line);
  }
}
const crosswalk=[];
for(const [name,lines] of [...onMap].sort(([a],[b])=>a.localeCompare(b))){
 const from=S.lay.pos.get(name);
 const to=PDF_STATION_CROSSWALK.positions.get(name);
 const seed=OFFICIAL_STOPS[name];
 const ev=PDF_STATION_CROSSWALK.evidence.find(x=>x.name===name);
 crosswalk.push([
  name,[...lines].join(' '),from?.[0]??'',from?.[1]??'',
  to?.[0]??'',to?.[1]??'',
  seed?.[0]??'',seed?.[1]??'',
  seed&&to?Math.hypot(to[0]-seed[0],to[1]-seed[1]).toFixed(1):'',
  ev?.method||'UNRESOLVED',ev?.line||'',ev?.distance??''
 ]);
}
const headers=['station','lines','existing_schematic_x','existing_schematic_y',
 'official_pdf_x','official_pdf_y','previous_manual_pdf_x','previous_manual_pdf_y',
 'manual_anchor_delta_px','evidence','source_line','match_distance_px'];
const csvLine=row=>row.map(s=>'"'+String(s).replaceAll('"','""')+'"').join(',');
fs.writeFileSync(path.join(dest,'station-coordinate-reconciliation.csv'),
  [headers,...crosswalk].map(csvLine).join('\n')+'\n');
fs.writeFileSync(path.join(dest,'review-metrics.json'),JSON.stringify({
  sourcePDF:OFFICIAL_MAP.source,edition:OFFICIAL_MAP.edition,
  markerCandidates:266,printNames:onMap.size,
  confirmed:crosswalk.filter(x=>x[9]!=='UNRESOLVED').length,
  unresolved:crosswalk.filter(x=>x[9]==='UNRESOLVED').length,
  byLine:Object.fromEntries([...PDF_STATION_CROSSWALK.byLine].map(([id,m])=>[id,m.size]))
},null,2)+'\n');

// The overlay is visibly separate from the TfNSW source image. Green halo
// denotes a PDF-exact confirmed station. Unmatched coordinates are NOT drawn.
const svg=[
 '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1447" width="1024" height="1447">',
 '<title>Review: confirmed named stations aligned with original TfNSW PDF vector symbols</title>',
 '<image href="tfnsw-sydney-rail-2024.png" x="0" y="0" width="1024" height="1447"/>'
];
for(const [name,pt] of PDF_STATION_CROSSWALK.positions){
 const line=PDF_STATION_CROSSWALK.evidence.find(x=>x.name===name)?.line||'T1';
 svg.push('<circle cx="'+pt[0]+'" cy="'+pt[1]+'" r="6" fill="none" stroke="'+
  (OFFICIAL_LINE_PALETTE[line]||'#00984c')+'" stroke-width="1.7" opacity=".9"><title>'+
  esc(name)+'</title></circle>');
}
const key=['PDF-exact named stations: '+PDF_STATION_CROSSWALK.positions.size,
 'No guessed positions for unresolved stops'];
svg.push('<rect x="35" y="66" width="440" height="61" fill="#f8f9f5" fill-opacity=".95" rx="7" stroke="#8b9498"/>');
key.forEach((x,i)=>svg.push('<text x="50" y="'+(91+i*23)+
 '" font-size="16" font-family="Arial,sans-serif" fill="#193849">'+esc(x)+'</text>'));
svg.push('</svg>');
fs.writeFileSync(path.join(dest,'confirmed-station-overlay.svg'),svg.join('\n'));
console.log('Official map crosswalk:',crosswalk.filter(x=>x[9]!=='UNRESOLVED').length,
  'confirmed of',crosswalk.length,'printed-network names.');
