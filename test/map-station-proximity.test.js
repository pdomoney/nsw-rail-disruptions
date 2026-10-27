import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildGeographicStationProximity } from '../src/lib/map-station-proximity.js';
import { geographicStationLines } from '../site/geo-map.js';
import { project } from '../src/lib/netmap.js';

const original = {
  unit:10, lines:{T9:[[0,0,1000,0]],T8:[[5000,0,0,1000]]},
  stations:[
    ['Far away',5000,500,'T8 T9',1],
    ['Small offset',100,16,'T9',0],
    ['Nearby',100,50,'T9',0],
    ['Boundary',100,101,'T9',0],
    ['No-shape',20000,0,'L4',0],
  ]
};
test('GTFS route proximity only marks clearly remote station-line associations, without changing sources',()=>{
  const before=JSON.stringify(original);
  const meta=buildGeographicStationProximity(original);
  assert.equal(meta.thresholdM,1000);
  assert.deepEqual(meta.distant['Far away'],['T9']);
  assert.deepEqual(meta.distant['Boundary'],['T9']);
  assert.equal(meta.distant['Nearby'],undefined);
  assert.equal(meta.distant['Small offset'],undefined);
  assert.equal(meta.distant['No-shape'],undefined,'missing geometry is not assumed distant');
  assert.equal(JSON.stringify(original),before);
  const net={...original,stationProximity:meta};
  assert.deepEqual(geographicStationLines(net,'Far away','T8 T9'),{near:['T8'],distant:['T9']});
  assert.deepEqual(geographicStationLines(net,'Small offset','T9'),{near:['T9'],distant:[]});
  assert.deepEqual(geographicStationLines(original,'Far away','T8 T9'),{near:['T8','T9'],distant:[]},
    'older cached network data is not silently reclassified');
  assert.throws(()=>buildGeographicStationProximity(original,{thresholdM:0}),/threshold/);
});
test('geographic and offline maps share route-adjacent station filtering while official map stays separate',()=>{
  const build=fs.readFileSync(new URL('../src/build.js',import.meta.url),'utf8');
  const app=fs.readFileSync(new URL('../site/app.js',import.meta.url),'utf8');
  const geo=fs.readFileSync(new URL('../site/geo-map.js',import.meta.url),'utf8');
  assert.match(build,/geographicNetwork\.stationProximity = buildGeographicStationProximity/);
  assert.match(app,/geographicStationLines\(net, name, ls\)/);
  assert.match(app,/if \(lineFilter && !near\.includes\(lineFilter\)\) continue/);
  assert.match(geo,/if \(!served\.length \|\| \(filter && !near\.includes\(filter\)\)\) continue/);
  assert.match(app,/drawOfficialOverlay\(holder, \{ network:D\.network/);
  assert.match(app,/onStationSelect:showSelectedStation/);
  assert.match(app,/Other GTFS stop-time associations/);
  assert.match(geo,/Other GTFS stop-time associations/);
  assert.ok(!app.includes('function schematicMap('),'legacy hand-drawn renderer stays retired');
  assert.deepEqual(project(-33.87,151),[0,0]);
});
