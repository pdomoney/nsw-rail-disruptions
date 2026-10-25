import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {LINES} from '../src/config/lines.js';
import {buildSchematic} from '../src/lib/schematic.js';
import {buildPatronageRoutes} from '../src/lib/patronage-routes.js';
import {patronageRows,patronageHeatColour,stationDiagramPlan,
  stationDiagramModel,makeStationDiagram} from '../site/station-patronage.js';

const routes=buildPatronageRoutes(buildSchematic().seqs);
const colors=Object.fromEntries(LINES.map(l=>[l.id,l.color]));
const catalogue=[
  ['c','Central Station',['T4','SCO']],
  ['s','Sutherland Station',['T4','SCO']],
  ['a','Arncliffe Station',['T4','SCO']],
  ['j','Jannali Station',['T4','SCO']],
  ['cn','Coniston Station',['SCO']],
  ['bo','Bomaderry (Nowra) Station',['SCO']],
  ['cr','Cronulla Station',['T4']],
  ['pk','Port Kembla Station',['SCO']],
];
const counts={monthly:{'2026-09':{
  c:[20000,18000],s:[10000,9800],a:[3400,3200],
  j:[800,760],cn:[0,0],bo:[90,120],cr:[4000,4200],
}}};
const obs=patronageRows(counts,catalogue,
  {period:'monthly',month:'2026-09',metric:'entries'});

class SvgStub {
  constructor(tag){this.tag=tag;this.attrs={};this.children=[];this.handlers={};}
  setAttribute(key,value){this.attrs[key]=String(value);}
  append(...children){this.children.push(...children);}
  addEventListener(type,handler){this.handlers[type]=handler;}
}
function findAll(node,where,found=[]){
  if(where(node))found.push(node);
  for(const child of node.children||[])findAll(child,where,found);
  return found;
}
function render(plan,model){
  const d=globalThis.document,n=globalThis.Node;
  globalThis.Node=SvgStub;
  globalThis.document={
    createElementNS:(_namespace,tag)=>new SvgStub(tag),
    createTextNode(value){const v=new SvgStub('#text');v.value=String(value);return v;}
  };
  try {
    return makeStationDiagram(model,{name:plan.name,metric:'entries',
      colors,onSelect(){}});
  }finally{
    globalThis.document=d;globalThis.Node=n;
  }
}

test('heat scale interpolates from low (pale blue) to high (red), including the true zero',()=>{
  assert.equal(patronageHeatColour(0),'#e2f2f7');
  assert.equal(patronageHeatColour(1),'#b12d34');
  assert.equal(patronageHeatColour(-2),patronageHeatColour(0));
  assert.equal(patronageHeatColour(2),patronageHeatColour(1));
  assert.equal(patronageHeatColour(NaN),patronageHeatColour(0));
  assert.notEqual(patronageHeatColour(.18),patronageHeatColour(.45));
  assert.notEqual(patronageHeatColour(.45),patronageHeatColour(.82));
  assert.match(patronageHeatColour(.333),/^#[0-9a-f]{6}$/);
});

test('station number is an inline tspan adjacent to its own name, not at the far end of SVG',()=>{
  const plan=stationDiagramPlan(routes,'T4_SCO');
  const model=stationDiagramModel(plan,catalogue,obs);
  assert.equal(model.width,820,'mobile schematic has reduced horizontal travel');
  const svg=render(plan,model);
  const groups=findAll(svg,n=>n.attrs['data-station-id']==='a');
  assert.equal(groups.length,1);
  const g=groups[0];
  const labels=findAll(g,n=>n.attrs.class==='sp-diagram-label');
  assert.equal(labels.length,1);
  const label=labels[0];
  assert.equal(label.attrs.x,model.nodes.find(n=>n.id==='a').x+26+'');
  const parts=label.children;
  assert.deepEqual(parts.map(p=>p.attrs.class),['sp-diagram-name','sp-diagram-value']);
  assert.equal(parts[0].children[0].value,'Arncliffe Station');
  assert.equal(parts[1].children[0].value,'3,400');
  assert.equal(parts[1].attrs.dx,'12');
  assert.equal(parts[1].attrs.x,undefined,'the figure must flow after the name');
  assert.equal(findAll(g,n=>n.attrs['text-anchor']==='end').length,0,
    'no far-right fixed station number column');
});

test('heat markers reflect station value and missing observations remain hollow',()=>{
  const plan=stationDiagramPlan(routes,'T4_SCO');
  const model=stationDiagramModel(plan,catalogue,obs);
  const svg=render(plan,model);
  const byId=id=>findAll(svg,n=>n.attrs['data-station-id']===id)[0];
  const marker=id=>findAll(byId(id),n=>n.attrs.class==='sp-diagram-dot')[0];
  const central=marker('c'),jannali=marker('j'),zero=marker('cn');
  assert.ok(Number(central.attrs.r)>0);
  assert.ok(Number(jannali.attrs.r)>0);
  assert.notEqual(central.attrs.style,jannali.attrs.style);
  assert.match(central.attrs.style,/--sp-heat-colour:#e4e9ef/);
  assert.match(central.attrs.class||'sp-diagram-dot',/sp-diagram-dot/);
  assert.match(zero.attrs.style,/--sp-heat-colour:#e2f2f7/,
    'a reported zero is filled with low-end scale colour');
  const absent=byId('pk');
  assert.ok(absent.attrs.class.includes('sp-diagram-missing'));
  assert.equal(findAll(absent,n=>n.attrs.class==='sp-diagram-value')[0]
    .children[0].value,'Not published');
});

test('branch tracks bend between rows instead of crossing Sutherland/Coniston text',()=>{
  const plan=stationDiagramPlan(routes,'T4_SCO');
  const normal=stationDiagramModel(plan,catalogue,obs);
  const flipped=stationDiagramModel(plan,catalogue,obs,{flip:true});
  for(const model of [normal,flipped]){
    const branches=model.paths.filter(p=>p.branch);
    assert.equal(branches.length,2);
    assert.ok(branches.every(p=>p.d.includes(' Q')),
      'curves carry branch across a gap between station-name rows');
    assert.ok(branches.every(p=>/ V\d+/.test(p.d)),
      'branch path must descend before running horizontally');
    const svg=render(plan,model);
    const labels=findAll(svg,n=>n.attrs.class==='sp-diagram-label');
    assert.ok(labels.every(n=>!n.attrs.transform),
      'text and nearby data remain upright in both flipped orientations');
    const numbers=findAll(svg,n=>n.attrs.class==='sp-diagram-value');
    assert.equal(numbers.length,model.nodes.length);
  }
});

test('mobile legend and CSS advertise a continuous relative colour gradient',()=>{
  const ui=fs.readFileSync(new URL('../site/station-patronage.js',import.meta.url),'utf8');
  const css=fs.readFileSync(new URL('../site/station-patronage.css',import.meta.url),'utf8');
  assert.match(ui,/Station patronage colour gradient from low to high/);
  assert.match(ui,/Higher patronage \('\+number\(diagramModel.gradientMaximum\)/);
  assert.match(ui,/patronageHeatColour\(st.heatIntensity\?\?st.intensity\)/);
  assert.match(ui,/svgNode\('tspan',\{class:'sp-diagram-value',dx:12\}/);
  assert.doesNotMatch(ui,/x:st.x\+435/);
  assert.match(css,/\.sp-diagram-heat-ramp/);
  assert.match(css,/background:linear-gradient\(to right/);
  assert.match(css,/\.sp-diagram-dot \{fill:var\(--sp-heat-colour/);
});
