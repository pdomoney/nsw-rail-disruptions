import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {recentMonthlyStatus} from '../site/station-patronage.js';
import {normalizeStationPatronage,SOURCE_URLS} from '../src/lib/station-patronage.js';

test('station patronage clearly identifies absent post-2024 monthly data',()=>{
  const status=recentMonthlyStatus({coverage:{months:[],legacyMonths:['2024-10']}});
  assert.equal(status.hasRecent,false);
  assert.equal(status.latestMonth,null);
  assert.match(status.title,/not connected/);
  assert.match(status.details,/October 2024/);
  assert.match(status.details,/authenticated CKAN/);
});

test('shows actual latest passenger month, not repository sync date or present month',()=>{
  const status=recentMonthlyStatus({coverage:{months:['2025-12','2026-08','2026-03']},
    recentImportAt:'2026-10-24T10:00:00Z'});
  assert.equal(status.hasRecent,true);
  assert.equal(status.latestMonth,'2026-08');
  assert.match(status.title,/2026-08/);
  assert.match(status.details,/Last successful import:/);
  assert.doesNotMatch(status.title,/2026-10/);
});

test('modern monthly provenance records the import timestamp separately from the month itself',()=>{
  const p=normalizeStationPatronage({
    stations:[['central','Central Station',['T1'],[]]],
    monthlyCsv:'station,month,entries,exits\nCentral Station,2026-08,100,120\n',
    provenance:{provider:'Transport for NSW',monthlySource:SOURCE_URLS.monthly,
      ckanSourceUpdatedAt:'2026-10-24T10:00:00Z',
      ckanResource:'f8bb2918-0540-4bb3-9ccf-f7aef04d4249'}
  });
  assert.equal(p.available,true);
  assert.deepEqual(p.coverage.months,['2026-08']);
  assert.equal(p.recentImportAt,'2026-10-24T10:00:00Z');
  assert.equal(recentMonthlyStatus(p).latestMonth,'2026-08');
});

test('recent month is the default choice once data exists, historical periods stay accessible',()=>{
  const src=fs.readFileSync(new URL('../site/station-patronage.js',import.meta.url),'utf8');
  assert.match(src,/period: months\.length \? 'monthly'/);
  assert.match(src,/samples\.length \? 'windows'/);
  assert.match(src,/\['historical','Monthly history 2016–2024'\]/);
  assert.match(src,/Recent monthly totals/);
});

test('manual scheduled refresh cannot claim success when the secret is missing',()=>{
  const workflow=fs.readFileSync(new URL('../.github/workflows/opal-patronage.yml',import.meta.url),'utf8');
  assert.match(workflow,/Check TfNSW CKAN access configuration/);
  assert.match(workflow,/TFNSW_CKAN_TOKEN: \$\{\{ secrets\.TFNSW_CKAN_TOKEN \}\}/);
  assert.match(workflow,/Recent station patronage cannot refresh/);
  assert.match(workflow,/GITHUB_EVENT_NAME/);
  assert.match(workflow,/workflow_dispatch.*exit 1/);
  assert.match(workflow,/if: steps\.credentials\.outputs\.configured == 'true'/);
});
