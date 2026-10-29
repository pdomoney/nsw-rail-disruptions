#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {FEEDS} from '../src/config/feeds.js';
import {tfnswGetFirst} from '../src/lib/http.js';
import {readZip} from '../src/lib/zip.js';
import {extractCurrentTargetShapes,compareHistoricalShapes,renderShapeReview} from '../src/lib/current-shape-reconciliation.js';
const args=process.argv.slice(2),opt=k=>{const i=args.indexOf(k);return i<0?null:args[i+1];};
const sha=buf=>createHash('sha256').update(buf).digest('hex');
try {
  const reference=opt('--reference'),prov=opt('--reference-provenance'),out=opt('--out-dir');
  if(!reference||!prov||!out)throw new Error('Required: --reference, --reference-provenance, --out-dir');
  const bytes=fs.readFileSync(reference),metadata=JSON.parse(fs.readFileSync(prov,'utf8'));
  const originalHash=sha(bytes);
  if(!/^[0-9a-f]{64}$/.test(metadata.sha256||'')||metadata.sha256!==originalHash)
    throw new Error('Reference GeoJSON checksum does not match provenance');
  const historical=JSON.parse(bytes.toString('utf8'));
  if(historical.type!=='FeatureCollection'||!Array.isArray(historical.features))
    throw new Error('Reference must be FeatureCollection');
  const feed=FEEDS.find(f=>f.key==='sydneytrains');
  if(!feed?.schedule||!(process.env.TFNSW_API_KEY||'').trim())
    throw new Error('Missing configured Sydney Trains source or authorised TfNSW API key');
  const acquiredAt=new Date().toISOString();
  const {buf,path:used}=await tfnswGetFirst(feed.schedule,{timeoutMs:120000,retries:1});
  const current=extractCurrentTargetShapes(readZip(buf,[
    'routes.txt','trips.txt','shapes.txt','calendar.txt','calendar_dates.txt'
  ]));
  const report=compareHistoricalShapes(current,historical,{source:{
    retrievedAt:acquiredAt,gtfsEndpoint:used,gtfsSha256:sha(buf),
    historicalSha256:originalHash,historicalFeatureCount:historical.features.length,
    historicalUpdateValues:metadata.portalLastUpdatedValues||[],
    dataCommit:opt('--data-commit')||null,
  }});
  const rendered=renderShapeReview(report);
  fs.mkdirSync(out,{recursive:true});
  fs.writeFileSync(path.join(out,'historical-v-current-shapes.json'),JSON.stringify(report,null,2)+'\n');
  fs.writeFileSync(path.join(out,'historical-v-current-shapes.md'),rendered.markdown+'\n');
  fs.writeFileSync(path.join(out,'historical-v-current-shapes.csv'),rendered.csv);
  fs.writeFileSync(path.join(out,'current-source-provenance.json'),JSON.stringify(report.source,null,2)+'\n');
  console.log('Reviewed '+report.exceptions.length+' historical IDs against newly downloaded TfNSW GTFS');
  for(const s of report.exceptions)console.log(s.line+' '+s.shapeId+': '+s.classification);
} catch(e) {
  console.error('Comparison stopped safely: '+e.message);
  process.exitCode=1;
}
