import test from 'node:test';
import assert from 'node:assert/strict';
import { METRO_OPENING_UTC_MS, shouldRefreshMetroOpeningMap } from '../src/lib/metro-opening-refresh.js';
import fs from 'node:fs';
const old='2026-10-28T09:17:27.936Z';
const candidate=(options={})=>shouldRefreshMetroOpeningMap({
  feedKey:'metro',nowMs:METRO_OPENING_UTC_MS,builtAt:old,lastAttemptAt:null,...options
});
test('opening refresh is not triggered before 04:31 AEDT or on unrelated feeds',()=>{
  assert.equal(candidate({nowMs:METRO_OPENING_UTC_MS-1}),false);
  assert.equal(candidate({feedKey:'sydneytrains'}),false);
  assert.equal(candidate({feedKey:'lr-parramatta'}),false);
  assert.equal(candidate(),true);
});
test('a successful post-opening Metro timetable prevents any repeated forced fetch',()=>{
  assert.equal(candidate({builtAt:'2026-10-30T04:32:00+11:00'}),false);
  assert.equal(candidate({builtAt:null}),true);
  assert.equal(candidate({nowMs:METRO_OPENING_UTC_MS+48*3600000}),false);
  assert.equal(candidate({nowMs:NaN}),false);
});
test('failed opening refresh uses six-hour backoff, including after collector restarts',()=>{
  const time=METRO_OPENING_UTC_MS+15*60000,previous=new Date(time).toISOString();
  assert.equal(candidate({nowMs:time+60*60000,lastAttemptAt:previous}),false);
  assert.equal(candidate({nowMs:time+6*3600000,lastAttemptAt:previous}),true);
  assert.equal(candidate({nowMs:time+8*3600000,lastAttemptAt:previous}),true);
});
test('collector uses a fresh Metro timetable only via existing authorised API path and cache fallback',()=>{
  const source=fs.readFileSync(new URL('../src/collect.js',import.meta.url),'utf8');
  assert.match(source,/shouldRefreshMetroOpeningMap/);
  assert.match(source,/d\.metroOpeningRefresh = \{attemptAt:iso\(now\),status:'attempted'\}/);
  assert.match(source,/forceMap = d\.rebuildMap === true \|\| openingRefresh/);
  assert.match(source,/ensureRouteMap\(feed, CACHE_DIR, \{ force: forceMap, now \}\)/);
  assert.match(source,/still-using-pre-opening-static-cache/);
  assert.doesNotMatch(source,/METRO_OPENING_UTC_MS\\s*[-+]\\s*3600000/);
});
