// Transport for NSW CKAN station/monthly patronage ingestion.
// All data remains station-level monthly Opal tap events, NOT live/hourly counts.
export const CKAN_RESOURCE = 'f8bb2918-0540-4bb3-9ccf-f7aef04d4249';
export const CKAN_ENDPOINT = 'https://opendata.transport.nsw.gov.au/data/api/action/datastore_search';
export const MODERN_START = '2024-11';
const cols=['MonthYear','Station','Station_Type','Entry_Exit','Trip'];
export function parseMonth(input){
  const raw=String(input??'').trim();
  const iso=raw.match(/^(\d{4})-(\d{2})(?:-(\d{2})(?:[T ].*)?)?$/);
  if(!iso || +iso[2]<1 || +iso[2]>12)throw Error('Invalid TfNSW MonthYear: '+raw);
  return iso[1]+'-'+iso[2];
}
export function parseOpalCount(value) {
  const raw=String(value??'').replace(/,/g,'').trim();
  if (/^less than 50$/i.test(raw))return {count:null,suppressed:true};
  if (!/^\d+$/.test(raw))throw Error('Unrecognised TfNSW Trip value: '+String(value));
  const n=Number(raw);
  if(!Number.isSafeInteger(n) || n>100_000_000)throw Error('TfNSW count out of range');
  return {count:n,suppressed:false};
}
export function normalizeMonthlySource(rows,{minMonth=MODERN_START,maxMonth='2100-12'}={}) {
  if(!Array.isArray(rows) || !rows.length)throw Error('TfNSW monthly source returned no records');
  const pair=new Map(),suppressed=new Set(),types=new Map();
  let earliest=null,latest=null;
  for(const [i,row] of rows.entries()){
    for(const col of cols)if(!(col in row))throw Error('TfNSW CKAN row '+i+' missing '+col);
    const month=parseMonth(row.MonthYear);
    if(month<minMonth||month>maxMonth)continue;
    const name=String(row.Station||'').trim();
    if(!name)throw Error('TfNSW source row '+i+' missing Station');
    const rawDirection=String(row.Entry_Exit||'').trim().toLowerCase();
    const direction=['entry','entries'].includes(rawDirection)?'entry'
      :['exit','exits'].includes(rawDirection)?'exit':rawDirection;
    if(!['entry','exit'].includes(direction))throw Error('Unexpected Entry_Exit '+row.Entry_Exit);
    const type=String(row.Station_Type||'').trim().toLowerCase();
    // Shared can be a rail+metro interchange; it is still one station,
    // not a line-specific count. Light rail gets its own station type.
    if(!['train','metro','metro shared','shared','light rail','light_rail','intercity'].includes(type))
      throw Error('Unexpected Station_Type '+row.Station_Type);
    const key=month+'\u0000'+name, current=pair.get(key)||{station:name,month,entries:null,exits:null};
    const prop=direction==='entry'?'entries':'exits';
    if(Object.prototype.hasOwnProperty.call(current,'_seen_'+prop))throw Error('Duplicate monthly station/direction '+key+' '+direction);
    current['_seen_'+prop]=true;
    const parsed=parseOpalCount(row.Trip);
    if(parsed.suppressed)suppressed.add(key+'\u0000'+direction);
    current[prop]=parsed.count;
    pair.set(key,current);
    types.set(key,type);
    earliest=!earliest||month<earliest?month:earliest;
    latest=!latest||month>latest?month:latest;
  }
  const complete=[],incomplete=[];
  for(const row of pair.values()){
    if(row.entries===null||row.exits===null){incomplete.push({station:row.station,month:row.month});continue;}
    complete.push({station:row.station,month:row.month,entries:row.entries,exits:row.exits});
  }
  complete.sort((a,b)=>a.month.localeCompare(b.month)||a.station.localeCompare(b.station));
  if(!complete.length)throw Error('TfNSW monthly source had no complete station entry/exit pairs');
  return {rows:complete,coverage:{earliest,latest,recordsRead:rows.length,
    completeStationMonths:complete.length,incompleteStationMonths:incomplete.length,
    suppressedCells:suppressed.size,stations:new Set(complete.map(x=>x.station)).size}};
}
export function monthlyCsv(result){
  const escaped=x=>'"'+String(x).replaceAll('"','""')+'"';
  return 'station,month,entries,exits\n'+result.rows.map(x=>
    [x.station,x.month,x.entries,x.exits].map(escaped).join(',')).join('\n')+'\n';
}

// CKAN's datastore_search defaults to only a subset of rows. Fetch all pages
// consistently, fail closed on schema or transport errors, never silently
// publish the first 100 rows as an exhaustive station database.
export async function fetchCkanMonthly(token,{fetcher=globalThis.fetch,pageSize=2500,maxPages=100}={}) {
  if(!token || !String(token).trim())throw Error('TFNSW_CKAN_TOKEN is required for authenticated datastore access');
  if(!Number.isSafeInteger(pageSize)||pageSize<1||pageSize>5000)throw Error('Invalid CKAN page size');
  const records=[];let total=null;
  for(let page=0;page<maxPages;page++){
    const response=await fetcher(CKAN_ENDPOINT,{method:'POST',
      headers:{'content-type':'application/json','Authorization':token},
      body:JSON.stringify({resource_id:CKAN_RESOURCE,limit:pageSize,offset:page*pageSize})});
    if(!response.ok)throw Error('TfNSW CKAN returned HTTP '+response.status);
    const body=await response.json();
    if(body?.success!==true||!Array.isArray(body.result?.records))throw Error('Unexpected TfNSW CKAN DataStore response');
    if(total===null){
      total=Number(body.result.total);
      if(!Number.isSafeInteger(total)||total<1||total>500_000)throw Error('Invalid CKAN dataset total');
    }else if(Number(body.result.total)!==total)throw Error('CKAN row count changed mid-pagination; refusing partial snapshot');
    const pageRecords=body.result.records;
    if(pageRecords.length===0&&records.length<total)throw Error('CKAN response ended before all records arrived');
    records.push(...pageRecords);
    if(records.length>=total){
      if(records.length!==total)throw Error('CKAN page count overshot total');
      return normalizeMonthlySource(records);
    }
  }
  throw Error('CKAN pagination exceeded configured limit');
}
