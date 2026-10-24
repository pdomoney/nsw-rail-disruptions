import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeStationPatronage,SOURCE_URLS} from '../src/lib/station-patronage.js';
import {patronageRows} from '../site/station-patronage.js';
// Source-verified 2023 Central/Wynyard and 2020 Central values from the
// uploaded TfNSW "train-station-entries-and-exits-version-2.2.xlsx", not
// generated interpolation and not live hourly records.
const stations=[
  ['central','Central Station',['T1','T4','M1'],[]],
  ['wynyard','Wynyard Station',['T1','T2'],[]],
];
const lines=[
  'station,sample,period,entries,exits',
  'Central Station,2023,06-10,7780,31480',
  'Central Station,2023,10-15,13860,17880',
  'Central Station,2023,15-19,32330,15970',
  'Central Station,2023,19-06,15970,7430',
  'Central Station,2023,24h,69940,72760',
  'Wynyard Station,2023,06-10,4210,43070',
  'Wynyard Station,2023,15-19,37440,11320',
  'Wynyard Station,2023,24h,68170,70540',
  'Central Station,Feb 2020,06-10,13120,54070',
  'Central Station,Feb 2020,24h,106980,107280',
  'Central Station,May 2020,06-10,2910,6960',
  'Central Station,May 2020,24h,17750,17610',
  'Central Station,Sep 2020,06-10,5800,18330',
  'Central Station,Sep 2020,24h,42920,42730',
].join('\n')+'\n';
const data=normalizeStationPatronage({stations,periodsCsv:lines,
  provenance:{provider:'Transport for NSW',periodSource:SOURCE_URLS.typical}});

test('TfNSW 2023 Central official workbook figures keep morning/afternoon directionality',()=>{
  assert.deepEqual(data.periods['2023'].central['06-10'],[7780,31480]);
  assert.deepEqual(data.periods['2023'].central['15-19'],[32330,15970]);
  assert.deepEqual(data.periods['2023'].central['24h'],[69940,72760]);
  assert.deepEqual(data.periods['2023'].wynyard['06-10'],[4210,43070]);
  assert.deepEqual(data.periods['2023'].wynyard['15-19'],[37440,11320]);
  const morning=patronageRows(data,stations,{period:'windows',sample:'2023',window:'06-10',metric:'exits'});
  assert.equal(morning[0].name,'Wynyard Station');
  assert.equal(morning[0].value,43070);
  assert.equal(morning[1].value,31480);
});

test('2020 COVID phase samples remain independent, not merged into a typical 2020',()=>{
  assert.deepEqual(data.periods['Feb 2020'].central['24h'],[106980,107280]);
  assert.deepEqual(data.periods['May 2020'].central['24h'],[17750,17610]);
  assert.deepEqual(data.periods['Sep 2020'].central['24h'],[42920,42730]);
  assert.equal(data.periods['2020'],undefined);
  const months=['Feb 2020','May 2020','Sep 2020'].map(sample=>
    patronageRows(data,stations,{period:'windows',sample,window:'24h'})[0].entries);
  assert.deepEqual(months,[106980,17750,42920]);
});
