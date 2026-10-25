import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {LINES} from '../src/config/lines.js';
import {buildSchematic} from '../src/lib/schematic.js';
import {buildPatronageRoutes} from '../src/lib/patronage-routes.js';
import {
  patronageRows,stationDiagramPlan,stationDiagramModel,
  makeResponsiveStationDiagram,patronageHeatColour,
} from '../site/station-patronage.js';

const routes=buildPatronageRoutes(buildSchematic().seqs);
const plan=stationDiagramPlan(routes,'T4_SCO');
const stations=[
 ['cen','Central Station',['T4','SCO']],
 ['red','Redfern Station',['T4','SCO']],
 ['syd','Sydenham Station',['T4']],
 ['suth','Sutherland Station',['T4','SCO']],
 ['arn','Arncliffe Station',['T4']],
 ['kog','Kogarah Station',['T4']],
 ['jan','Jannali Station',['T4']],
 ['con','Coniston Station',['SCO']],
 ['cr','Cronulla Station',['T4']],
 ['pk','Port Kembla Station',['SCO']],
];
const counts={monthly:{'2026-09':{
 cen:[2270013,2100000],red:[659130,600000],syd:[473241,460000],
 suth:[440000,430000],arn:[57192,58000],kog:[90000,94000],
 jan:[12000,15000],con:[0,0],cr:[58000,61000],
}}};
const opts={period:'monthly',month:'2026-09',metric:'entries'};
const modelFor=(data=counts,extra={})=>stationDiagramModel(plan,stations,
  patronageRows(data,stations,{...opts,...extra}));

test('exclude high-volume interchange hubs from BOTH visual size and colour scales',()=>{
 const m=modelFor();
 assert.equal(m.maximum,2270013,'full published max is retained for metadata');
 assert.equal(m.gradientMaximum,440000,'Sutherland is included and sets the scale');
 assert.equal(m.excludedHubCount,3);
 const c=m.nodes.find(n=>n.id==='cen');
 const r=m.nodes.find(n=>n.id==='red');
 const s=m.nodes.find(n=>n.id==='syd');
 const k=m.nodes.find(n=>n.id==='kog');
 const a=m.nodes.find(n=>n.id==='arn');
 const j=m.nodes.find(n=>n.id==='jan');
 const suth=m.nodes.find(n=>n.id==='suth');
 assert.equal(c.value,2270013);
 assert.equal(r.value,659130);
 assert.equal(c.entries,2270013);
 assert.equal(c.hubExcludedFromScale,true);
 assert.equal(r.hubExcludedFromScale,true);
 assert.equal(s.hubExcludedFromScale,true);
 for(const hub of [c,r,s]){
   assert.equal(hub.markerSize,18,'hub marker is neutral, fixed-size');
   assert.equal(hub.heatIntensity,1,'raw heat intensity still clamps but render ignores it');
 }
 assert.equal(k.hubExcludedFromScale,false);
 assert.equal(suth.markerSize,26,'Sutherland is now the largest included station');
 assert.equal(suth.hubExcludedFromScale,false);
 assert.ok(a.markerSize>j.markerSize,'included station diameter varies visibly');
 assert.ok(suth.markerSize>c.markerSize,'Central never dominates an included station');
 assert.ok(k.markerSize>=j.markerSize);
 assert.ok(j.markerSize>=12);
 assert.equal(m.nodes.find(n=>n.id==='con').markerSize,12,'published zero');
 assert.equal(m.nodes.find(n=>n.id==='pk').markerSize,16,'missing marker is hollow');
});

test('changing only hub counts leaves ordinary marker sizes and colours unchanged',()=>{
 const first=modelFor();
 const higher={monthly:{'2026-09':{
   ...counts.monthly['2026-09'],cen:[9000000,9000000],
   red:[8000000,8000000],syd:[7000000,7000000],
 }}};
 const second=modelFor(higher);
 assert.notEqual(second.maximum,first.maximum);
 assert.equal(second.gradientMaximum,first.gradientMaximum);
 for(const id of ['arn','kog','jan','con','cr']){
   const a=first.nodes.find(st=>st.id===id);
   const b=second.nodes.find(st=>st.id===id);
   assert.equal(a.heatIntensity,b.heatIntensity);
   assert.equal(a.markerSize,b.markerSize);
   assert.equal(a.value,b.value);
 }
 for(const id of ['cen','red','syd']){
   assert.equal(first.nodes.find(st=>st.id===id).markerSize,18);
   assert.equal(second.nodes.find(st=>st.id===id).markerSize,18);
 }
});

class FakeElement {
 constructor(tag){this.tag=tag;this.attrs={};this.children=[];this.events={};this.hidden=false;}
 set className(v){this.attrs.class=String(v);}
 get className(){return this.attrs.class||'';}
 setAttribute(k,v){this.attrs[k]=String(v);}
 append(...children){this.children.push(...children);}
 addEventListener(k,fn){this.events[k]=fn;}
 querySelectorAll(selector){return descendants(this,selector.slice(1));}
}
function descendants(root,cls,out=[]){
 if((root.attrs?.class||'').split(' ').includes(cls))out.push(root);
 for(const child of root.children||[])if(child&&typeof child==='object')descendants(child,cls,out);
 return out;
}
function byName(root,name){
 return descendants(root,'sp-route-stop-button')
   .find(el=>(el.attrs['aria-label']||'').startsWith(name+','));
}
function render(m=modelFor()){
 const previousDocument=globalThis.document,previousNode=globalThis.Node;
 globalThis.Node=FakeElement;
 globalThis.document={createElement:tag=>new FakeElement(tag)};
 try{
   return makeResponsiveStationDiagram(plan,m,{
     metric:'entries',colors:Object.fromEntries(LINES.map(l=>[l.id,l.color])),
     onSelect(){}});
 }finally{
   globalThis.document=previousDocument;globalThis.Node=previousNode;
 }
}

test('Safari-facing HTML neutralises hubs but shows their original numbers and station details',()=>{
 const tree=render();
 const central=byName(tree,'Central Station');
 const redfern=byName(tree,'Redfern Station');
 const kogarah=byName(tree,'Kogarah Station');
 const jannali=byName(tree,'Jannali Station');
 assert.ok(central);assert.ok(redfern);assert.ok(kogarah);assert.ok(jannali);
 for(const hub of [central,redfern]){
   assert.match(hub.attrs['aria-label'],/excluded from colour and size scale/);
   assert.equal(descendants(hub,'sp-route-hub-tag').length,1);
   assert.match(descendants(hub,'sp-route-amount')[0].attrs.style,/background-color:#e4e9ef/);
   assert.match(descendants(hub,'sp-route-dot')[0].attrs.style,/--sp-marker-size:18px/);
   assert.match(descendants(hub,'sp-route-dot')[0].attrs.style,/background-color:#e4e9ef/);
 }
 const c=descendants(central,'sp-route-amount')[0];
 const r=descendants(redfern,'sp-route-amount')[0];
 assert.equal(c.children[0],'2,270,013');
 assert.equal(r.children[0],'659,130');
 const kDot=descendants(kogarah,'sp-route-dot')[0];
 const jDot=descendants(jannali,'sp-route-dot')[0];
 assert.match(kDot.attrs.style,/--sp-marker-size:/);
 assert.match(kDot.attrs.style,new RegExp('background-color:'+
   modelFor().nodes.find(n=>n.id==='kog').visualColour));
 const sDot=descendants(byName(tree,'Sutherland Station'),'sp-route-dot')[0];
 assert.match(sDot.attrs.style,/--sp-marker-size:26px/);
 assert.match(sDot.attrs.style,/background-color:#fde725/);
 assert.notEqual(kDot.attrs.style,jDot.attrs.style,
   'ordinary stations have independent colour and size contrast');
});

test('one-hub-only fallback, zero, missing and flip preserve meaningful data',()=>{
 const tiny={monthly:{'2026-09':{cen:[300,330],red:[200,230]}}};
 const onlyHubs=modelFor(tiny);
 assert.equal(onlyHubs.hubScaleExclusionActive,false);
 assert.equal(onlyHubs.gradientMaximum,300);
 assert.equal(onlyHubs.nodes.find(n=>n.id==='cen').markerSize,26,
   'no published non-hub data falls back instead of removing all scaling');
 const original=modelFor();
 const flipped=stationDiagramModel(plan,stations,
    patronageRows(counts,stations,opts),{flip:true});
 assert.deepEqual(original.nodes.map(n=>[n.id,n.value,n.markerSize,n.hubExcludedFromScale]),
    flipped.nodes.map(n=>[n.id,n.value,n.markerSize,n.hubExcludedFromScale]));
 const zero=original.nodes.find(n=>n.id==='con');
 const missing=original.nodes.find(n=>n.id==='pk');
 assert.equal(zero.value,0); assert.equal(zero.markerSize,12);
 assert.equal(missing.value,null); assert.equal(missing.markerSize,16);
});

test('CSS centres variable-size markers on same vertical track in normal and mobile view',()=>{
 const css=fs.readFileSync(new URL('../site/station-patronage.css',import.meta.url),'utf8');
 assert.match(css,/width:var\(--sp-marker-size, 18px\)/);
 assert.match(css,/transform:translate\(-50%,-50%\)/);
 assert.match(css,/left:-22px;top:26px/);
 assert.match(css,/\.sp-route-dot \{left:-19px;\}/);
 assert.match(css,/\.sp-route-amount-hub/);
 assert.match(css,/\.sp-route-hub-tag/);
});
