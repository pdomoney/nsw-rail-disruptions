#!/usr/bin/env node
// Creates a read-only opening-day timetable/realtime/position evidence summary.
import path from 'node:path';
import fs from 'node:fs';
import { readJson } from '../src/lib/store.js';
import { readServiceDays } from '../src/lib/service.js';
import { auditSouthwestServiceEvidence, formatSouthwestServiceEvidence,
  OPENING_SERVICE_DAY } from '../src/lib/metro-opening-evidence.js';
const args=process.argv.slice(2);
const option=name=>{const index=args.indexOf(name);return index<0?null:args[index+1];};
try {
  const directory=option('--data-dir')||'data';
  const out=option('--out-dir');
  if(!out) throw new Error('Usage: --data-dir data --out-dir DIR [--data-commit SHA]');
  const day=readServiceDays(directory,{since:OPENING_SERVICE_DAY})
    .find(d=>d.date===OPENING_SERVICE_DAY)||null;
  const result=auditSouthwestServiceEvidence({
    openingDay:day,
    positions:readJson(path.join(directory,'live','positions.json')),
    metroStations:readJson(path.join(directory,'stations','metro.json')),
  });
  const formatted=formatSouthwestServiceEvidence(result,{dataCommit:option('--data-commit')});
  fs.mkdirSync(out,{recursive:true});
  fs.writeFileSync(path.join(out,'metro-opening-service-evidence.json'),JSON.stringify(result,null,2)+'\n');
  fs.writeFileSync(path.join(out,'metro-opening-service-evidence.md'),formatted.markdown+'\n');
  fs.writeFileSync(path.join(out,'metro-opening-service-evidence.csv'),formatted.csv);
  console.log('Metro Southwest evidence: '+result.status+
    ', candidate trips '+result.bankstownCandidateTrips+
    ', running flags '+result.candidateTripsSeenRunningAfterOpening+
    ', southwest position observations '+result.liveMetroPositionsWestOfSydenham);
} catch(error) {
  console.error('Metro service evidence audit failed: '+error.message);
  process.exitCode=1;
}
