import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {groupReportedVehicles} from '../site/geo-map.js';
const a=(line,x,y)=>({line,position:[x,y]});
test('dense overview groups reported positions into visual counts without modifying input records',()=>{
  const rows=[a('T1',0,0),a('T2',10,20),a('T4',160,0),a('T1',8,8)];
  const original=JSON.stringify(rows);
  const groups=groupReportedVehicles(rows,point=>({x:point[0],y:point[1]}),70);
  assert.equal(groups.length,2);
  assert.equal(groups[0].members.length,3);
  assert.deepEqual(groups[0].centre,[6,28/3]);
  assert.deepEqual(groups[1].centre,[160,0]);
  assert.equal(JSON.stringify(rows),original,'never mutate realtime vehicle positions');
});
test('missing pixel projection fails open to individual vehicles, not imaginary groups',()=>{
  const rows=[a('M1',-33.87,151),a('M1',-33.87,151)];
  assert.equal(groupReportedVehicles(rows,null).length,2);
  assert.equal(groupReportedVehicles([],()=>({x:1,y:2})).length,0);
  assert.throws(()=>groupReportedVehicles(rows,()=>({x:0,y:0}),0),/Invalid/);
});
test('modern overview keeps licensed tiles, source coordinates, display-only grouping and zoom access',()=>{
  const src=fs.readFileSync(new URL('../site/geo-map.js',import.meta.url),'utf8');
  const css=fs.readFileSync(new URL('../site/map-enhancements.css',import.meta.url),'utf8');
  assert.match(src,/map\.project\(point, zoom\)/);
  assert.match(src,/map\.on\?\.\('zoomend'/);
  assert.match(src,/map\.setView\(group\.centre,Math\.min\(zoom\+2,18\)/);
  assert.match(src,/Approximate centre of grouped icons, not a vehicle GPS location/);
  assert.match(src,/renderVehicles\(\)/);
  assert.match(src,/stationDetail===0 && priority<2/);
  assert.match(src,/filter && !near\.includes\(filter\)/);
  assert.match(src,/tile\.openstreetmap\.org/);
  assert.match(src,/OpenStreetMap contributors/);
  assert.match(css,/geo-vehicle-cluster/);
  assert.match(css,/geo-map-key/);
  assert.doesNotMatch(src,/cartocdn|mapbox|googleapis/);
});
