#!/usr/bin/env node
// Compare current collected, mode-specific TfNSW GTFS network and stop evidence.
import fs from 'node:fs';
import path from 'node:path';
import { auditModeGeometry, formatModeGeometryReadiness } from '../src/lib/mode-geometry-readiness.js';
const args=process.argv.slice(2);
const opt=name=>{const i=args.indexOf(name);return i<0?null:args[i+1];};
try {
  const netDir=opt('--network-dir')||'data/network';
  const stopDir=opt('--station-dir')||'data/stations';
  const output=opt('--output'),dir=opt('--out-dir');
  if(!dir)throw new Error('Usage: --network-dir data/network --station-dir data/stations --out-dir DIR [--output path] [--data-commit SHA]');
  const feeds=['metro','sydneytrains','lr-parramatta'];
  const load=(folder,key)=>JSON.parse(fs.readFileSync(path.join(folder,key+'.json'),'utf8'));
  const networks=Object.fromEntries(feeds.map(f=>[f,load(netDir,f)]));
  const stations=Object.fromEntries(feeds.map(f=>[f,load(stopDir,f)]));
  const result=auditModeGeometry({networks,stations});
  const formatted=formatModeGeometryReadiness(result,{dataCommit:opt('--data-commit')});
  fs.mkdirSync(dir,{recursive:true});
  fs.writeFileSync(output||path.join(dir,'mode-readiness.json'),JSON.stringify(result,null,2)+'\n');
  fs.writeFileSync(path.join(dir,'mode-readiness.md'),formatted.markdown+'\n');
  fs.writeFileSync(path.join(dir,'mode-lines.csv'),formatted.lineCsv);
  fs.writeFileSync(path.join(dir,'metro-southwest-stations.csv'),formatted.corridorCsv);
  console.log('Mode source audit:',result.southwest.status,'station proximity:',
    result.southwest.stationsOnMappedLineWithin1km+'/'+result.southwest.stationsExpected);
} catch(e) {
  console.error('Mode source audit failed: '+e.message);
  process.exitCode=1;
}
