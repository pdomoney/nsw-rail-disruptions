import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {metroOpeningScheduleSnapshot} from '../src/lib/metro-opening-schedule-snapshot.js';
import {METRO_OPENING_UTC_MS} from '../src/lib/metro-opening-refresh.js';
const trip=(line,sid,head,origin,start,end)=>[line,sid,start,end,1,null,null,null,head,origin];
const input=()=>({
  builtAt:'2026-10-30T04:34:00+11:00',source:'/v2/gtfs/schedule/metro',
  sched:{
    services:{day:['20261030','20261103',127,[],[]],later:['20261031','20261103',127,[],[]]},
    trips:{
      s:trip('M1','day','Sydenham','start',14700,16400),
      b:trip('M1','day','Bankstown','start',17100,20000),
      o:trip('M1','day','Tallawong','bank',17200,20100),
      n:trip('M1','later','Bankstown','start',17300,20100),
      t:trip('T6','day','Bankstown','start',17200,22000)
    }
  },
  stations:{bank:{n:'Bankstown Station',l:['M1']}}
});
test('current calendar candidates are counted once without modifying source',()=>{
  const m=input(),copy=JSON.stringify(m);
  const s=metroOpeningScheduleSnapshot(m,METRO_OPENING_UTC_MS+3600000);
  assert.equal(s.calendarQualifiedM1Trips,3);
  assert.equal(s.bankstownCandidateTrips,2);
  assert.equal(s.bankstownHeadsignTrips,1);
  assert.equal(s.bankstownOriginTrips,1);
  assert.equal(s.fetchedAfterOpening,true);
  assert.equal(JSON.stringify(m),copy);
});
test('pre-opening feed age is not mistaken for a post-opening source release',()=>{
  const m=input();m.builtAt='2026-10-28T20:00:00Z';
  const s=metroOpeningScheduleSnapshot(m,METRO_OPENING_UTC_MS+5000);
  assert.equal(s.fetchedAfterOpening,false);
});
test('no synthetic evidence outside the opening window or without calendars',()=>{
  assert.equal(metroOpeningScheduleSnapshot(input(),METRO_OPENING_UTC_MS-1),null);
  assert.equal(metroOpeningScheduleSnapshot(input(),METRO_OPENING_UTC_MS+48*3600000),null);
  assert.equal(metroOpeningScheduleSnapshot({...input(),sched:null},METRO_OPENING_UTC_MS+1),null);
});
test('collector writes a separate source snapshot rather than overwriting frozen trips',()=>{
  const src=fs.readFileSync(new URL('../src/collect.js',import.meta.url),'utf8');
  assert.match(src,/metroOpeningScheduleSnapshot\(map,\s*now\)/);
  assert.match(src,/metro-opening-static-snapshot\.json/);
});
