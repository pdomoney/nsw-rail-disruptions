import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildSchematic} from '../src/lib/schematic.js';
import {buildPatronageRoutes} from '../src/lib/patronage-routes.js';
import {
  patronageHeatColour,patronageHeatTextColour,PATRONAGE_RAINBOW_STOPS,
  PATRONAGE_HEAT_EXCLUDED_HUBS,stationDiagramPlan,stationDiagramModel,patronageRows,
} from '../site/station-patronage.js';

const colours=['#6d28d9','#2563eb','#06b6d4','#16a34a',
  '#fde047','#f97316','#dc2626'];
function rgbLuminance(hex) {
  const linear=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255)
    .map(c=>c<=0.04045?c/12.92:((c+0.055)/1.055)**2.4);
  return linear[0]*.2126+linear[1]*.7152+linear[2]*.0722;
}
function contrast(a,b) {
  const l=[rgbLuminance(a),rgbLuminance(b)].sort((x,y)=>y-x);
  return (l[0]+0.05)/(l[1]+0.05);
}

test('the scale is an ordered, saturated seven-colour rainbow, not muted earth colours',()=>{
  assert.deepEqual([...PATRONAGE_RAINBOW_STOPS],colours);
  assert.deepEqual([...PATRONAGE_HEAT_EXCLUDED_HUBS],
    ['Martin Place','Town Hall','Central','Redfern','Sydenham']);
  for(let i=0;i<colours.length;i++) {
    const actual=patronageHeatColour(i/(colours.length-1));
    assert.equal(actual,colours[i],'rainbow stop '+i+' must be accurate');
    const foreground=patronageHeatTextColour(actual);
    assert.ok(contrast(actual,foreground)>=4.5,'chip text must remain legible on '+actual);
  }
  assert.equal(patronageHeatColour(-1),'#6d28d9');
  assert.equal(patronageHeatColour(1.5),'#dc2626');
  assert.equal(patronageHeatColour(NaN),'#6d28d9');
  assert.notEqual(patronageHeatColour(.18),patronageHeatColour(.25));
});

test('the CSS legend uses the exact seven stops in the same increasing order',()=>{
  const css=fs.readFileSync(new URL('../site/station-patronage.css',import.meta.url),'utf8');
  const section=css.slice(css.indexOf('.sp-diagram-heat-ramp'));
  const match=section.match(/background:linear-gradient\(to right,([\s\S]*?)\);/);
  assert.ok(match,'gradient swatch exists');
  const sequence=[...match[1].matchAll(/#[0-9a-f]{6}/ig)].map(m=>m[0]);
  assert.deepEqual(sequence,colours);
  assert.match(css,/\.sp-route-amount-hub/);
});

test('only the requested stations are neutral, not other interchanges',()=>{
  const routes=buildPatronageRoutes(buildSchematic().seqs);
  const plan=stationDiagramPlan(routes,'T4_SCO');
  const stations=[
    ['cen','Central Station',['T4']],['red','Redfern Station',['T4']],
    ['syd','Sydenham Station',['T4']],
    ['hurst','Hurstville Station',['T4']],['suth','Sutherland Station',['T4']],
    ['wolli','Wolli Creek Station',['T4']],['arn','Arncliffe Station',['T4']],
  ];
  const data={monthly:{'2026-09':{
    cen:[2000000,1900000],red:[650000,640000],syd:[480000,460000],
    hurst:[125000,120000],suth:[300000,290000],wolli:[180000,170000],
    arn:[40000,39000],
  }}};
  const model=stationDiagramModel(plan,stations,patronageRows(data,stations,
    {period:'monthly',month:'2026-09',metric:'entries'}));
  assert.equal(model.maximum,2000000);
  assert.equal(model.gradientMaximum,300000);
  assert.equal(model.excludedHubCount,3);
  assert.equal(model.nodes.filter(n=>n.hubExcludedFromScale).length,3);
  for(const id of ['cen','red','syd']){
    const station=model.nodes.find(n=>n.id===id);
    assert.equal(station.markerSize,18);
    assert.equal(station.hubExcludedFromScale,true);
  }
  for(const id of ['hurst','suth','wolli','arn']){
    const station=model.nodes.find(n=>n.id===id);
    assert.equal(station.hubExcludedFromScale,false);
    assert.ok(station.markerSize>=12);
    assert.ok(station.markerSize<=26);
  }
  assert.equal(model.nodes.find(n=>n.id==='suth').markerSize,26);
  assert.equal(patronageHeatColour(model.nodes.find(n=>n.id==='suth').heatIntensity),
    '#dc2626');
  assert.equal(model.nodes.find(n=>n.id==='cen').value,2000000);
});

test('changes to included interchange volume, but not excluded hubs, alter the rainbow scale',()=>{
  const routes=buildPatronageRoutes(buildSchematic().seqs);
  const plan=stationDiagramPlan(routes,'T4_SCO');
  const stations=[
    ['cen','Central Station',['T4']],['red','Redfern Station',['T4']],
    ['syd','Sydenham Station',['T4']],['suth','Sutherland Station',['T4']],
    ['arn','Arncliffe Station',['T4']],['kog','Kogarah Station',['T4']],
  ];
  const base={cen:[1000000,1000000],red:[900000,900000],syd:[800000,800000],
    suth:[200000,200000],arn:[40000,40000],kog:[80000,80000]};
  const build=record=>stationDiagramModel(plan,stations,patronageRows(
    {monthly:{'2026-09':record}},stations,
    {period:'monthly',month:'2026-09',metric:'entries'}));
  const a=build(base);
  const changedExcluded=build({...base,cen:[10000000,10000000],
    red:[5000000,5000000],syd:[3000000,3000000]});
  assert.equal(changedExcluded.gradientMaximum,a.gradientMaximum);
  assert.deepEqual(
    a.nodes.filter(s=>!s.hubExcludedFromScale).map(s=>[s.id,s.markerSize,s.heatIntensity]),
    changedExcluded.nodes.filter(s=>!s.hubExcludedFromScale)
      .map(s=>[s.id,s.markerSize,s.heatIntensity]));
  const changedIncluded=build({...base,suth:[400000,400000]});
  assert.equal(changedIncluded.gradientMaximum,400000);
  assert.notEqual(changedIncluded.nodes.find(n=>n.id==='arn').heatIntensity,
    a.nodes.find(n=>n.id==='arn').heatIntensity);
  assert.equal(changedIncluded.nodes.find(n=>n.id==='suth').value,400000);
});
