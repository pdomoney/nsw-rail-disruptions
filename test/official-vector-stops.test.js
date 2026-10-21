import test from 'node:test';
import assert from 'node:assert/strict';
import {OFFICIAL_STOPS} from '../site/official-map.js';
import {PDF_SYMBOL_COUNT,decodePdfSymbols,REFERENCE_2024_ROUTES,
  reconcilePdfStations,nearestPdfSymbol,OFFICIAL_LINE_PALETTE} from '../site/official-vector-stops.js';

test('exact TfNSW PDF vector station dots decode in the original coordinates',()=>{
 const dots=decodePdfSymbols();
 assert.equal(Object.values(dots).reduce((n,p)=>n+p.length,0),PDF_SYMBOL_COUNT);
 assert.equal(Object.keys(dots).length,10);
 for(const [line,points] of Object.entries(dots)){
  assert.ok(points.length>0);
  assert.match(OFFICIAL_LINE_PALETTE[line],/^#[0-9A-Fa-f]{6}$/);
  for(const p of points) assert.ok(p[0]>0&&p[0]<1024&&p[1]>0&&p[1]<1447);
 }
});

test('named stations snap to actual printed dot locations only where supported',()=>{
 const result=reconcilePdfStations(OFFICIAL_STOPS,REFERENCE_2024_ROUTES);
 console.log('PDF reconciled stop coverage',JSON.stringify({
  printSymbols:PDF_SYMBOL_COUNT,namedStops:result.positions.size,
  anchors:result.evidence.filter(e=>e.method==='vector-anchor').length,
  interpolated:result.evidence.filter(e=>e.method==='vector-intermediate').length,
  unresolved:result.unmatched.length,
  byLine:Object.fromEntries([...result.byLine].map(([l,m])=>[l,m.size]))
 }));
 assert.ok(result.positions.size>=25);
 for(const [line,stops] of result.byLine)
  for(const [name,xy] of stops)
   assert.ok(nearestPdfSymbol(xy,decodePdfSymbols()[line],.02),line+' '+name);
 const used=new Map();
 for(const [name,point] of result.positions){
   const key=point.join(',');
   assert.ok(!used.has(key) || used.get(key)===name,
     'Two different names assigned the same printed stop: '+name+' and '+used.get(key)+' at '+key);
   used.set(key,name);
 }
 const again=reconcilePdfStations(OFFICIAL_STOPS,REFERENCE_2024_ROUTES);
 assert.deepEqual([...again.positions],[...result.positions]);
});

test('an imaginary station cannot obtain guessed PDF coordinates',()=>{
 const none=reconcilePdfStations({'Imaginary station':[523,700]},REFERENCE_2024_ROUTES);
 assert.equal(none.positions.size,0);
 assert.deepEqual(none.unmatched,['Imaginary station']);
});
