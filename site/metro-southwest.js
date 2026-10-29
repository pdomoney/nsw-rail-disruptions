// Presentation-only 30 October 2026 M1 Southwest Metro evidence.
// Original published TfNSW network PDF is 2024 and has no Southwest Metro route.
export const METRO_SOUTHWEST_OPENED = Date.parse('2026-10-30T04:31:00+11:00');
export const SOUTHWEST_NEW_STOPS = Object.freeze([
  'Marrickville','Dulwich Hill','Hurlstone Park','Canterbury','Campsie',
  'Belmore','Lakemba','Wiley Park','Punchbowl','Bankstown',
]);
export const METRO_SOUTHWEST_OFFICIAL_URL =
  'https://transportnsw.info/news/2026/southwest-metro-now-open';
const METRO_POSITION_MAX_AGE_MS=15*60*1000;
const KX=(111_320*Math.cos(-33.87*Math.PI/180))/10;
const KY=110_574/10;
const stationKey=name=>String(name||'').toLowerCase()
  .replace(/\b(station|metro|light rail|interchange)\b/g,' ')
  .replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();
// This is a *broad review envelope*, not a constructed GTFS track/geofence.
// Only applied to already feed-reported Metro vehicle coordinates.
export function reportedSouthwestMetroRegion(lat,lon) {
  return Number.isFinite(lat)&&Number.isFinite(lon)&&
    lat>=-33.95&&lat<=-33.89&&lon>=151.025&&lon<151.16;
}
export function reportedSouthwestMetroProjected(x,y) {
  return Number.isFinite(x)&&Number.isFinite(y)&&
    reportedSouthwestMetroRegion(-33.87-y/KY,151+x/KX);
}
export function southwestMetroMapSummary(network,live,nowMs=Date.now()) {
  const stations=(network?.stations||[]).filter(row=>
    Array.isArray(row)&&String(row[3]||'').split(/\s+/).includes('M1'));
  const present=new Set(stations.map(row=>stationKey(row[0])));
  const represented=SOUTHWEST_NEW_STOPS.filter(name=>present.has(stationKey(name)));
  const snapshotTime=Date.parse(live?.at||'');
  const fresh=Number.isFinite(snapshotTime)&&Number.isFinite(nowMs)&&
    nowMs>=snapshotTime&&nowMs-snapshotTime<=METRO_POSITION_MAX_AGE_MS;
  const positions=fresh?(live?.trains||[]).filter(row=>
    row[0]==='M1'&&Number.isFinite(row[1])&&Number.isFinite(row[2])):[];
  const southwest=positions.filter(row=>reportedSouthwestMetroProjected(row[1],row[2]));
  const bankstownHeadsigns=positions.filter(row=>
    /^bankstown(?:\s+station)?$/i.test(String(row[7]||'').trim())).length;
  return {
    newStationsInSource:represented.length,
    expectedNewStations:SOUTHWEST_NEW_STOPS.length,
    missingStations:SOUTHWEST_NEW_STOPS.filter(name=>!present.has(stationKey(name))),
    sourceHasMetroLine:Array.isArray(network?.lines?.M1)&&network.lines.M1.length>0,
    positionsFresh:fresh,
    positionTimestamp:fresh?live.at:null,
    m1Positions:fresh?positions.length:null,
    southwestReportedPositions:fresh?southwest.length:null,
    bankstownHeadsignPositions:fresh?bankstownHeadsigns:null,
    // Only official source gives the opening status; feed data is supplemental.
    officiallyOpened:nowMs>=METRO_SOUTHWEST_OPENED,
  };
}
