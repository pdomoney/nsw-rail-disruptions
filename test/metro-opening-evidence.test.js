import test from 'node:test';
import assert from 'node:assert/strict';
import { auditSouthwestServiceEvidence,formatSouthwestServiceEvidence,
  OPENING_SECOND,positionOnSouthwestSide } from '../src/lib/metro-opening-evidence.js';
import {FLAG,TRIP_COLUMNS} from '../src/lib/service.js';
const key=Object.fromEntries(TRIP_COLUMNS.map((x,i)=>[x,i]));
function trip(id,headsign,start,end,flags=0,first=null,last=null,origin='other'){
  const row=new Array(TRIP_COLUMNS.length).fill(null);
  Object.assign(row,{[key.trip]:id,[key.line]:'M1',[key.start]:start,[key.end]:end,
    [key.headsign]:headsign,[key.origin]:origin,[key.flags]:flags,
    [key.first_seen]:first,[key.last_seen]:last});
  return row;
}
const station={stations:{
  bank:{n:'Bankstown Station',l:['M1'],la:-33.91786,lo:151.03469},
  other:{n:'Sydenham Station',l:['M1'],la:-33.91434,lo:151.16655}
}};
const day=trips=>({date:'2026-10-30',final:false,
  record:{date:'2026-10-30',cols:TRIP_COLUMNS,feeds:{
    metro:{timetable:'2026-10-29T19:00:00Z',coverage:[[15000,19000]],
      trips}}}});
const live={at:'2026-10-29T20:05:00Z',feeds:{metro:'2026-10-29T20:04:57Z'},
  cols:['feed','line','lat','lon'],
  trains:[['metro','M1',-33.917,151.07],['metro','M1',-33.80,151.19],
    ['sydneytrains','T6',-33.92,151.04]]};
test('before 4:31 opening: tracks and future timetable do not verify running service',()=>{
  const result=auditSouthwestServiceEvidence({
    at:'2026-10-30T04:00:00+11:00',metroStations:station,
    openingDay:day([trip('a','Bankstown',16000,18000)]),positions:live});
  assert.equal(result.status,'before-announced-opening');
  assert.equal(result.operationIndependentlyConfirmed,false);
});
test('opening-day frozen timetable and corroborating realtime evidence are separated',()=>{
  const result=auditSouthwestServiceEvidence({
    at:'2026-10-30T07:06:00+11:00',metroStations:station,
    openingDay:day([
      trip('bank','Bankstown',18000,22000,FLAG.SEEN|FLAG.RAN,18020,19000),
      trip('north','Tallawong',18300,21000,FLAG.SEEN|FLAG.RAN,18320,19300,'bank'),
      trip('old','Sydenham',1000,2000,0,null,null),
    ]),positions:live});
  assert.equal(result.status,'multiple-feed-operational-indicators-uncertified');
  assert.equal(result.bankstownCandidateTrips,2);
  assert.equal(result.bankstownHeadsignTrips,1);
  assert.equal(result.bankstownOriginTrips,1);
  assert.equal(result.candidateTripsSeenRunningAfterOpening,2);
  assert.equal(result.liveMetroPositions,2);
  assert.equal(result.liveMetroPositionsWestOfSydenham,1);
  assert.equal(result.operationIndependentlyConfirmed,false);
  const m=formatSouthwestServiceEvidence(result,{dataCommit:'a'.repeat(40)});
  assert.match(m.markdown,/never independently confirms passenger service/);
  assert.match(m.csv,/"Bankstown-terminal candidate scheduled trips","2"/);
});
test('stale and pre-opening vehicle snapshots are never used as opening-day corroboration',()=>{
  const tomorrow=auditSouthwestServiceEvidence({at:'2026-10-30T10:00:00+11:00',
    metroStations:station,openingDay:day([
      trip('bank','Bankstown',18000,22000,FLAG.SEEN|FLAG.RAN,18020,19000)
    ]),positions:live});
  assert.equal(tomorrow.currentOpeningDayVehicleSnapshot,false);
  assert.equal(tomorrow.liveMetroPositionsWestOfSydenham,0);
  assert.equal(tomorrow.status,'observed-running-flag-requires-corroboration');
});
test('no opening-day record means unknown, not falsely absent passenger service',()=>{
  const result=auditSouthwestServiceEvidence({at:'2026-10-30T06:00:00+11:00'});
  assert.equal(result.status,'awaiting-opening-day-service-record');
  assert.equal(result.timetableTripCount,0);
  assert.equal(result.bankstownCandidateTrips,0);
});
test('timetable still ending at Sydenham is flagged and cannot be overruled by positions alone',()=>{
  const result=auditSouthwestServiceEvidence({
    at:'2026-10-30T06:00:00+11:00',
    openingDay:day([trip('x','Sydenham',18000,22000)]),metroStations:station});
  assert.equal(result.status,'no-bankstown-terminal-trips-in-frozen-schedule');
});
test('opening bounds and input validation are deterministic',()=>{
  assert.equal(OPENING_SECOND,16260);
  assert.equal(positionOnSouthwestSide(-33.917,151.07),true);
  assert.equal(positionOnSouthwestSide(-33.80,151.19),false);
  assert.equal(positionOnSouthwestSide(150000,-33.9),false);
  assert.throws(()=>auditSouthwestServiceEvidence({at:'invalid date'}),/valid ISO/);
  assert.throws(()=>formatSouthwestServiceEvidence({}),/Unsupported/);
});

test('current Metro schedule candidates do not rewrite or certify frozen service-day trips',()=>{
  const frozen=day([trip('old','Sydenham',18000,21000)]);
  const original=JSON.stringify(frozen);
  const refreshed={
    schema:'nsw-rail-metro-opening-static-snapshot/v1',
    openingServiceDay:'2026-10-30',
    capturedAt:'2026-10-29T20:00:00Z',
    timetableBuiltAt:'2026-10-29T19:45:00Z',
    fetchedAfterOpening:true,
    calendarQualifiedM1Trips:520,
    bankstownCandidateTrips:146
  };
  const result=auditSouthwestServiceEvidence({
    at:'2026-10-30T08:00:00+11:00',
    openingDay:frozen,metroStations:station,refreshedSchedule:refreshed
  });
  assert.equal(result.bankstownCandidateTrips,0);
  assert.equal(result.currentStaticBankstownCandidateTrips,146);
  assert.equal(result.status,'refreshed-static-candidates-not-in-frozen-service-day');
  assert.equal(result.operationIndependentlyConfirmed,false);
  assert.equal(JSON.stringify(frozen),original);
  assert.match(formatSouthwestServiceEvidence(result).markdown,/Current static Bankstown candidate trips/);
});
test('future-dated static source snapshots cannot create an opening-day status',()=>{
  const r=auditSouthwestServiceEvidence({
    at:'2026-10-30T08:00:00+11:00',
    openingDay:day([]),refreshedSchedule:{
      schema:'nsw-rail-metro-opening-static-snapshot/v1',
      openingServiceDay:'2026-10-30',
      capturedAt:'2026-10-31T00:00:00Z',
      timetableBuiltAt:'2026-10-30T00:00:00Z',
      bankstownCandidateTrips:200,
    }
  });
  assert.equal(r.postOpeningStaticSnapshotAvailable,false);
  assert.equal(r.currentStaticBankstownCandidateTrips,null);
});
