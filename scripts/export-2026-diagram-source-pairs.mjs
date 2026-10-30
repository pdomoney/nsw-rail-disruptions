#!/usr/bin/env node
import fs from 'node:fs';
import {STOP_PIXELS_2026,PDF_2026_LINE_STOPS,ROUTES_2026} from '../site/official-2026-alignment.js';
const rows=[];
for(const [line,chains] of Object.entries(ROUTES_2026)){
  const seen=new Set();
  for(const station of chains.flat()){
    if(seen.has(station))continue;seen.add(station);
    const xy=PDF_2026_LINE_STOPS[line]?.[station]||STOP_PIXELS_2026[station];
    if(xy)rows.push({line,station,pixel:xy,method:PDF_2026_LINE_STOPS[line]?.[station]?'line-specific':'generic'});
  }
}
if(process.argv.length!==3)throw new Error('Usage: node scripts/export-2026-diagram-source-pairs.mjs OUTPUT.json');
fs.writeFileSync(process.argv[2],JSON.stringify(rows,null,2)+'\n');
