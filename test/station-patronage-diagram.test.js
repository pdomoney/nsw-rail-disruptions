import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildSchematic} from '../src/lib/schematic.js';
import {buildPatronageRoutes} from '../src/lib/patronage-routes.js';
import {patronageRows,stationDiagramPlan,stationDiagramModel}
  from '../site/station-patronage.js';

const routes=buildPatronageRoutes(buildSchematic().seqs);
const stations=[
  ['c','Central Station',['T4','SCO']],
  ['s','Sutherland Station',['T4','SCO']],
  ['k','Kirrawee Station',['T4']],
  ['cr','Cronulla Station',['T4']],
  ['w','Waterfall Station',['T4','SCO']],
  ['co','Coniston Station',['SCO']],
  ['pk','Port Kembla Station',['SCO']],
  ['bo','Bomaderry (Nowra) Station',['SCO']],
];
const data={monthly:{'2026-09':{
  c:[1000,1300],s:[800,1200],cr:[270,290],
  w:[0,40],co:[250,220],pk:[80,100],bo:[50,60],
}}};
const monthly={period:'monthly',month:'2026-09',metric:'entries',line:'all'};

test('T4 diagram follows the real station order with both Waterfall and Cronulla terminals',()=>{
  const plan=stationDiagramPlan(routes,'T4');
  assert.equal(plan.trunk[0],'Bondi Junction');
  assert.equal(plan.trunk.at(-1),'Waterfall');
  assert.ok(plan.trunk.includes('Erskineville'));
  assert.ok(plan.trunk.includes('Tempe'));
  assert.ok(plan.trunk.includes('Sutherland'));
  assert.equal(plan.branches.length,1);
  assert.equal(plan.branches[0].at,'Sutherland');
  assert.equal(plan.branches[0].stations.at(-1),'Cronulla');
  assert.ok(!plan.branches[0].stations.includes('Waterfall'));
});

test('T4+SCO diagram has independent Cronulla and Port Kembla branches without repeat stops',()=>{
  const plan=stationDiagramPlan(routes,'T4_SCO');
  assert.equal(plan.trunk[0],'Central');
  assert.equal(plan.trunk.at(-1),'Bomaderry (Nowra)');
  assert.deepEqual(plan.branches.map(b=>b.at).sort(),['Coniston','Sutherland']);
  const cronulla=plan.branches.find(b=>b.at==='Sutherland');
  const port=plan.branches.find(b=>b.at==='Coniston');
  assert.equal(cronulla.stations.at(-1),'Cronulla');
  assert.equal(port.stations.at(-1),'Port Kembla');
  assert.ok(!port.stations.includes('Kiama'));
  assert.ok(!cronulla.stations.includes('Waterfall'));
  const observations=patronageRows(data,stations,monthly);
  const model=stationDiagramModel(plan,stations,observations);
  assert.equal(model.nodes.filter(n=>n.name==='Sutherland Station').length,1);
  assert.equal(model.nodes.filter(n=>n.name==='Central Station').length,1);
  assert.equal(model.nodes.filter(n=>n.name==='Cronulla Station').length,1);
  assert.ok(model.paths.length>=3);
  assert.ok(model.nodes.find(n=>n.name==='Cronulla Station').x >
    model.nodes.find(n=>n.name==='Central Station').x);
});

test('diagram overlays real station values, distinguishes published zero, missing pairs, unmatched names',()=>{
  const plan=stationDiagramPlan(routes,'T4');
  const model=stationDiagramModel(plan,stations,patronageRows(data,stations,monthly));
  const central=model.nodes.find(n=>n.id==='c');
  assert.equal(central.value,1000);
  assert.equal(central.entries,1000);
  assert.equal(central.exits,1300);
  const waterfall=model.nodes.find(n=>n.id==='w');
  assert.equal(waterfall.value,0);
  assert.equal(waterfall.unreported,false);
  const kirrawee=model.nodes.find(n=>n.id==='k');
  assert.equal(kirrawee.value,null);
  assert.equal(kirrawee.unreported,true);
  assert.equal(kirrawee.unmatched,false);
  const aMissingCatalogueStop=model.nodes.find(n=>n.name==='Gymea');
  assert.ok(aMissingCatalogueStop);
  assert.equal(aMissingCatalogueStop.value,null);
  assert.equal(aMissingCatalogueStop.unmatched,true);
  assert.equal(model.nodes.filter(n=>n.id==='s').length,1);
  assert.equal(new Set(model.nodes.map(n=>n.name)).size,model.nodes.length);
  assert.ok(model.height>800);
  assert.ok(model.maximum>=1000);
});

test('diagram changes metrics without altering the route and counts stations once',()=>{
  const plan=stationDiagramPlan(routes,'T4_SCO');
  const entries=stationDiagramModel(plan,stations,
    patronageRows(data,stations,{...monthly,metric:'entries'}));
  const exits=stationDiagramModel(plan,stations,
    patronageRows(data,stations,{...monthly,metric:'exits'}));
  const both=stationDiagramModel(plan,stations,
    patronageRows(data,stations,{...monthly,metric:'total'}));
  assert.deepEqual(entries.nodes.map(x=>x.name),exits.nodes.map(x=>x.name));
  assert.deepEqual(exits.nodes.map(x=>x.name),both.nodes.map(x=>x.name));
  assert.equal(entries.nodes.find(x=>x.id==='c').value,1000);
  assert.equal(exits.nodes.find(x=>x.id==='c').value,1300);
  assert.equal(both.nodes.find(x=>x.id==='c').value,2300);
  assert.equal(both.nodes.filter(x=>x.id==='c').length,1);
});

test('ordinary lines use their selected reference route, and absent metadata leaves list fallback',()=>{
  const t1=stationDiagramPlan(routes,'T1');
  assert.ok(t1.trunk.length>5);
  assert.equal(t1.branches.length,0);
  assert.equal(stationDiagramPlan({lines:{},corridors:[]},'T1'),null);
  assert.equal(stationDiagramPlan(routes,'all'),null);
  assert.equal(stationDiagramModel(null,stations,[]),null);
});

test('diagram is an accessible SVG alternative, not an external map or live ridership model',()=>{
  const src=fs.readFileSync(new URL('../site/station-patronage.js',import.meta.url),'utf8');
  const styles=fs.readFileSync(new URL('../site/station-patronage.css',import.meta.url),'utf8');
  assert.match(src,/document\.createElementNS\(svgNs,tag\)/);
  assert.match(src,/aria-pressed/);
  assert.match(src,/e\.key==='Enter'\|\|e\.key===' '/);
  assert.match(src,/Diagram view/);
  assert.match(src,/makeResponsiveStationDiagram\(plan,diagramModel/);
  assert.match(src,/f\.view==='diagram' && diagramModel \? diagramModel\.nodes : listRows/);
  assert.match(styles,/overflow-x:auto/);
  assert.match(styles,/focus-visible/);
  assert.match(styles,/sp-diagram-missing/);
});
