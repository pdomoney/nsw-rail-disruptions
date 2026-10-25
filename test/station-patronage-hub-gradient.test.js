import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildSchematic} from '../src/lib/schematic.js';
import {buildPatronageRoutes} from '../src/lib/patronage-routes.js';
import {
  stationDiagramPlan,stationDiagramModel,patronageRows,
  patronageHeatColour,PATRONAGE_HEAT_EXCLUDED_HUBS,
} from '../site/station-patronage.js';

const routes=buildPatronageRoutes(buildSchematic().seqs);
const plan=stationDiagramPlan(routes,'T4_SCO');
const stations=[
  ['central','Central Station',['T4','SCO']],
  ['redfern','Redfern Station',['T4','SCO']],
  ['town','Town Hall Station',['T4']],
  ['hville','Hurstville Station',['T4','SCO']],
  ['suth','Sutherland Station',['T4','SCO']],
  ['wong','Wollongong Station',['SCO']],
  ['arn','Arncliffe Station',['T4','SCO']],
  ['kog','Kogarah Station',['T4','SCO']],
  ['jan','Jannali Station',['T4','SCO']],
  ['cron','Cronulla Station',['T4']],
  ['con','Coniston Station',['SCO']],
  ['pk','Port Kembla Station',['SCO']],
];
const source={monthly:{'2026-09':{
  central:[500000,470000],redfern:[200000,220000],town:[180000,181000],
  hville:[150000,151000],suth:[120000,125000],wong:[75000,76000],
  arn:[4800,5300],kog:[9000,9400],jan:[1000,1100],cron:[3500,3600],
  con:[0,0],
}}};
const options={period:'monthly',month:'2026-09',metric:'entries'};
const modelFor=(data=source,extra={})=>stationDiagramModel(plan,stations,
  patronageRows(data,stations,{...options,...extra}));

test('Central, Redfern and nominated hubs do not set the gradient maximum',()=>{
  assert.deepEqual([...PATRONAGE_HEAT_EXCLUDED_HUBS],
    ['Martin Place','Town Hall','Central','Redfern','Sydenham'],'the only permitted excluded stops');
  for(const included of ['Wolli Creek','Hurstville','Wollongong',
    'Parramatta','Strathfield','Chatswood','Sutherland','Bondi Junction']){
    assert.ok(!PATRONAGE_HEAT_EXCLUDED_HUBS.includes(included),
      included+' must remain in both scales');
  }
  const model=modelFor();
  assert.equal(model.maximum,500000,'keep true published peak');
  assert.equal(model.gradientMaximum,150000,'Hurstville included as largest non-excluded station');
  assert.equal(model.excludedHubCount,2);
  assert.equal(model.hubScaleExclusionActive,true);
  const arn=model.nodes.find(n=>n.id==='arn');
  const kog=model.nodes.find(n=>n.id==='kog');
  const jan=model.nodes.find(n=>n.id==='jan');
  const central=model.nodes.find(n=>n.id==='central');
  const redfern=model.nodes.find(n=>n.id==='redfern');
  assert.ok(arn.heatIntensity>arn.intensity);
  assert.ok(jan.heatIntensity>jan.intensity);
  assert.ok(kog.heatIntensity<1,'Kogarah must not be rendered as the peak');
  const hurstville=model.nodes.find(n=>n.id==='hville');
  assert.equal(hurstville.heatIntensity,1);
  assert.equal(hurstville.markerSize,26);
  assert.equal(hurstville.hubExcludedFromScale,false);
  assert.equal(patronageHeatColour(hurstville.heatIntensity),'#dc2626');
  assert.equal(model.nodes.find(n=>n.id==='suth').hubExcludedFromScale,false);
  assert.equal(model.nodes.find(n=>n.id==='wong').hubExcludedFromScale,false);
  assert.equal(central.value,500000);
  assert.equal(redfern.value,200000);
  assert.equal(central.heatIntensity,1,'hub colour clamps to top');
  assert.equal(redfern.heatIntensity,1);
  assert.equal(central.hubExcludedFromScale,true);
  assert.equal(arn.hubExcludedFromScale,false);
  assert.notEqual(patronageHeatColour(arn.heatIntensity),
    patronageHeatColour(jan.heatIntensity),'ordinary stops have visible colour contrast');
  assert.equal(model.nodes.find(n=>n.id==='con').value,0,'published zero retained');
  assert.equal(model.nodes.find(n=>n.id==='pk').value,null,'missing stays missing');
});

test('excluded hub volume changes do not change gradient of ordinary stations',()=>{
  const initial=modelFor();
  const higher={monthly:{'2026-09':{
    ...source.monthly['2026-09'],central:[9000000,9999999],
    redfern:[900000,999999],
  }}};
  const changed=modelFor(higher);
  assert.equal(changed.gradientMaximum,initial.gradientMaximum);
  assert.equal(changed.maximum,9000000);
  for(const id of ['arn','kog','jan','cron','con']){
    const a=initial.nodes.find(n=>n.id===id),b=changed.nodes.find(n=>n.id===id);
    assert.equal(b.value,a.value);
    assert.equal(b.heatIntensity,a.heatIntensity,
      id+' heat must be independent of hub peaks');
    assert.equal(patronageHeatColour(b.heatIntensity),patronageHeatColour(a.heatIntensity));
  }
});

test('flip and metric changes preserve hub exclusion and use selected source values',()=>{
  const a=modelFor();
  const flipped=stationDiagramModel(plan,stations,
    patronageRows(source,stations,options),{flip:true});
  assert.equal(flipped.gradientMaximum,a.gradientMaximum);
  assert.equal(flipped.excludedHubCount,a.excludedHubCount);
  assert.deepEqual(flipped.nodes.map(n=>[n.id,n.value,n.heatIntensity]),
    a.nodes.map(n=>[n.id,n.value,n.heatIntensity]));
  const exits=modelFor(source,{metric:'exits'});
  assert.equal(exits.gradientMaximum,151000);
  assert.equal(exits.maximum,470000);
});

test('all-hub and wholly unavailable corridors use safe fallback, no invented counts',()=>{
  const justHubs={monthly:{'2026-09':{
    central:[900000,800000],redfern:[120000,200000],
  }}};
  const fallback=modelFor(justHubs);
  assert.equal(fallback.hubScaleExclusionActive,false);
  assert.equal(fallback.excludedHubCount,0);
  assert.equal(fallback.gradientMaximum,900000);
  assert.equal(fallback.nodes.find(n=>n.id==='arn').value,null);
  const empty=modelFor({monthly:{'2026-09':{}}});
  assert.equal(empty.gradientMaximum,1);
  assert.equal(empty.excludedHubCount,0);
  assert.equal(empty.nodes.find(n=>n.id==='central').value,null);
  assert.equal(empty.nodes.find(n=>n.id==='central').heatIntensity,0);
});

test('active responsive view and legacy SVG use hub-excluded heat, while normal counts remain unchanged',()=>{
  const sourceCode=fs.readFileSync(new URL('../site/station-patronage.js',import.meta.url),'utf8');
  const styles=fs.readFileSync(new URL('../site/station-patronage.css',import.meta.url),'utf8');
  assert.match(sourceCode,/const fill=excludedHub\?'#e4e9ef'/);
  assert.match(sourceCode,/node\('span',\{\},'Higher patronage \('\+number\(diagramModel\.gradientMaximum\)/);
  assert.match(sourceCode,/Only Martin Place, Town Hall, Central, Redfern and Sydenham are excluded/);
  assert.match(sourceCode,/Other interchanges are included/);
  assert.match(sourceCode,/node\('p',\{class:'sp-diagram-scale-note'/);
  assert.match(styles,/\.sp-diagram-scale-note/);
});
