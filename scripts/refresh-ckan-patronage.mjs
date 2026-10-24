// Daily authenticated CKAN refresh, executed only on GitHub Actions.
// Publishes station/month pairs only after complete-page validation. Never
// exposes a TfNSW token in GitHub Pages data or a browser script.
import fs from 'node:fs';
import path from 'node:path';
import { fetchCkanMonthly, monthlyCsv, CKAN_RESOURCE, CKAN_ENDPOINT } from '../src/lib/ckan-patronage.js';
import { SOURCE_URLS } from '../src/lib/station-patronage.js';

const dir=process.env.DATA_DIR||'data',folder=path.join(dir,'patronage');
const token=process.env.TFNSW_CKAN_TOKEN;
if(!token){
  console.log('TFNSW_CKAN_TOKEN missing: authenticated station patronage refresh skipped, not a build failure.');
  process.exit(0);
}
const result=await fetchCkanMonthly(token);
const file=path.join(folder,'monthly.csv'),provFile=path.join(folder,'provenance.json');
fs.mkdirSync(folder,{recursive:true});
const previous=fs.existsSync(provFile)?JSON.parse(fs.readFileSync(provFile,'utf8')):{};
if(previous.provider && previous.provider!=='Transport for NSW')throw Error('Refusing to modify patronage data from another provider');
const provenance={...previous,provider:'Transport for NSW',monthlySource:SOURCE_URLS.monthly,
  ckanResource:CKAN_RESOURCE,ckanEndpoint:CKAN_ENDPOINT,ckanSourceUpdatedAt:new Date().toISOString(),
  ckanCoverage:result.coverage,
  note:'Station-month total Opal tap events. Suppressed/incomplete station pairs omitted. No hourly/current patronage.'};
const backup=fs.existsSync(file)?fs.readFileSync(file,'utf8'):null;
const newCsv=monthlyCsv(result);
if(backup){
  const oldMonths=[...backup.matchAll(/"(20\d{2}-\d{2})"/g)].map(x=>x[1]).sort();
  const last=oldMonths.at(-1);
  if(last && last>result.coverage.latest)
    throw Error('CKAN latest month '+result.coverage.latest+' predates existing '+last+'; refusing rollback');
}
const staged=file+'.staged';
fs.writeFileSync(staged,newCsv);
fs.renameSync(staged,file);
fs.writeFileSync(provFile,JSON.stringify(provenance,null,2)+'\n');
console.log('Updated official monthly patronage: '+JSON.stringify(result.coverage));
