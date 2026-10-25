import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {annualStationPatronage,patronageRows,stationDiagramModel,
  stationRouteRows} from '../site/station-patronage.js';

const stationRows=[
  ['central','Central Station',['T1','T4','SCO']],
  ['rockdale','Rockdale Station',['T4','SCO']],
  ['carlton','Carlton Station',['T4']],
  ['masked','Masked Station',['T4']],
];

const recent={};
for(let i=1;i<=12;i++){
  const month='2025-'+String(i).padStart(2,'0');
  recent[month]={
    central:[1000,500],rockdale:[200,100],carlton:[80,40],
    ...(i===6?{}:{masked:[60,30]}),
  };
}
for(let i=1;i<=9;i++){
  const month='2026-'+String(i).padStart(2,'0');
  recent[month]={central:[100,200],rockdale:[20,10],carlton:[10,5]};
}
recent['2024-11']={central:[700,800]};
recent['2024-12']={central:[900,950]};
const legacy={};
for(let i=1;i<=10;i++){
  const month='2024-'+String(i).padStart(2,'0');
  legacy[month]={central:[200,300],rockdale:[50,60]};
}
const data={monthly:recent,legacyMonthly:legacy};
const latest=annualStationPatronage(data,'monthly');
const history=annualStationPatronage(data,'legacyMonthly');
const viewData={...data,annualMonthly:latest.totals,annualLegacyMonthly:history.totals};

test('aggregates 12 complete calendar months into exact annual entries and exits',()=>{
  assert.deepEqual(latest.years,['2024','2025','2026']);
  assert.equal(latest.coverage['2025'].completeYear,true);
  assert.equal(latest.coverage['2025'].monthCount,12);
  assert.equal(latest.coverage['2025'].publishedStations,3);
  assert.equal(latest.coverage['2025'].missingStationCount,1);
  assert.deepEqual(latest.totals['2025'].central,[12000,6000]);
  assert.deepEqual(latest.totals['2025'].rockdale,[2400,1200]);
  assert.deepEqual(latest.totals['2025'].carlton,[960,480]);
  assert.equal(latest.totals['2025'].masked,undefined,
    'missing June cannot be converted into zero or an understated annual figure');
  const rows=patronageRows(viewData,stationRows,{
    period:'annual',annualYear:'2025',metric:'total'});
  assert.deepEqual(rows.map(r=>[r.id,r.entries,r.exits,r.value]),[
    ['central',12000,6000,18000],
    ['rockdale',2400,1200,3600],
    ['carlton',960,480,1440],
  ]);
  assert.equal(rows.filter(r=>r.id==='central').length,1,
    'shared interchange is counted once, never once per railway line');
});

test('partial calendar year is labelled partial, never a full-year estimate',()=>{
  const coverage=latest.coverage['2026'];
  assert.equal(coverage.completeYear,false);
  assert.equal(coverage.monthCount,9);
  assert.equal(coverage.months[0],'2026-01');
  assert.equal(coverage.months.at(-1),'2026-09');
  assert.deepEqual(latest.totals['2026'].central,[900,1800],
    'no annual extrapolation for October through December');
  assert.equal(latest.coverage['2024'].monthCount,2);
  assert.equal(latest.coverage['2024'].completeYear,false);
  assert.deepEqual(latest.totals['2024'].central,[1600,1750]);
});

test('historical and recent 2024 series are never silently stitched across distinct reporting methods',()=>{
  assert.deepEqual(history.years,['2024']);
  assert.equal(history.coverage['2024'].monthCount,10);
  assert.equal(history.coverage['2024'].completeYear,false);
  assert.deepEqual(history.totals['2024'].central,[2000,3000]);
  assert.deepEqual(latest.totals['2024'].central,[1600,1750]);
  const historicalRows=patronageRows(viewData,stationRows,{
    period:'historical-annual',annualYear:'2024',metric:'total'});
  const recentRows=patronageRows(viewData,stationRows,{
    period:'annual',annualYear:'2024',metric:'total'});
  assert.equal(historicalRows[0].value,5000);
  assert.equal(recentRows[0].value,3350);
  assert.equal(historicalRows.some(row=>row.id==='carlton'),false);
});

test('annual entries, exits and combined counts follow selected measure and route',()=>{
  for(const [metric,expected] of [
    ['entries',12000],['exits',6000],['total',18000]]){
    const rows=patronageRows(viewData,stationRows,{
      period:'annual',annualYear:'2025',metric,line:'T1'});
    assert.deepEqual(rows.map(r=>r.value),[expected]);
  }
  const routes={
    lines:{T4:[{id:'test-t4',stations:['Central','Rockdale','Carlton','Masked']}]},
  };
  const ordered=stationRouteRows(viewData,stationRows,routes,{
    period:'annual',annualYear:'2025',metric:'total',line:'T4',sort:'stops'});
  assert.deepEqual(ordered.map(r=>[r.id,r.value]),[
    ['central',18000],['rockdale',3600],['carlton',1440],['masked',null],
  ]);
  const diagram=stationDiagramModel(
    {line:'T4',trunk:['Central','Rockdale','Carlton','Masked'],branches:[]},
    stationRows,patronageRows(viewData,stationRows,{
      period:'annual',annualYear:'2025',metric:'total'}));
  assert.equal(diagram.nodes.find(r=>r.id==='central').value,18000);
  assert.equal(diagram.nodes.find(r=>r.id==='central').hubExcludedFromScale,true);
  assert.equal(diagram.nodes.find(r=>r.id==='rockdale').hubExcludedFromScale,false);
  assert.equal(diagram.nodes.find(r=>r.id==='masked').value,null);
});

test('published zero is a valid annual count but absent and invalid station months are not',()=>{
  const series={
    '2025-01':{zero:[0,0],missing:[40,20],unsafe:[5,10]},
    '2025-02':{zero:[0,0],unsafe:[Infinity,10]},
  };
  const grouped=annualStationPatronage({monthly:series});
  assert.deepEqual(grouped.totals['2025'].zero,[0,0]);
  assert.equal(grouped.totals['2025'].missing,undefined);
  assert.equal(grouped.totals['2025'].unsafe,undefined);
  assert.equal(grouped.coverage['2025'].missingStationCount,2);
  assert.throws(()=>annualStationPatronage(data,'typical'),/Only verified/);
  assert.deepEqual(annualStationPatronage({monthly:{}}).years,[]);
});

test('mobile UI exposes separate annual datasets and defaults to entries plus exits',()=>{
  const source=fs.readFileSync(new URL('../site/station-patronage.js',import.meta.url),'utf8');
  const css=fs.readFileSync(new URL('../site/station-patronage.css',import.meta.url),'utf8');
  assert.match(source,/metric: 'total', line: 'all'/);
  assert.match(source,/\['historical-annual','Annual history 2016–2024'\]/);
  assert.match(source,/\['annual','Recent annual totals'\]/);
  assert.match(source,/field\('Calendar year'/);
  assert.match(source,/monthCount:months\.length/);
  assert.match(source,/Stations missing any included month are shown as unavailable/);
  assert.match(source,/Sources use different methods and are never mixed/);
  assert.match(source,/stationRouteRows\(displayData/);
  assert.match(source,/patronageRows\(displayData/);
  assert.match(source,/annualMode\?node\('p',\{class:'sp-annual-note',role:'status'\}/);
  assert.match(css,/\.sp-annual-note \{/);
});
