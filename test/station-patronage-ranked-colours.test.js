import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {stationDiagramModel,stationPatronageRankBands,PATRONAGE_VISUAL_COLOURS,
  PATRONAGE_HEAT_EXCLUDED_HUBS,patronageRows} from '../site/station-patronage.js';

test('five colours have stable, clearly separated ranking positions with no ties split',()=>{
  assert.deepEqual([...PATRONAGE_VISUAL_COLOURS],[
    '#440154','#31688e','#21918c','#5ec962','#fde725']);
  const bands=stationPatronageRankBands([5000,100,200,200,300,800,1000,1800,5000,2700]);
  assert.equal(bands.get(100),0);
  assert.equal(bands.get(5000),4);
  assert.equal(bands.get(200),0,'identical values must share exactly one colour');
  assert.ok([...bands.values()].every(v=>Number.isInteger(v)&&v>=0&&v<=4));
  assert.equal(new Set(bands.values()).size,5);
  assert.deepEqual([...stationPatronageRankBands([0]).values()],[2],
    'uniform reported data should not falsely imply a highest/lowest difference');
  assert.deepEqual([...stationPatronageRankBands([]).values()],[]);
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

test('the five excluded stations remain grey and all other interchanges contribute to colour ranking',()=>{
  assert.deepEqual([...PATRONAGE_HEAT_EXCLUDED_HUBS],
    ['Martin Place','Town Hall','Central','Redfern','Sydenham']);
  const m=model();
  assert.equal(m.maximum,2270013);
  assert.equal(m.gradientMaximum,466944);
  assert.equal(m.excludedHubCount,5);
  for(let i=0;i<5;i++){
    const n=m.nodes.find(st=>st.id==='st'+i);
    assert.equal(n.hubExcludedFromScale,true);
    assert.equal(n.visualColour,'#e4e9ef');
    assert.equal(n.markerSize,18);
    assert.equal(n.value,numbers[i]);
  }
  const included=m.nodes.filter(st=>st.id&&Number(st.id.slice(2))>=5);
  assert.equal(included.length,8);
  assert.equal(new Set(included.map(n=>n.visualColour)).size,5,
    'multiple visually distinct station groups are visible despite extreme count differences');
  const wolli=m.nodes.find(n=>n.id==='st5');
  assert.equal(wolli.visualColour,PATRONAGE_VISUAL_COLOURS[4]);
  const jannali=m.nodes.find(n=>n.id==='st12');
  assert.equal(jannali.visualColour,PATRONAGE_VISUAL_COLOURS[0]);
});

test('changing excluded station volumes has no effect on included station groups',()=>{
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

test('diagram instructions are one compact accessible legend plus optional details',()=>{
  const js=fs.readFileSync(new URL('../site/station-patronage.js',import.meta.url),'utf8');
  const css=fs.readFileSync(new URL('../site/station-patronage.css',import.meta.url),'utf8');
  assert.match(js,/node\('div',\{class:'sp-diagram-quick-guide'\}/);
  assert.match(js,/node\('div',\{class:'sp-diagram-five-band'/);
  assert.match(js,/node\('details',\{class:'sp-diagram-explainer'/);
  assert.match(js,/node\('span',\{class:'sp-band-swatch'/);
  assert.doesNotMatch(js,/node\('p',\{class:'sp-diagram-orientation'/);
  assert.doesNotMatch(js,/node\('p',\{class:'sp-diagram-scale-note'/);
  const start=js.indexOf('const topStation=f.diagramFlip');
  const end=js.indexOf('function updateResults()',start);
  const fragment=js.slice(start,end);
  assert.ok(fragment.indexOf('search,')<fragment.indexOf("node('details',{class:'sp-diagram-explainer'"),
    'search should sit above long disclosures');
  assert.match(css,/\.sp-band-swatch \{/);
  assert.match(css,/\.sp-diagram-quick-guide \{/);
  assert.match(css,/\.sp-diagram-panel > input\[type="search"\]/);
});
