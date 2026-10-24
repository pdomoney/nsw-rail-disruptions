import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildSchematic} from '../src/lib/schematic.js';
import {buildPatronageRoutes,PATRONAGE_CORRIDORS} from '../src/lib/patronage-routes.js';
import {patronageRouteChoice,stationRouteRows,stopNameKey,patronageRows}
  from '../site/station-patronage.js';

const lines={
  T4:[['Bondi Junction','Central','Redfern','Sydenham','Hurstville','Sutherland','Cronulla'],
      ['Sutherland','Loftus','Waterfall']],
  SCO:[['Central','Redfern','Sydenham','Hurstville','Sutherland','Waterfall','Helensburgh','Wollongong','Kiama','Bomaderry (Nowra)']],
};
const routes=buildPatronageRoutes(lines);
const stations=[
  ['cen','Central Station',['T4','SCO'],[]],
  ['red','Redfern Station',['T4','SCO'],[]],
  ['syd','Sydenham Station',['T4','SCO'],[]],
  ['hur','Hurstville Station',['T4','SCO'],[]],
  ['suth','Sutherland Station',['T4','SCO'],[]],
  ['wat','Waterfall Station',['T4','SCO'],[]],
  ['hell','Helensburgh Station',['SCO'],[]],
  ['wol','Wollongong Station',['SCO'],[]],
  ['kia','Kiama Station',['SCO'],[]],
  ['bom','Bomaderry Station',['SCO'],[]],
  ['cro','Cronulla Station',['T4'],[]],
  ['pk','Port Kembla Station',['SCO'],[]],
];
const data={monthly:{'2026-09':{
  cen:[5000,6000],red:[1400,1600],syd:[800,900],hur:[1200,1500],
  suth:[2000,2300],wat:[200,250],hell:[120,110],wol:[1100,1050],
  kia:[300,400],bom:[100,90],cro:[700,650],pk:[220,230],
}}};
const base={period:'monthly',month:'2026-09',metric:'entries',line:'T4_SCO',route:'south-coast',sort:'stops'};

test('connected T4/SCO corridor includes true shared stations followed by intercity-only Coast stations',()=>{
  const result=stationRouteRows(data,stations,routes,{...base,direction:'away'});
  assert.deepEqual(result.map(r=>r.name),[
    'Central Station','Redfern Station','Sydenham Station','Hurstville Station',
    'Sutherland Station','Waterfall Station','Helensburgh Station',
    'Wollongong Station','Kiama Station','Bomaderry Station'
  ]);
  assert.equal(result[0].stopNumber,1);
  assert.ok(result.every((r,i)=>i===0||r.stopNumber>result[i-1].stopNumber));
  assert.equal(result.filter(r=>r.id==='cen').length,1,'a T4+SCO interchange is counted once');
  assert.equal(result.reduce((sum,row)=>sum+(row.value??0),0),12220);
});

test('towards-Central direction reverses physical station order, not Opal direction or values',()=>{
  const outbound=stationRouteRows(data,stations,routes,{...base,direction:'away'});
  const inbound=stationRouteRows(data,stations,routes,{...base,direction:'city'});
  assert.deepEqual(inbound.map(r=>r.id),outbound.map(r=>r.id).reverse());
  assert.equal(inbound[0].name,'Bomaderry Station');
  assert.equal(inbound.at(-1).name,'Central Station');
  assert.deepEqual(new Map(outbound.map(r=>[r.id,r.entries])),
    new Map(inbound.map(r=>[r.id,r.entries])));
  assert.deepEqual(new Map(outbound.map(r=>[r.id,r.exits])),
    new Map(inbound.map(r=>[r.id,r.exits])));
});

test('explicit Cronulla and Port Kembla branches cannot mix unrelated branches',()=>{
  const cronulla=stationRouteRows(data,stations,routes,{...base,route:'cronulla',direction:'away'});
  const port=stationRouteRows(data,stations,routes,{...base,route:'port-kembla',direction:'away'});
  assert.equal(cronulla.at(-1).name,'Cronulla Station');
  assert.equal(port.at(-1).name,'Port Kembla Station');
  assert.ok(!cronulla.some(x=>x.name==='Waterfall Station'));
  assert.ok(!port.some(x=>x.name==='Cronulla Station'));
  assert.ok(!cronulla.some(x=>x.name==='Wollongong Station'));
});

test('route stop-order supports missing data without making missing counts zero',()=>{
  const partial={monthly:{'2026-09':{cen:[100,150],suth:[90,80]}}};
  const rows=stationRouteRows(partial,stations,routes,{...base,direction:'away'});
  assert.equal(rows[0].value,100);
  assert.equal(rows[1].value,null);
  assert.equal(rows[1].entries,null);
  assert.equal(rows[1].exits,null);
  assert.equal(rows.find(r=>r.name==='Sutherland Station').value,90);
  assert.equal(rows.filter(r=>r.value!==null).length,2);
  const ranked=stationRouteRows(partial,stations,routes,{...base,sort:'patronage'});
  assert.deepEqual(ranked.map(r=>r.id),['cen','suth']);
});

test('ordinary line can be sorted by reference route order or original patronage ranking',()=>{
  const ordered=stationRouteRows(data,stations,routes,{
    period:'monthly',month:'2026-09',line:'T4',route:'T4-1',direction:'forward',sort:'stops'});
  assert.deepEqual(ordered.map(r=>r.name),[
    'Central Station','Redfern Station','Sydenham Station','Hurstville Station','Sutherland Station','Cronulla Station'
  ]);
  const reverse=stationRouteRows(data,stations,routes,{
    period:'monthly',month:'2026-09',line:'T4',route:'T4-1',direction:'reverse',sort:'stops'});
  assert.deepEqual(reverse.map(r=>r.id),ordered.map(r=>r.id).reverse());
  const ranked=patronageRows(data,stations,{period:'monthly',month:'2026-09',line:'T4'});
  assert.equal(ranked[0].name,'Central Station');
  assert.equal(ranked[1].name,'Sutherland Station');
});

test('searching stations preserves their physical route position, and never creates fake missing stations',()=>{
  const search=stationRouteRows(data,stations,routes,{...base,direction:'away',search:'suther'});
  assert.equal(search.length,1);
  assert.equal(search[0].name,'Sutherland Station');
  assert.ok(search[0].stopNumber>1);
  assert.equal(stopNameKey('Bomaderry (Nowra)'),stopNameKey('Bomaderry Station'));
  const unknown=stationRouteRows(data,stations,routes,{...base,route:'unknown'});
  assert.equal(unknown[0].name,'Central Station','unknown choice falls back to first route without guessing a new route');
});

test('all-line patronage sorting remains available when a route is not selected',()=>{
  const all=stationRouteRows(data,stations,routes,{period:'monthly',month:'2026-09',line:'all'});
  assert.equal(all[0].name,'Central Station');
  assert.ok(all.every(row=>row.value!=null));
  const selection=patronageRouteChoice(routes,'T4_SCO','south-coast');
  assert.deepEqual(selection.item.lines,['T4','SCO']);
  assert.equal(PATRONAGE_CORRIDORS.length,1);
});

test('site build exposes ordered stations for each railway line without using arbitrary map XY',()=>{
  const generated=buildPatronageRoutes(buildSchematic().seqs);
  assert.ok(generated.lines.T4.some(route=>route.stations.includes('Sutherland')));
  assert.ok(generated.lines.SCO.some(route=>route.stations.includes('Wollongong')));
  assert.ok(generated.lines.T1.length>0);
  assert.ok(generated.corridors[0].routes.some(route=>route.id==='port-kembla'));
  const build=fs.readFileSync(new URL('../src/build.js',import.meta.url),'utf8');
  assert.match(build,/writeJson\(out\('data', 'station-routes\.json'\), buildPatronageRoutes\(SCH\.seqs\)\)/);
});

test('direction control does not imply inferred directional passenger counts',()=>{
  const src=fs.readFileSync(new URL('../site/station-patronage.js',import.meta.url),'utf8');
  assert.match(src,/Towards Central \(stop order\)/);
  assert.match(src,/Away from Central \(stop order\)/);
  assert.match(src,/Station counts have no journey origin, destination or citybound\/coastbound field/);
  assert.match(src,/No published station entry\/exit pair/);
});
