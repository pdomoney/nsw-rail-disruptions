#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {formatReferenceComparison} from '../src/lib/reference-comparison-report.js';
const args=process.argv.slice(2);
const opt=name=>{const i=args.indexOf(name);return i<0?null:args[i+1];};
try{
  const input=opt('--input'),directory=opt('--out-dir');
  if(!input||!directory)throw new Error('Usage: --input geometry-audit.json --out-dir DIR');
  const result=formatReferenceComparison(JSON.parse(fs.readFileSync(input,'utf8')));
  fs.mkdirSync(directory,{recursive:true});
  fs.writeFileSync(path.join(directory,'reference-review.md'),result.markdown+'\n');
  fs.writeFileSync(path.join(directory,'reference-coverage.csv'),result.csv);
  fs.writeFileSync(path.join(directory,'reference-exception-locations.csv'),result.exceptionLocationCsv);
  console.log('Source comparison review files ready');
}catch(error){
  console.error(error.message);
  process.exitCode=1;
}
