import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {LINES} from '../src/config/lines.js';
import {buildSchematic} from '../src/lib/schematic.js';
import {buildPatronageRoutes} from '../src/lib/patronage-routes.js';
import {patronageRows,patronageHeatColour,stationDiagramPlan,stationDiagramModel,
  stationRouteCardSections,makeResponsiveStationDiagram} from '../site/station-patronage.js';

const routes=buildPatronageRoutes(buildSchematic().seqs);
const colors=Object.fromEntries(LINES.map(l=>[l.id,l.color]));
const stations=[
  ['c','Central Station',['T4','SCO']],
  ['s','Sutherland Station',['T4','SCO']],
  ['a','Arncliffe Station',['T4']],
  ['j','Jannali Station',['T4']],
  ['con','Coniston Station',['SCO']],
  ['wo','Wollongong Station',['SCO']],
  ['b','Bomaderry (Nowra) Station',['SCO']],
  ['cr','Cronulla Station',['T4']],
  ['pk','Port Kembla Station',['SCO']],
];
const counts={monthly:{'2026-09':{
  c:[20000,19800],s:[10000,9200],a:[3800,4200],
  j:[900,850],con:[0,0],wo:[6600,7200],b:[160,120],cr:[2800,3000],
}}};
const observations=patronageRows(counts,stations,
  {period:'monthly',month:'2026-09',metric:'entries'});
const plan=stationDiagramPlan(routes,'T4_SCO');
const model=stationDiagramModel(plan,stations,observations);
const traverse=(root,fn,out=[])=>{
  if(fn(root))out.push(root);
  for(const ch of root.children||[])if(typeof ch==='object')traverse(ch,fn,out);
  return out;
};
const text=(root)=>typeof root==='string'?root:
  (root.children||[]).map(text).join('');
const byClass=(root,cls)=>traverse(root,n=>
  typeof n.attrs?.class==='string'&&n.attrs.class.split(' ').includes(cls));

class FakeElement {
  constructor(tag){this.tag=tag;this.attrs={};this.children=[];this.events={};this.hidden=false;}
  setAttribute(k,v){this.attrs[k]=String(v);}
  append(...children){this.children.push(...children);}
  addEventListener(k,fn){this.events[k]=fn;}
  querySelectorAll(selector){
    const cls=selector.slice(1);
    return byClass(this,cls);
  }
}
function render(planValue=plan,modelValue=model,opts={}){
  const previousDocument=globalThis.document,previousNode=globalThis.Node;
  globalThis.Node=FakeElement;
  globalThis.document={createElement:tag=>new FakeElement(tag)};
  try{return makeResponsiveStationDiagram(planValue,modelValue,
    {metric:'entries',colors,...opts});}
  finally{globalThis.document=previousDocument;globalThis.Node=previousNode;}
}

test('responsive route makes each main station a row and branches at actual junction stops',()=>{
  const sections=stationRouteCardSections(plan,model);
  assert.equal(sections[0].station.name,'Central Station');
  assert.equal(sections.at(-1).station.name,'Bomaderry (Nowra) Station');
  const suth=sections.find(row=>row.station.name==='Sutherland Station');
  const con=sections.find(row=>row.station.name==='Coniston Station');
  assert.deepEqual(suth.branches.map(b=>b.terminal),['Cronulla']);
  assert.deepEqual(con.branches.map(b=>b.terminal),['Port Kembla']);
  assert.ok(suth.branches[0].rows.some(st=>st.name==='Cronulla Station'));
  assert.ok(con.branches[0].rows.some(st=>st.name==='Port Kembla Station'));
  const all=[...sections.map(s=>s.station),
    ...sections.flatMap(s=>s.branches.flatMap(b=>b.rows))];
  assert.equal(new Set(all.map(r=>r.name)).size,all.length,
    'station must appear once across trunk and branch rows');
  const flipped=stationRouteCardSections(plan,
    stationDiagramModel(plan,stations,observations,{flip:true}));
  assert.equal(flipped[0].station.name,'Bomaderry (Nowra) Station');
  assert.equal(flipped.at(-1).station.name,'Central Station');
  assert.deepEqual(flipped.find(x=>x.station.name==='Sutherland Station')
    .branches.map(b=>b.terminal),['Cronulla']);
});

test('mobile station, published value and heat-coloured marker sit together in one native row',()=>{
  const root=render();
  assert.equal(root.attrs.class,'sp-responsive-network');
  assert.equal(traverse(root,n=>n.tag==='svg').length,0,
    'active diagram must never produce a wide horizontal SVG');
  const name=byClass(root,'sp-route-name').find(el=>text(el)==='Central Station');
  assert.ok(name);
  const parent=byClass(root,'sp-route-text').find(el=>el.children.includes(name));
  assert.ok(parent,'name belongs in a compact text/value container');
  const amount=byClass(parent,'sp-route-amount')[0];
  assert.ok(amount);
  assert.equal(text(amount),'20,000');
  assert.match(amount.attrs.style,/background-color:#b12d34/);
  const button=byClass(root,'sp-route-stop-button').find(el=>
    (el.attrs['aria-label']||'').startsWith('Central Station,'));
  const marker=byClass(button,'sp-route-dot')[0];
  assert.match(marker.attrs.style,/background-color:#b12d34/);
  assert.ok(traverse(button,n=>n.tag==='span').length>=4);
  const smaller=byClass(root,'sp-route-stop-button').find(el=>
    (el.attrs['aria-label']||'').startsWith('Arncliffe Station,'));
  assert.match(byClass(smaller,'sp-route-amount')[0].attrs.style,
    new RegExp('background-color:'+patronageHeatColour(
      model.nodes.find(n=>n.name==='Arncliffe Station').intensity)));
  assert.notEqual(byClass(smaller,'sp-route-amount')[0].attrs.style,amount.attrs.style);
});

test('unreported observations remain hollow and true zero is a low-end filled marker',()=>{
  const root=render();
  const controls=byClass(root,'sp-route-stop-button');
  const zero=controls.find(b=>(b.attrs['aria-label']||'').startsWith('Coniston Station,'));
  const missing=controls.find(b=>(b.attrs['aria-label']||'').startsWith('Port Kembla Station,'));
  assert.ok(zero);assert.ok(missing);
  assert.equal(text(byClass(zero,'sp-route-amount')[0]),'0');
  assert.equal(text(byClass(missing,'sp-route-amount')[0]),'Not published');
  assert.ok(!byClass(zero,'sp-route-dot')[0].attrs.class.includes('missing'));
  assert.ok(byClass(missing,'sp-route-dot')[0].attrs.class.includes('missing'));
  assert.match(byClass(zero,'sp-route-dot')[0].attrs.style,/background-color:#e2f2f7/);
  assert.doesNotMatch(byClass(missing,'sp-route-dot')[0].attrs.style,/background-color:/);
});

test('tapping a station reveals its entry and exit counts in place, with native button semantics',()=>{
  let selected=null;
  const root=render(plan,model,{onSelect:row=>selected=row});
  const controls=byClass(root,'sp-route-stop-button');
  const station=controls.find(b=>(b.attrs['aria-label']||'').startsWith('Arncliffe Station,'));
  assert.ok(station);
  assert.equal(station.attrs.type,'button');
  station.events.click();
  assert.equal(selected.name,'Arncliffe Station');
  assert.equal(station.attrs['aria-pressed'],'true');
  assert.ok(controls.filter(b=>b.attrs['aria-pressed']==='true').length===1);
  const details=byClass(root,'sp-route-inline-detail');
  const active=details.filter(el=>!el.hidden);
  assert.equal(active.length,1);
  assert.match(text(active[0]),/3,800 entries · 4,200 exits/);
});

test('native route retains available visual controls without horizontal overflow in iPhone CSS',()=>{
  const js=fs.readFileSync(new URL('../site/station-patronage.js',import.meta.url),'utf8');
  const css=fs.readFileSync(new URL('../site/station-patronage.css',import.meta.url),'utf8');
  assert.match(js,/host\.replaceChildren\(makeResponsiveStationDiagram\(plan,diagramModel/);
  assert.match(js,/background-color:'\+fill/);
  assert.match(js,/node\('details',\{class:'sp-route-branch',open:''/);
  assert.match(css,/\.sp-diagram-scroll \{\s*overflow:visible/);
  assert.match(css,/\.sp-route-text \{\s*display:flex/);
  assert.match(css,/\.sp-route-amount \{/);
  assert.match(css,/@media \(max-width:600px\)/);
});
