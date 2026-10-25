import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  patronageHeatColour, patronageHeatTextColour, PATRONAGE_SEQUENTIAL_STOPS,
  PATRONAGE_HEAT_EXCLUDED_HUBS,
} from '../site/station-patronage.js';

const source=fs.readFileSync(new URL('../site/station-patronage.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../site/station-patronage.css',import.meta.url),'utf8');

test('Viridis colours progress from dark purple to bright yellow, with accessible chip text',()=>{
  assert.equal(PATRONAGE_SEQUENTIAL_STOPS.length,11);
  assert.deepEqual([PATRONAGE_SEQUENTIAL_STOPS[0],PATRONAGE_SEQUENTIAL_STOPS[5],
    PATRONAGE_SEQUENTIAL_STOPS.at(-1)],['#440154','#21918c','#fde725']);
  const luminance=hex=>{
    const rgb=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255)
      .map(c=>c<=0.04045?c/12.92:((c+0.055)/1.055)**2.4);
    return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;
  };
  const previous=PATRONAGE_SEQUENTIAL_STOPS.map(luminance);
  for(let i=1;i<previous.length;i++)
    assert.ok(previous[i]>previous[i-1],'sequential brightness must increase at '+i);
  for(let i=0;i<=100;i++){
    const colour=patronageHeatColour(i/100);
    const fg=patronageHeatTextColour(colour);
    const sorted=[luminance(colour),luminance(fg)].sort((a,b)=>b-a);
    assert.ok((sorted[0]+.05)/(sorted[1]+.05)>=4.5,
      'legible text for gradient sample '+i);
  }
});

test('exact five-station exclusion policy remains intact after palette change',()=>{
  assert.deepEqual([...PATRONAGE_HEAT_EXCLUDED_HUBS],
    ['Martin Place','Town Hall','Central','Redfern','Sydenham']);
  assert.match(source,/const ordinary=published.filter\(st=>!patronageHubKeys.has\(st.key\)\)/);
  assert.match(source,/const markerSize=!record\?16:hubExcludedFromScale\?18:/);
  assert.match(source,/const fill=excludedHub\?'#e4e9ef'/);
});

test('Station Patronage header is brief with native expandable methodology and quality warning',()=>{
  assert.match(source,/node\('h1', \{\}, 'Station patronage'\)/);
  assert.match(source,/Historical Opal taps, not live crowding/);
  assert.match(source,/node\('details', \{ class: 'sp-methodology-disclosure' \}/);
  assert.match(source,/node\('details', \{ class: 'sp-warning sp-unmatched-details' \}/);
  assert.match(source,/node\('summary', \{\},\s*number\(data.coverage.unmatchedCount\)/);
  assert.match(source,/node\('span', \{ class: 'sp-source-date' \}, recent.details\)/);
  assert.doesNotMatch(source,/node\('h1', \{\}, 'Station patronage hotspots'\)/);
});

test('nullable conditional filter fields never become literal null in Safari',()=>{
  assert.match(source,/const controls = \[\s*field\('Dataset'/);
  assert.match(source,/form\.replaceChildren\(\.\.\.controls\.filter\(Boolean\)\)/);
  assert.doesNotMatch(source,/form\.replaceChildren\(\s*field\('Dataset'/);
  assert.match(source,/f\.period === 'typical' \? field\('Typical day'/);
});

test('mobile styles reduce top spacing and keep interactive filters visible',()=>{
  assert.match(css,/\.sp-heading \{padding:7px 0 2px;\}/);
  assert.match(css,/\.sp-source-status \{gap:3px 9px;padding:6px 9px;\}/);
  assert.match(css,/\.sp-field \{flex:1 1 calc\(50% - 8px\);min-width:0/);
  assert.match(css,/\.sp-overview \{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css,/\.sp-methodology-disclosure summary \{ cursor:pointer/);
  assert.match(css,/\.sp-unmatched-details summary \{/);
  assert.match(css,/\.sp-diagram-heat-ramp[\s\S]*#440154 0%,#482475 10%/);
  assert.match(css,/#bddf26 90%,#fde725 100%/);
});
