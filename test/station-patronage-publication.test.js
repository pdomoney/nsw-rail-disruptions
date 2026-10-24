import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {buildStationPatronage,readBundledPatronage} from '../src/lib/station-patronage.js';
import {patronageRows} from '../site/station-patronage.js';

const stations=[
  ['central','Central Station',['T1','T2','T4','M1'],[]],
  ['wynyard','Wynyard Station',['T1','T2'],[]],
  ['north-ryde','North Ryde Station',['M1'],[]],
];

test('committed historical snapshots match the user-supplied ZIP and publish real station figures with an ordinary catalogue',()=>{
  const win=readBundledPatronage('typical-periods.csv');
  const monthly=readBundledPatronage('historical-monthly.csv');
  assert.match(win,/Central Station,2023,06-10,7780,31480/);
  assert.match(monthly,/Central Station,2024-10,/);
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'nsw-patronage-bundled-'));
  try{
    // No data-branch folder is required for the historical baseline.
    const p=buildStationPatronage(dir,stations);
    assert.equal(p.available,true,'bundled baseline must not show only a station directory');
    assert.equal(p.coverage.stationCount,3);
    assert.ok(p.coverage.periodRows>30);
    assert.ok(p.coverage.legacyMonthlyRows>100);
    assert.ok(p.coverage.samples.includes('2023'));
    assert.ok(p.coverage.legacyMonths.includes('2024-10'));
    assert.deepEqual(p.periods['2023'].central['06-10'],[7780,31480]);
    const top=patronageRows(p,stations,{period:'windows',sample:'2023',window:'06-10',metric:'entries'});
    assert.ok(top.some(s=>s.name==='Central Station'&&s.value===7780));
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('station no-data screen offers a fresh source reload and displays the build reason',()=>{
  const src=fs.readFileSync(new URL('../site/station-patronage.js',import.meta.url),'utf8');
  assert.ok(src.includes("data.reason ||"));
  assert.ok(src.includes("Refresh published patronage data"));
  assert.ok(src.includes("cache: refresh ? 'no-store' : 'no-cache'"));
  assert.ok(src.includes("'?refresh=' + Date.now()"));
  assert.doesNotMatch(src,/Official station figures not imported yet/);
});

test('build records accurate status and coverage without blocking live data publication',()=>{
  const code=fs.readFileSync(new URL('../src/build.js',import.meta.url),'utf8');
  assert.match(code,/Published Opal station patronage:/);
  assert.match(code,/matchedStations: stationPatronage\.coverage\?\.stationCount/);
  assert.match(code,/historicalStationMonths: stationPatronage\.coverage\?\.legacyMonthlyRows/);
});
