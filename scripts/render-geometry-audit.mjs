#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { formatGeometryAudit } from '../src/lib/geometry-audit-report.js';
const args = process.argv.slice(2);
const opt = name => { const i=args.indexOf(name); return i<0?null:args[i+1]; };
try {
  const src=opt('--input'),dir=opt('--out-dir');
  if (!src || !dir) throw new Error('Usage: --input geometry-audit.json --out-dir DIR [--data-commit SHA]');
  const result=formatGeometryAudit(JSON.parse(fs.readFileSync(src,'utf8')), {dataCommit:opt('--data-commit')});
  fs.mkdirSync(dir,{recursive:true});
  fs.writeFileSync(path.join(dir,'review-summary.md'),result.markdown+'\n');
  fs.writeFileSync(path.join(dir,'line-indicators.csv'),result.lineCsv);
  fs.writeFileSync(path.join(dir,'station-exceptions.csv'),result.exceptionCsv);
  console.log('Review files ready in '+dir);
} catch(error) {
  console.error(error.message);
  process.exitCode=1;
}
