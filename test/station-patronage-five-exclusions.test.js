import test from 'node:test';
import assert from 'node:assert/strict';
import {PATRONAGE_HEAT_EXCLUDED_HUBS,patronageRows,
  stationDiagramModel,patronageHeatColour} from '../site/station-patronage.js';

// Use an explicit T4-style reference route to guarantee coverage of all five
// exclusions, including Martin Place and Town Hall above Central.
const plan={
  line:'T4',name:'Five-exclusion test corridor',
  trunk:['Martin Place','Town Hall','Central','Redfern','Sydenham',
    'Wolli Creek','Hurstville','Sutherland','Arncliffe','Jannali'],
  branches:[],
};
const stations=plan.trunk.map((name,i)=>[
  's'+i,name+' Station',['T4'],
]);
const source={
  '2026-09':{
    s0:[2100000,2200000], // Martin Place
    s1:[1800000,2000000], // Town Hall
    s2:[2270013,2250000], // Central
    s3:[659130,640000],   // Redfern
    s4:[473241,460000],   // Sydenham
    s5:[280000,276000],   // Wolli Creek, included
    s6:[310000,305000],   // Hurstville, included
    s7:[350000,351000],   // Sutherland, included
    s8:[57192,56000],    // Arncliffe, included
    s9:[12000,13000],    // Jannali, included
  }
};
function model(data=source,metric='entries'){
  const records=patronageRows({monthly:data},stations,
    {period:'monthly',month:'2026-09',metric});
  return stationDiagramModel(plan,stations,records);
}
const excluded=['Martin Place','Town Hall','Central','Redfern','Sydenham'];
const included=['Wolli Creek','Hurstville','Sutherland','Arncliffe','Jannali'];

test('exactly five named stations are excluded, regardless of Station suffix',()=>{
  assert.deepEqual([...PATRONAGE_HEAT_EXCLUDED_HUBS],excluded);
  const a=model();
  assert.equal(a.excludedHubCount,5);
  assert.equal(a.maximum,2270013,'preserves true published peak as metadata');
  assert.equal(a.gradientMaximum,350000,
    'Sutherland, not any excluded high-volume station, sets both visual scales');
  for(const name of excluded){
    const st=a.nodes.find(n=>n.name===name+' Station');
    assert.ok(st,name+' is matched');
    assert.equal(st.hubExcludedFromScale,true,name);
    assert.equal(st.markerSize,18,name+' is neutral and fixed-size');
    assert.ok(st.value>0,name+' recorded value remains visible');
  }
  for(const name of included){
    const st=a.nodes.find(n=>n.name===name+' Station');
    assert.ok(st,name+' is present');
    assert.equal(st.hubExcludedFromScale,false,name);
    assert.ok(st.markerSize>=12 && st.markerSize<=26,name+' uses real range');
  }
  assert.equal(a.nodes.find(n=>n.name==='Sutherland Station').markerSize,26);
  assert.equal(patronageHeatColour(a.nodes.find(n=>n.name==='Sutherland Station').heatIntensity),
    '#fde725','top of sequential scale is yellow for largest included station');
  assert.ok(a.nodes.find(n=>n.name==='Jannali Station').markerSize<
    a.nodes.find(n=>n.name==='Arncliffe Station').markerSize);
});

test('changing excluded hubs never changes other stations’ colour or diameter',()=>{
  const a=model();
  const values={...source['2026-09'],
    s0:[9000000,9000000],s1:[7000000,7000000],
    s2:[8000000,8000000],s3:[6000000,6000000],s4:[5000000,5000000]};
  const b=model({'2026-09':values});
  assert.notEqual(a.maximum,b.maximum);
  assert.equal(a.gradientMaximum,b.gradientMaximum);
  assert.equal(a.excludedHubCount,b.excludedHubCount);
  for(const name of included){
    const old=a.nodes.find(n=>n.name===name+' Station');
    const next=b.nodes.find(n=>n.name===name+' Station');
    assert.equal(next.value,old.value);
    assert.equal(next.markerSize,old.markerSize);
    assert.equal(next.heatIntensity,old.heatIntensity);
    assert.equal(patronageHeatColour(next.heatIntensity),
      patronageHeatColour(old.heatIntensity));
  }
});

test('remaining interchange hubs influence scale, and exit metric remains source based',()=>{
  const start=model();
  const updated=model({'2026-09':{
    ...source['2026-09'],s5:[440000,444000],
  }});
  assert.equal(updated.gradientMaximum,440000,
    'Wolli Creek must influence both scales when its published entries rise');
  assert.ok(updated.nodes.find(n=>n.name==='Arncliffe Station').markerSize<
    start.nodes.find(n=>n.name==='Arncliffe Station').markerSize);
  const exits=model(source,'exits');
  assert.equal(exits.gradientMaximum,351000);
  assert.equal(exits.nodes.find(n=>n.name==='Central Station').value,2250000);
  assert.equal(exits.excludedHubCount,5);
});
