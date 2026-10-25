import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  stationDiagramModel,stationPatronageVolumeBands,PATRONAGE_VISUAL_COLOURS,
  PATRONAGE_HEAT_EXCLUDED_HUBS,patronageRows,
} from '../site/station-patronage.js';

test('seven Viridis bands separate different volumes and treat identical counts consistently',()=>{
  assert.deepEqual([...PATRONAGE_VISUAL_COLOURS],[
    '#440154','#443983','#31688e','#21918c','#35b779','#90d743','#fde725']);
  const bands=stationPatronageVolumeBands([5000,100,200,200,300,800,1000,1800,5000,2700]);
  assert.equal(bands.get(100),0);
  assert.equal(bands.get(200),1);
  assert.equal(bands.get(200),bands.get(200),'ties share one colour band');
  assert.equal(bands.get(5000),6);
  assert.ok([...bands.values()].every(v=>Number.isInteger(v)&&v>=0&&v<=6));
  assert.equal(new Set(bands.values()).size,7);
  assert.deepEqual([...stationPatronageVolumeBands([0]).values()],[0],
    'an all-zero data set stays in the lowest band');
  assert.deepEqual([...stationPatronageVolumeBands([800]).values()],[3],
    'a single positive observation uses midpoint rather than false extremes');
  assert.deepEqual([...stationPatronageVolumeBands([]).values()],[]);
});

const plan={
  name:'Connected station test',line:'T4',
  trunk:['Martin Place','Town Hall','Central','Redfern','Sydenham',
    'Wolli Creek','Hurstville','Sutherland','Arncliffe','Banksia',
    'Rockdale','Kogarah','Jannali'],branches:[],
};
const stations=plan.trunk.map((name,index)=>['st'+index,name+' Station',['T4']]);
const numbers=[500000,600000,2270013,659130,473241,
  466944,300000,200000,9000,11000,14000,18000,4000];
const data=values=>({monthly:{'2026-09':Object.fromEntries(
  values.map((n,i)=>['st'+i,[n,n+100]]))}});
const opts={period:'monthly',month:'2026-09',metric:'entries'};
function model(values=numbers){
  return stationDiagramModel(plan,stations,patronageRows(data(values),stations,opts));
}

test('five excluded station values remain grey; every other interchange participates normally',()=>{
  assert.deepEqual([...PATRONAGE_HEAT_EXCLUDED_HUBS],
    ['Martin Place','Town Hall','Central','Redfern','Sydenham']);
  const m=model();
  assert.equal(m.maximum,2270013);
  assert.equal(m.gradientMaximum,466944);
  assert.equal(m.excludedHubCount,5);
  for(let i=0;i<5;i++){
    const n=m.nodes.find(st=>st.id==='st'+i);
    assert.equal(n.visualColour,'#e4e9ef');
    assert.equal(n.markerSize,18);
    assert.equal(n.value,numbers[i]);
    assert.equal(n.hubExcludedFromScale,true);
  }
  const included=m.nodes.filter(st=>st.id&&Number(st.id.slice(2))>=5);
  assert.equal(included.length,8);
  assert.ok(new Set(included.map(n=>n.visualColour)).size>=4,
    'display volume-dependent variation without forcing unused bands onto the map');
  assert.equal(m.nodes.find(n=>n.id==='st5').visualColour,PATRONAGE_VISUAL_COLOURS[6]);
  assert.equal(m.nodes.find(n=>n.id==='st12').visualColour,PATRONAGE_VISUAL_COLOURS[0]);
});

test('changing excluded hub volumes never changes other station colours or sizes',()=>{
  const before=model();
  const after=model([9000000,8000000,7000000,6000000,5000000,...numbers.slice(5)]);
  for(let i=5;i<numbers.length;i++){
    const a=before.nodes.find(n=>n.id==='st'+i);
    const b=after.nodes.find(n=>n.id==='st'+i);
    assert.equal(a.colourBand,b.colourBand);
    assert.equal(a.visualColour,b.visualColour);
    assert.equal(a.value,b.value);
    assert.equal(a.markerSize,b.markerSize);
  }
});

test('diagram stays compact with seven colour swatches and optional method details',()=>{
  const js=fs.readFileSync(new URL('../site/station-patronage.js',import.meta.url),'utf8');
  const css=fs.readFileSync(new URL('../site/station-patronage.css',import.meta.url),'utf8');
  assert.match(js,/node\('div',\{class:'sp-diagram-quick-guide'\}/);
  assert.match(js,/node\('div',\{class:'sp-diagram-seven-band'/);
  assert.match(js,/Seven relative patronage volume bands/);
  assert.match(js,/node\('details',\{class:'sp-diagram-explainer'/);
  assert.match(js,/node\('span',\{class:'sp-band-swatch'/);
  assert.doesNotMatch(js,/node\('p',\{class:'sp-diagram-orientation'/);
  assert.doesNotMatch(js,/node\('p',\{class:'sp-diagram-scale-note'/);
  const start=js.indexOf('const topStation=f.diagramFlip');
  const end=js.indexOf('function updateResults()',start);
  const fragment=js.slice(start,end);
  assert.ok(fragment.indexOf('search,')<fragment.indexOf("node('details',{class:'sp-diagram-explainer'"),
    'search should remain above long disclosures');
  assert.match(css,/\.sp-band-swatch \{/);
  assert.match(css,/\.sp-diagram-seven-band \{/);
  assert.match(css,/\.sp-diagram-panel > input\[type="search"\]/);
});

test('Rockdale and Carlton real screenshot counts map to visibly different colours',()=>{
  const referenceMaximum=466944; // Hurstville, from supplied screenshot
  const rockdale=219364;
  const carlton=64085;
  const bands=stationPatronageVolumeBands([0,32266,34406,57192,60992,64085,64789,
    77874,219364,219522,244036,referenceMaximum]);
  assert.equal(bands.get(rockdale),4,'Rockdale uses the fifth of seven bands');
  assert.equal(bands.get(carlton),2,'Carlton uses the third of seven bands');
  assert.notEqual(PATRONAGE_VISUAL_COLOURS[bands.get(rockdale)],
    PATRONAGE_VISUAL_COLOURS[bands.get(carlton)]);
  assert.equal(bands.get(219522),bands.get(219364),
    'similar activity should remain visually comparable');
  assert.equal(bands.get(referenceMaximum),6);
});
