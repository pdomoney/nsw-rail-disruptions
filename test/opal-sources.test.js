import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {normalizeMonthlySource,parseOpalCount,fetchCkanMonthly,monthlyCsv,CKAN_RESOURCE,CKAN_ENDPOINT}
  from '../src/lib/ckan-patronage.js';
import {normalizeStationPatronage,buildStationPatronage,SOURCE_URLS,LEGACY_MONTHLY_SOURCES}
  from '../src/lib/station-patronage.js';
import {patronageRows} from '../site/station-patronage.js';
const stations=[['central','Central Station',['T1','T4','M1'],[]],
  ['wy','Wynyard Station',['T1','T2'],[]],['metro','North Ryde Station',['M1'],[]]];
const prov={provider:'Transport for NSW',periodSource:SOURCE_URLS.typical,
  legacyMonthlySources:LEGACY_MONTHLY_SOURCES};
const windows=[
  'station,sample,period,entries,exits',
  'Central Station,2023,06-10,5400,1800',
  'Central Station,2023,10-15,2000,2400',
  'Central Station,2023,15-19,3100,6700',
  'Central Station,2023,19-06,800,1200',
  'Central Station,2023,24h,11300,12100',
  'Wynyard Station,2023,06-10,2200,600',
  'Central Station,Feb 2020,06-10,4600,1000',
  'Central Station,May 2020,06-10,200,100',
  'Central Station,Sep 2020,06-10,600,200',
].join('\n')+'\n';
const history=[
  'station,month,entries,exits',
  'Central Station,2016-07,100000,101000',
  'Central Station,2024-10,450000,500000',
  'Wynyard Station,2024-10,8500,9000',
].join('\n')+'\n';
const raw=(month,station,dir,value,type='Train')=>({
  MonthYear:month,Station:station,Station_Type:type,Entry_Exit:dir,Trip:value
});

test('supplied historical Excel source uses broad windows, not fabricated per-hour 2023 data',()=>{
  const data=normalizeStationPatronage({stations,periodsCsv:windows,legacyMonthlyCsv:history,provenance:prov});
  assert.equal(data.available,true);
  assert.equal(data.coverage.periodRows,9);
  assert.equal(data.coverage.legacyMonthlyRows,3);
  assert.deepEqual(data.coverage.samples,['Feb 2020','May 2020','Sep 2020','2023']);
  assert.deepEqual(data.coverage.legacyMonths,['2016-07','2024-10']);
  assert.deepEqual(data.periods['2023'].central['06-10'],[5400,1800]);
  assert.deepEqual(data.periods['2023'].central['24h'],[11300,12100]);
  assert.equal(data.typical['2023'],undefined);
  assert.equal(patronageRows(data,stations,{period:'windows',sample:'2023',window:'06-10'})[0].value,5400);
  assert.equal(patronageRows(data,stations,{period:'windows',sample:'2023',window:'24h'})[0].value,11300);
  assert.equal(patronageRows(data,stations,{period:'historical',month:'2024-10'})[0].value,450000);
  assert.equal(patronageRows(data,stations,{period:'monthly',month:'2024-10'}).length,0);
  assert.equal(patronageRows(data,stations,{period:'windows',sample:'2023',window:'11'}).length,0,
    'A 1-hour point may not be inferred from the published four-hour period');
});

test('station/line intersection does not double-count train/metro transfer hubs',()=>{
  const data=normalizeStationPatronage({stations,periodsCsv:windows,provenance:prov});
  const all=patronageRows(data,stations,{period:'windows',sample:'2023',window:'06-10'});
  assert.equal(all.length,2);
  assert.equal(all.reduce((total,x)=>total+x.entries,0),7600);
  assert.equal(patronageRows(data,stations,{period:'windows',sample:'2023',window:'06-10',line:'M1'}).length,1);
  assert.equal(patronageRows(data,stations,{period:'windows',sample:'2023',window:'06-10',line:'T1'}).length,2);
});

test('do not treat nonexistent windows or source year as valid',()=>{
  assert.throws(()=>normalizeStationPatronage({stations,periodsCsv:windows.replace('2023,06-10','2025,06-10'),provenance:prov}),/Unexpected/);
  assert.throws(()=>normalizeStationPatronage({stations,periodsCsv:windows.replace('06-10','08:00'),provenance:prov}),/Unexpected/);
  assert.throws(()=>normalizeStationPatronage({stations,periodsCsv:windows+'Central,2023,06-10,10,20\n',provenance:prov}),/Duplicate/);
  assert.throws(()=>normalizeStationPatronage({stations,legacyMonthlyCsv:history,provenance:{...prov,legacyMonthlySources:[]}}),/source URLs/);
  assert.throws(()=>normalizeStationPatronage({stations,periodsCsv:windows.replace(',5400,1800',',-,1800'),provenance:prov}),/Invalid or absent/);
});

test('reads optional normalized imported source files in data branch',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'nrd-opal-real-'));
  try {
    const folder=path.join(dir,'patronage');fs.mkdirSync(folder);
    fs.writeFileSync(path.join(folder,'typical-periods.csv'),windows);
    fs.writeFileSync(path.join(folder,'historical-monthly.csv'),history);
    fs.writeFileSync(path.join(folder,'provenance.json'),JSON.stringify(prov));
    assert.equal(buildStationPatronage(dir,stations).coverage.stationCount,2);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('CKAN DataStore historical blanks and suppressed <50 are not zeros',()=>{
  assert.deepEqual(parseOpalCount('Less than 50'),{count:null,suppressed:true});
  assert.deepEqual(parseOpalCount('52,300'),{count:52300,suppressed:false});
  assert.throws(()=>parseOpalCount('-'),/Unrecognised/);
  const rows=[
    raw('2024-10','Central Station','Entry','10'),
    raw('2024-11','Central Station','Entries','52300'),
    raw('2024-11','Central Station','Exits','51400'),
    raw('2024-11','Small Station','Entry','Less than 50'),
    raw('2024-11','Small Station','Exit','49'),
    raw('2024-12','North Ryde Station','Entry','600','Metro'),
    raw('2024-12','North Ryde Station','Exit','660','Metro'),
  ];
  const out=normalizeMonthlySource(rows);
  assert.equal(out.coverage.completeStationMonths,2);
  assert.equal(out.coverage.suppressedCells,1);
  assert.equal(out.coverage.incompleteStationMonths,1);
  assert.equal(out.coverage.earliest,'2024-11');
  assert.equal(out.coverage.latest,'2024-12');
  assert.deepEqual(out.rows.map(r=>[r.station,r.month,r.entries,r.exits]),
    [['Central Station','2024-11',52300,51400],['North Ryde Station','2024-12',600,660]]);
  assert.match(monthlyCsv(out),/station,month,entries,exits/);
  assert.ok(!monthlyCsv(out).includes('Small Station'));
  assert.throws(()=>normalizeMonthlySource([...rows,raw('2024-11','Central Station','Entry','20')]),/Duplicate/);
});

test('CKAN client paginates all records, sends token to server only and rejects incomplete or unauthorised data',async()=>{
  const records=[
    raw('2026-09','Central','Entry','111'),raw('2026-09','Central','Exit','120'),
    raw('2026-10','Wynyard','Entry','122'),raw('2026-10','Wynyard','Exit','121')];
  const calls=[];
  const fetcher=async(url,req)=>{
    calls.push({url,req});
    const {resource_id,limit,offset}=JSON.parse(req.body);
    assert.equal(resource_id,CKAN_RESOURCE);assert.equal(limit,2);
    return {ok:true,json:async()=>({success:true,result:{total:records.length,records:records.slice(offset,offset+limit)}})};
  };
  const data=await fetchCkanMonthly('secret-test-value',{fetcher,pageSize:2});
  assert.equal(data.rows.length,2);
  assert.equal(calls.length,2);
  assert.ok(calls.every(x=>x.url===CKAN_ENDPOINT&&x.req.headers.Authorization==='secret-test-value'));
  assert.ok(calls.every(x=>!x.req.body.includes('secret-test-value')));
  await assert.rejects(fetchCkanMonthly('bad',{fetcher:async()=>({ok:false,status:401}),pageSize:2}),/HTTP 401/);
  await assert.rejects(fetchCkanMonthly('bad',{fetcher:async()=>({ok:true,json:async()=>({success:false})}),pageSize:2}),/Unexpected/);
});
