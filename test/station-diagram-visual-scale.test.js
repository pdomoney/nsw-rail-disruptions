import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {LINES} from '../src/config/lines.js';
import {buildSchematic} from '../src/lib/schematic.js';
import {buildPatronageRoutes} from '../src/lib/patronage-routes.js';
import {stationDiagramPlan,stationDiagramModel,makeStationDiagram,patronageRows}
  from '../site/station-patronage.js';

const routes=buildPatronageRoutes(buildSchematic().seqs);
const colors=Object.fromEntries(LINES.map(l=>[l.id,l.color]));
const stations=[
  ['cen','Central Station',['T4','SCO']],
  ['suth','Sutherland Station',['T4','SCO']],
  ['water','Waterfall Station',['T4','SCO']],
  ['cron','Cronulla Station',['T4']],
  ['wol','Wollongong Station',['SCO']],
  ['bom','Bomaderry (Nowra) Station',['SCO']],
  ['pk','Port Kembla Station',['SCO']],
  ['mega','Tallawong Station',['M1']],
];
const sample={monthly:{'2026-09':{
  cen:[1500,1650],suth:[900,1100],water:[240,260],
  cron:[180,250],wol:[800,990],bom:[60,70],pk:[100,90],
  mega:[1000000,1000000],
}}};
const observed=patronageRows(sample,stations,{period:'monthly',month:'2026-09',metric:'entries'});

test('diagram marker scale considers its own corridor, not an unrelated mega station',()=>{
  const plan=stationDiagramPlan(routes,'T4');
  const a=stationDiagramModel(plan,stations,observed);
  const noMega=stationDiagramModel(plan,stations,
    observed.filter(r=>r.id!=='mega'));
  assert.equal(a.maximum,1500,'Central is busiest among the plotted T4 stops');
  assert.equal(a.maximum,noMega.maximum);
  assert.deepEqual(a.nodes.map(n=>[n.id,n.value,n.intensity]),
    noMega.nodes.map(n=>[n.id,n.value,n.intensity]));
  assert.equal(a.nodes.find(n=>n.id==='cen').intensity,1);
  assert.ok(a.nodes.find(n=>n.id==='suth').intensity>0.7);
  assert.equal(a.nodes.find(n=>n.id==='mega'),undefined);
});

test('the connected South Coast branch uses each named route segment, never rider direction',()=>{
  const plan=stationDiagramPlan(routes,'T4_SCO');
  const a=stationDiagramModel(plan,stations,observed);
  const b=stationDiagramModel(plan,stations,observed,{flip:true});
  assert.equal(a.maximum,1500);
  const spine=a.paths.filter(p=>!p.branch);
  assert.equal(spine.length,2,'combined corridor has T4 shared approach and SCO continuation');
  assert.deepEqual(spine.map(p=>p.service),['T4','SCO']);
  assert.deepEqual(a.paths.filter(p=>p.branch).map(p=>p.service).sort(),['SCO','T4']);
  assert.equal(a.nodes.find(n=>n.id==='cron').service,'T4');
  assert.equal(a.nodes.find(n=>n.id==='pk').service,'SCO');
  assert.equal(a.nodes.find(n=>n.id==='bom').service,'SCO');
  assert.equal(b.maximum,a.maximum);
  assert.deepEqual(b.nodes.map(n=>[n.id,n.service,n.value,n.intensity]),
    a.nodes.map(n=>[n.id,n.service,n.value,n.intensity]));
  assert.ok(b.paths.every(p=>p.transform?.includes('scale(1 -1)')));
});

class FakeNode {
  constructor(tag){this.tag=tag;this.attrs={};this.children=[];this.handlers={};}
  setAttribute(k,v){this.attrs[k]=String(v);}
  append(...items){this.children.push(...items);}
  addEventListener(event,callback){this.handlers[event]=callback;}
}
function select(node,predicate,found=[]){
  if(predicate(node))found.push(node);
  for(const child of node.children||[])select(child,predicate,found);
  return found;
}
test('SVG badges and track colours follow metadata, including non-T4 lines and both corridor labels',()=>{
  const originalDoc=globalThis.document, originalNode=globalThis.Node;
  globalThis.Node=FakeNode;
  globalThis.document={
    createElementNS:(_ns,tag)=>new FakeNode(tag),
    createTextNode:value=>{const n=new FakeNode('#text');n.value=String(value);return n;}
  };
  try{
    const t1=stationDiagramModel(stationDiagramPlan(routes,'T1'),stations,observed);
    const t1Svg=makeStationDiagram(t1,{name:'T1',metric:'entries',colors,onSelect(){}});
    const t1Badge=select(t1Svg,n=>n.attrs.class==='sp-diagram-line-badge');
    assert.equal(t1Badge.length,1);
    assert.match(t1Badge[0].attrs.style,/--sp-badge-colour:#F99D1C/);
    assert.ok(select(t1Svg,n=>n.tag==='path').every(p=>p.attrs.stroke===colors.T1));
    const coast=stationDiagramModel(stationDiagramPlan(routes,'T4_SCO'),stations,observed);
    const coastSvg=makeStationDiagram(coast,{name:'T4+SCO',metric:'entries',colors,onSelect(){}});
    const badges=select(coastSvg,n=>n.attrs.class==='sp-diagram-line-code');
    assert.deepEqual(badges.map(n=>n.children[0].value),['T4','SCO']);
    const paths=select(coastSvg,n=>n.tag==='path');
    assert.ok(paths.some(p=>p.attrs.stroke===colors.T4));
    assert.ok(paths.some(p=>p.attrs.stroke===colors.SCO));
    assert.ok(select(coastSvg,n=>n.attrs['data-station-id']==='pk')[0].children
      .some(n=>n.attrs.style?.includes('--sp-station-colour:'+colors.SCO)));
    // Unknown or invalid metadata is never interpolated into an SVG style.
    const fallback=makeStationDiagram(t1,{name:'T1',metric:'entries',
      colors:{T1:'red;fill:url(javascript:evil)'},onSelect(){}});
    assert.match(select(fallback,n=>n.attrs.class==='sp-diagram-line-badge')[0].attrs.style,
      /#526777/);
  }finally{
    globalThis.Node=originalNode;
    globalThis.document=originalDoc;
  }
});

test('explicit legend and adaptive SVG styles preserve true published zero versus unavailable data',()=>{
  const ui=fs.readFileSync(new URL('../site/station-patronage.js',import.meta.url),'utf8');
  const css=fs.readFileSync(new URL('../site/station-patronage.css',import.meta.url),'utf8');
  assert.match(ui,/const badgeLines=model\.line==='T4_SCO'\?\['T4','SCO'\]:\[model\.line\]/);
  assert.match(ui,/All stations except Central, Redfern and Sydenham: larger markers and rainbow colours indicate more/);
  assert.match(ui,/Hollow circle: missing or suppressed/);
  assert.match(ui,/0 is a published zero, not missing data/);
  assert.match(ui,/colors:diagramColors/);
  assert.match(css,/\.sp-diagram-dot \{fill:var\(--sp-heat-colour/);
  assert.match(css,/\.sp-diagram-missing \.sp-diagram-dot/);
  assert.match(css,/\.sp-diagram-track \{stroke-width/);
});
