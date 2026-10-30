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

test('the newly published 2026 PDF withholds 2024 markers, rather than misplacing vehicles',()=>{
  const old=globalThis.document;
  globalThis.document={createElementNS:(_namespace,tag)=>node(tag)};
  try{
    const main={clientWidth:900,children:[],replaceChildren(...children){this.children=children}};
    const result=drawOfficialOverlay(main,{
      network:{stations:[['Tallawong Station',100,100,'M1',1],
        ['Bankstown Station',200,100,'M1 T6',1]]},
      live:{trains:[['M1',150,100,120,243,3,null,'Bankstown']],overlays:[]},
      view:'sydney',
    });
    assert.equal(result.calibrationPending,true);
    assert.equal(result.positioned,null);
    assert.equal(main.children[0].tag,'svg');
    assert.ok(find(main.children[0],item=>item.tag==='image'), 'official source artwork retained');
    assert.equal(find(main.children[0],item=>item.attrs.class==='official-vehicle'),null);
    assert.equal(find(main.children[0],item=>item.attrs.class==='official-station-target'),null);
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
