import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { drawOfficialOverlay, mapTrainHoverRows } from '../site/official-map.js';

function node(tag) {
  return {
    tag, attrs: {}, children: [], handlers: {},
    setAttribute(name, value) { this.attrs[name] = String(value); },
    append(...children) { this.children.push(...children); },
    replaceChildren(...children) { this.children = [...children]; },
    addEventListener(type, listener) {
      (this.handlers[type] ||= []).push(listener);
    },
    getBoundingClientRect() { return { left: 100, top: 200, width: 30, height: 30 }; },
    fire(type, details = {}) {
      for (const listener of this.handlers[type] || []) listener(details);
    },
  };
}
function find(root, predicate) {
  if (predicate(root)) return root;
  for (const child of root.children || []) {
    const result = find(child, predicate);
    if (result) return result;
  }
  return null;
}

test('official and legacy map tooltip rows share identical train details', () => {
  assert.deepEqual(mapTrainHoverRows({line:'M1',headsign:null,delay:120,pax:243}), [
    {value:'MOVING M1'},
    {label:'2 min late'},
    {label:'About 240 people aboard (estimate)',muted:true},
  ]);
  assert.deepEqual(mapTrainHoverRows({line:'T4',headsign:'Bondi Junction Station',delay:0,pax:null}), [
    {value:'MOVING T4 to Bondi Junction'},
    {label:'On time'},
    {label:'Occupancy not reported',muted:true},
  ]);
});

test('current 2026 diagram positions a source-matched M1 service and restores styled telemetry',()=>{
  const old=globalThis.document;
  globalThis.document={createElementNS:(_namespace,tag)=>node(tag)};
  try{
    const a=[-33.69163,150.90602],b=[-33.69199,150.92431];
    const project=(lat,lon)=>[
      Math.round((lon-151)*(111320*Math.cos(-33.87*Math.PI/180)/10)),
      Math.round((-33.87-lat)*(110574/10))
    ];
    const A=project(...a),B=project(...b);
    const midpoint=[Math.round((A[0]+B[0])/2),Math.round((A[1]+B[1])/2)];
    const main={clientWidth:900,children:[],replaceChildren(...children){this.children=children}};
    const hovered=[],dismissed=[],selected=[];
    const result=drawOfficialOverlay(main,{
      network:{stations:[
        ['Tallawong Station',...A,'M1',1],
        ['Rouse Hill Station',...B,'M1',1],
      ]},
      live:{trains:[['M1',...midpoint,120,243,3,null,'Bankstown']],overlays:[]},
      onTrainHover:(rows,x,y)=>hovered.push({rows,x,y}),
      onHoverEnd:()=>dismissed.push(true),
      onTrainSelect:text=>selected.push(text),
      onStationSelect:()=>{},
    });
    assert.equal(result.calibrationPending,false);
    assert.equal(result.positioned,1);
    assert.equal(main.children[0].tag,'svg');
    const marker=find(main.children[0],item=>item.attrs.class==='official-vehicle');
    assert.ok(marker,'M1 train shown only on matched 2026 station pair');
    assert.ok(!marker.children.some(item=>item.tag==='title'));
    assert.ok(marker.children.some(item=>item.attrs.class==='official-train-hit'));
    marker.fire('pointerenter',{pointerType:'mouse',buttons:0,clientX:410,clientY:330});
    assert.equal(hovered.length,1);
    assert.deepEqual(hovered[0].rows,mapTrainHoverRows({line:'M1',headsign:'Bankstown',delay:120,pax:243}));
    marker.fire('pointerleave');
    assert.equal(dismissed.length,1);
    marker.fire('click');
    assert.equal(selected.length,1);
    assert.match(selected[0],/between Tallawong and Rouse Hill/);
    assert.match(selected[0],/2026 published diagram/);
  }finally{globalThis.document=old;}
});

test('official hover styling only outlines the visible icon, never the transparent touch rectangle',()=>{
  const css=fs.readFileSync(new URL('../site/official-map.css',import.meta.url),'utf8');
  assert.ok(css.includes('.official-train-body'));
  assert.doesNotMatch(css,/\.official-vehicle(?:\:hover|:focus-visible)?\s+rect:first-child/);
  assert.match(css,/\.official-vehicle:hover \.official-train-body/);
  const app=fs.readFileSync(new URL('../site/app.js',import.meta.url),'utf8');
  assert.match(app,/onTrainHover:showTip,onHoverEnd:hideTip/);
  assert.match(app,/const tip = mapTrainHoverRows\(\{line,headsign,delay,pax\}\)/);
});
