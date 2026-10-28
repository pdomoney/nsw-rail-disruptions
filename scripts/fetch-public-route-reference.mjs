#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fetchPublicRailRouteReference} from '../src/lib/public-route-reference.js';

const args=process.argv.slice(2);
const opt=name=>{const i=args.indexOf(name);return i<0?null:args[i+1];};
try {
  const out=opt('--out-dir');
  if(!out) throw new Error('Usage: node scripts/fetch-public-route-reference.mjs --out-dir DIR');
  const {geojson,provenance}=await fetchPublicRailRouteReference();
  const content=JSON.stringify(geojson)+'\n';
  const hash=createHash('sha256').update(content).digest('hex');
  fs.mkdirSync(out,{recursive:true});
  fs.writeFileSync(path.join(out,'reference-routes.geojson'),content);
  fs.writeFileSync(path.join(out,'reference-provenance.json'),
    JSON.stringify({...provenance,file:'reference-routes.geojson',sha256:hash},null,2)+'\n');
  console.log('Saved '+geojson.features.length+' complete public route geometries; SHA-256 '+hash);
} catch(error) {
  console.error('Reference acquisition failed safely: '+error.message);
  process.exitCode=1;
}
