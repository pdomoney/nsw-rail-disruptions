import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildSchematic } from '../src/lib/schematic.js';
import { buildPatronageRoutes } from '../src/lib/patronage-routes.js';
import { stationDiagramPlan, stationDiagramModel, makeStationDiagram, patronageRows }
  from '../site/station-patronage.js';

const routes=buildPatronageRoutes(buildSchematic().seqs);
const catalogue=[
  ['cen','Central Station',['T4','SCO']],
  ['suth','Sutherland Station',['T4','SCO']],
  ['water','Waterfall Station',['T4','SCO']],
  ['cron','Cronulla Station',['T4']],
  ['wol','Wollongong Station',['SCO']],
  ['bom','Bomaderry (Nowra) Station',['SCO']],
  ['pk','Port Kembla Station',['SCO']],
];
const data={monthly:{'2026-09':{
  cen:[1234,1578],suth:[340,450],water:[20,30],
  cron:[250,310],wol:[710,910],bom:[72,84],pk:[105,140],
}}};
const observations=patronageRows(data,catalogue,{period:'monthly',month:'2026-09',metric:'entries'});

test('T4 diagram flip reverses station coordinates but not station names, patronage or branch IDs',()=>{
  const plan=stationDiagramPlan(routes,'T4');
  const a=stationDiagramModel(plan,catalogue,observations);
  const b=stationDiagramModel(plan,catalogue,observations,{flip:true});
  assert.equal(a.flipped,false);
  assert.equal(b.flipped,true);
  assert.equal(a.first,'Bondi Junction');
  assert.equal(a.last,'Waterfall');
  assert.equal(b.first,a.first);
  assert.equal(b.last,a.last);
  assert.deepEqual(a.nodes.map(n=>[n.id,n.name,n.value,n.entries,n.exits]),
    b.nodes.map(n=>[n.id,n.name,n.value,n.entries,n.exits]));
  assert.equal(a.nodes.length,b.nodes.length);
  assert.equal(a.height,b.height);
  assert.equal(a.width,b.width);
  assert.equal(a.maximum,b.maximum);
  const axis=a.nodes[0].y+b.nodes[0].y;
  for(let i=0;i<a.nodes.length;i++){
    assert.equal(a.nodes[i].x,b.nodes[i].x,'horizontal position must remain');
    assert.equal(a.nodes[i].y+b.nodes[i].y,axis,'all branch and trunk stops must mirror about one axis');
  }
  assert.ok(b.nodes.find(n=>n.name==='Waterfall Station').y <
    b.nodes.find(n=>n.name==='Central Station').y,
    'flipped diagram must visually run from Waterfall to Central, not just relabel the arrow');
  assert.equal(a.paths.length,b.paths.length);
  assert.ok(b.paths.every(p=>p.transform?.includes('scale(1 -1)')));
  assert.ok(a.paths.every(p=>p.transform===undefined));
});

test('connected T4/SCO reverses shared approach with Cronulla and Port Kembla branches still connected',()=>{
  const plan=stationDiagramPlan(routes,'T4_SCO');
  const a=stationDiagramModel(plan,catalogue,observations);
  const b=stationDiagramModel(plan,catalogue,observations,{flip:true});
  assert.equal(plan.branches.length,2);
  assert.equal(b.nodes.filter(n=>n.name==='Central Station').length,1);
  assert.equal(b.nodes.filter(n=>n.name==='Sutherland Station').length,1);
  assert.equal(b.nodes.filter(n=>n.name==='Cronulla Station').length,1);
  assert.equal(b.nodes.filter(n=>n.name==='Port Kembla Station').length,1);
  assert.equal(b.nodes.find(n=>n.name==='Bomaderry (Nowra) Station').value,72);
  assert.ok(b.nodes.find(n=>n.name==='Bomaderry (Nowra) Station').y<
    b.nodes.find(n=>n.name==='Central Station').y);
  assert.equal(a.paths.length,b.paths.length);
  assert.equal(a.nodes.reduce((n,r)=>n+(r.value??0),0),
    b.nodes.reduce((n,r)=>n+(r.value??0),0),
    'flipping must not increase total tap events by counting shared stops twice');
});

class FakeNode {
  constructor(tag){this.tag=tag;this.attrs={};this.children=[];this.handlers={};}
  setAttribute(k,v){this.attrs[k]=String(v);}
  append(...nodes){this.children.push(...nodes);}
  addEventListener(type,listener){this.handlers[type]=listener;}
}
function traverse(n, predicate,out=[]){
  if(predicate(n))out.push(n);
  for(const c of n.children||[])traverse(c,predicate,out);
  return out;
}
test('SVG labels and value text remain upright during flip; tap/keyboard selection still functions',()=>{
  const savedDocument=globalThis.document,savedNode=globalThis.Node;
  globalThis.Node=FakeNode;
  globalThis.document={
    createElementNS:(_ns,tag)=>new FakeNode(tag),
    createTextNode:text=>{const node=new FakeNode('#text');node.value=String(text);return node;}
  };
  try{
    const plan=stationDiagramPlan(routes,'T4');
    const model=stationDiagramModel(plan,catalogue,observations,{flip:true});
    let selected=null;
    const svg=makeStationDiagram(model,{name:plan.name,metric:'entries',selectedId:null,
      onSelect:st=>{selected=st;}});
    const paths=traverse(svg,n=>n.tag==='path');
    assert.equal(paths.length,model.paths.length);
    assert.ok(paths.every(n=>n.attrs.transform.includes('scale(1 -1)')));
    const names=traverse(svg,n=>n.attrs.class==='sp-diagram-label');
    assert.ok(names.length>10);
    assert.ok(names.every(n=>!n.attrs.transform),'station names must NOT be flipped upside down');
    const values=traverse(svg,n=>n.attrs.class==='sp-diagram-value');
    assert.ok(values.every(n=>!n.attrs.transform));
    const groups=traverse(svg,n=>n.attrs['data-station-id']==='cen');
    assert.equal(groups.length,1);
    groups[0].handlers.keydown({key:'Enter',preventDefault(){}});
    assert.equal(selected.name,'Central Station');
    assert.equal(selected.value,1234);
    groups[0].handlers.click();
    assert.equal(selected.entries,1234);
    assert.equal(groups[0].attrs['aria-pressed'],'true');
    const badges=traverse(svg,n=>n.attrs.class==='sp-diagram-line-code');
    assert.equal(badges.length,1);
    assert.equal(badges[0].children[0].value,'T4');
  }finally{
    globalThis.Node=savedNode;
    globalThis.document=savedDocument;
  }
});

test('diagram includes a real, accessible flip control rather than a hidden list-only selector',()=>{
  const ui=fs.readFileSync(new URL('../site/station-patronage.js',import.meta.url),'utf8');
  const css=fs.readFileSync(new URL('../site/station-patronage.css',import.meta.url),'utf8');
  assert.match(ui,/diagramFlip:false/);
  assert.match(ui,/f\.view=v!=='all'&&patronageRouteChoice\(routes,v,''\)\.route\?'diagram':'list'/,
    'a selected rail corridor must reveal the new picture by default, with list fallback');
  assert.match(ui,/flip:f\.diagramFlip/);
  assert.match(ui,/f\.diagramFlip=!f\.diagramFlip/);
  assert.match(ui,/sp-diagram-flip/);
  assert.match(ui,/aria-pressed.*f\.diagramFlip/);
  assert.match(ui,/Main corridor: '\+topStation\+' → '\+bottomStation/);
  assert.match(css,/\.sp-diagram-flip:focus-visible/);
  assert.match(css,/\.sp-diagram-toolbar/);
});
