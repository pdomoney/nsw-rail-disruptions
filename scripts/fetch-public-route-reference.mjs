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
  const {geojson,provenance,rejectedFeatures}=await fetchPublicRailRouteReference();
  const content=JSON.stringify(geojson)+'\n';
  const hash=createHash('sha256').update(content).digest('hex');
  fs.mkdirSync(out,{recursive:true});
  fs.writeFileSync(path.join(out,'reference-routes.geojson'),content);
  fs.writeFileSync(path.join(out,'reference-rejections.json'),
    JSON.stringify({sourceObjectIdCount:provenance.sourceObjectIdCount,
      excludedGeometryCount:rejectedFeatures.length,rejectedFeatures},null,2)+'\n');
  fs.writeFileSync(path.join(out,'reference-provenance.json'),
    JSON.stringify({...provenance,file:'reference-routes.geojson',sha256:hash},null,2)+'\n');
  console.log('Acquired '+provenance.sourceObjectIdCount+' source IDs, '+geojson.features.length+
    ' geometry-valid reference features; excluded '+rejectedFeatures.length+
    ' explicitly flagged invalid source geometries; SHA-256 '+hash);
  if(rejectedFeatures.length)console.warn('Warning: partial source comparison. Rejected object IDs: '+
    rejectedFeatures.slice(0,15).map(x=>x.objectId+' ('+x.reason+')').join(', '));
} catch(error) {
  console.error('Reference acquisition failed safely: '+error.message);
  process.exitCode=1;
}
