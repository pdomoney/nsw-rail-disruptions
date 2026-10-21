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

test('official train uses styled hover callbacks, not the grey native SVG title bubble', () => {
  const old = globalThis.document;
  globalThis.document = { createElementNS: (_ns,tag) => node(tag) };
  try {
    const main = { clientWidth: 900, children: [], replaceChildren(...children) { this.children=children; } };
    const hovered=[], dismissed=[], selected=[];
    const result=drawOfficialOverlay(main, {
      network:{stations:[
        ['Tallawong Station',100,100,'M1',1],
        ['Rouse Hill Station',200,100,'M1',1],
      ]},
      live:{trains:[['M1',150,100,120,243,3,null,null]],overlays:[]},
      view:'sydney',
      onTrainHover:(rows,x,y)=>hovered.push({rows,x,y}),
      onHoverEnd:()=>dismissed.push(true),
      onTrainSelect:message=>selected.push(message),
      onStationSelect:()=>{},
    });
    assert.equal(result.positioned,1);
    const marker=find(main.children[0],x=>x.attrs.class==='official-vehicle');
    assert.ok(marker,'train drawn on the actual PDF source route');
    assert.ok(!marker.children.some(x=>x.tag==='title'),'no browser-default grey tooltip remains on the train');
    assert.ok(marker.children.some(x=>x.attrs.class==='official-train-hit'),'generous invisible tap target retained');
    assert.ok(marker.children.some(x=>x.attrs.class==='official-train-body'),'visible train body is separately styled');
    marker.fire('pointerenter',{pointerType:'mouse',buttons:0,clientX:450,clientY:320});
    assert.equal(hovered.length,1);
    assert.deepEqual(hovered[0].rows,mapTrainHoverRows({line:'M1',headsign:null,delay:120,pax:243}));
    marker.fire('pointermove',{pointerType:'mouse',buttons:0,clientX:451,clientY:321});
    assert.equal(hovered.length,2);
    marker.fire('pointerenter',{pointerType:'touch',buttons:0,clientX:452,clientY:322});
    marker.fire('pointermove',{pointerType:'mouse',buttons:1,clientX:453,clientY:323});
    assert.equal(hovered.length,2,'drag and touch must not show a stuck tooltip');
    marker.fire('pointerleave');
    assert.equal(dismissed.length,1);
    marker.fire('focus');
    assert.deepEqual([hovered.at(-1).x,hovered.at(-1).y],[115,200]);
    marker.fire('blur');
    assert.equal(dismissed.length,2);
    marker.fire('click');
    assert.equal(dismissed.length,3);
    assert.equal(selected.length,1);
    assert.match(selected[0],/between Tallawong and Rouse Hill/);
  } finally {
    globalThis.document=old;
  }
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
