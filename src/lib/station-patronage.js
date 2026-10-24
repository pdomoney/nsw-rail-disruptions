// Official TfNSW station entries/exits, kept separate from live carriage crowding.
// Inputs are human-verified, normalized CSV exports of the two TfNSW station datasets.
// The site must not turn historical "typical day" averages into current observations.
import fs from 'node:fs';
import path from 'node:path';
import { parseCsv } from './csv.js';

const OFFICIAL = 'https://opendata.transport.nsw.gov.au/data/dataset/3977df59-a1fa-422e-91ff-cfaeac355cc9/';
export const SOURCE_URLS = {
  typical: OFFICIAL + 'resource/491763fc-82ed-4e44-9fca-8f3285db526e/download/train-station-entries-and-exits-version-2.2.xlsx',
  monthly: OFFICIAL + 'resource/f8bb2918-0540-4bb3-9ccf-f7aef04d4249/download/entry_exit.csv',
};
export const LEGACY_MONTHLY_SOURCES = [
  OFFICIAL + 'resource/0292414e-8f70-4ee3-a61b-c9749182fe6f',
  OFFICIAL + 'resource/c0396b43-8b5f-4243-b49d-ed9fc813005b',
];
export const SAMPLE_WINDOWS = ['06-10','10-15','15-19','19-06','24h'];
export const SAMPLE_YEARS = ['2016','2017','2018','2019','Feb 2020','May 2020','Sep 2020','2022','2023'];
export const STATION_DATASET = 'https://opendata.transport.nsw.gov.au/dataset/train-station-entries-and-exits-data';

export function stationKey(name) {
  return String(name || '').normalize('NFKC').toLowerCase()
    .replace(/\b(railway|train|metro)\s+station\b/g, '')
    .replace(/\bstation\b/g, '')
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]/g, '');
}

function catalogueIndex(stations) {
  const index = new Map();
  for (const st of stations) {
    if (!Array.isArray(st) || st.length < 3) continue;
    const key = stationKey(st[1]);
    if (!key) continue;
    const matches = index.get(key) || [];
    matches.push(st);
    index.set(key, matches);
  }
  return index;
}

function parseCount(value, where, monthly) {
  if (value === '' || value == null || !/^\d+(?:\.\d{1,3})?$/.test(String(value).trim())) {
    throw new Error('Invalid or absent entry/exit count at ' + where);
  }
  const num = Number(value);
  if (!Number.isFinite(num) || num > 100_000_000 || (monthly && !Number.isSafeInteger(num))) {
    throw new Error('Out-of-range entry/exit count at ' + where);
  }
  return num;
}

function requireColumns(records, columns, kind) {
  if (!records.length) throw new Error(kind + ': no rows');
  for (const column of columns) {
    if (!(column in records[0])) throw new Error(kind + ': missing column ' + column);
  }
}

export function normalizeStationPatronage({ stations, typicalCsv = null, monthlyCsv = null,
  periodsCsv = null, legacyMonthlyCsv = null, provenance = null } = {}) {
  if (!typicalCsv && !monthlyCsv && !periodsCsv && !legacyMonthlyCsv) {
    return { available: false, reason: 'Official Opal station files have not been imported',
      typical: {}, monthly: {}, periods: {}, legacyMonthly: {},
      coverage: { years: [], months: [], samples: [], legacyMonths: [], stationCount: 0 }, sources: SOURCE_URLS };
  }
  if (!provenance || provenance.provider !== 'Transport for NSW') {
    throw new Error('Station patronage files require provenance.json with provider "Transport for NSW"');
  }
  const index = catalogueIndex(stations || []);
  const typical = {}, monthly = {}, periods = {}, legacyMonthly = {};
  const unmatched = new Set(), used = new Set();
  const years = new Set(), months = new Set(), samples = new Set(), legacyMonths = new Set();
  let typicalRows = 0, monthlyRows = 0, periodRows = 0, legacyMonthlyRows = 0;
  function match(row, location) {
    const candidates = index.get(stationKey(row.station)) || [];
    if (candidates.length !== 1) {
      unmatched.add(row.station + ' (' + (candidates.length ? 'ambiguous match' : 'not in current station catalogue') + ')');
      return null;
    }
    used.add(candidates[0][0]);
    return candidates[0][0];
  }
  if (typicalCsv) {
    if (provenance.typicalSource !== SOURCE_URLS.typical) throw new Error('Typical-day source URL does not match official TfNSW resource');
    const rows = parseCsv(typicalCsv);
    requireColumns(rows, ['station', 'year', 'day_type', 'hour', 'entries', 'exits'], 'typical-day');
    for (const [i, r] of rows.entries()) {
      const location = 'typical-day row ' + (i + 2);
      const year = String(r.year).trim(), day = String(r.day_type).toLowerCase().trim();
      const hourStr = String(r.hour).trim(), hour = Number(hourStr);
      if (!/^(201[6-9]|202[0-3])$/.test(year) || !['weekday', 'weekend'].includes(day) ||
        !/^(?:[01]?\d|2[0-3])$/.test(hourStr) || !Number.isInteger(hour)) {
        throw new Error('Invalid historic year / day type / hour at ' + location);
      }
      const entries = parseCount(r.entries, location, false), exits = parseCount(r.exits, location, false);
      const id = match(r, location);
      if (!id) continue;
      const hours = ((((typical[year] ||= {})[day] ||= {})[id] ||= {}));
      if (hours[hour]) throw new Error('Duplicate station/year/day/hour at ' + location);
      hours[hour] = [entries, exits];
      years.add(year); typicalRows++;
    }
  }
  if (monthlyCsv) {
    if (provenance.monthlySource !== SOURCE_URLS.monthly) throw new Error('Monthly source URL does not match official TfNSW resource');
    const rows = parseCsv(monthlyCsv);
    requireColumns(rows, ['station', 'month', 'entries', 'exits'], 'monthly');
    for (const [i, r] of rows.entries()) {
      const location = 'monthly row ' + (i + 2);
      const month = String(r.month).trim();
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || month < '2024-11' || month > '2100-12') {
        throw new Error('Invalid month at ' + location);
      }
      const entries = parseCount(r.entries, location, true), exits = parseCount(r.exits, location, true);
      const id = match(r, location);
      if (!id) continue;
      const bucket = (monthly[month] ||= {});
      if (bucket[id]) throw new Error('Duplicate station/month at ' + location);
      bucket[id] = [entries, exits]; months.add(month); monthlyRows++;
    }
  }
  if (periodsCsv) {
    if (provenance.periodSource !== SOURCE_URLS.typical)
      throw Error('Sample period source URL does not match official TfNSW workbook');
    const rows=parseCsv(periodsCsv);
    requireColumns(rows,['station','sample','period','entries','exits'],'typical-periods');
    for(const [i,r] of rows.entries()){
      const at='typical-periods row '+(i+2);
      const sample=String(r.sample||'').trim(), period=String(r.period||'').trim();
      if(!SAMPLE_YEARS.includes(sample)||!SAMPLE_WINDOWS.includes(period))
        throw Error('Unexpected 2016-2023 sample period at '+at);
      const entries=parseCount(r.entries,at,false),exits=parseCount(r.exits,at,false);
      const id=match(r,at);
      if(!id)continue;
      const bucket=((periods[sample]||={})[id]||={});
      if(Object.hasOwn(bucket,period))throw Error('Duplicate sample/period/station at '+at);
      bucket[period]=[entries,exits];samples.add(sample);periodRows++;
    }
  }
  if(legacyMonthlyCsv){
    if(!Array.isArray(provenance.legacyMonthlySources) ||
       LEGACY_MONTHLY_SOURCES.some(url=>!provenance.legacyMonthlySources.includes(url)))
      throw Error('Legacy monthly source URLs do not match the two verified TfNSW CSV resources');
    const rows=parseCsv(legacyMonthlyCsv);
    requireColumns(rows,['station','month','entries','exits'],'historical-monthly');
    for(const [i,r] of rows.entries()){
      const at='historical-monthly row '+(i+2), month=String(r.month||'').trim();
      if(!/^20(?:1[6-9]|2[0-4])-(?:0[1-9]|1[0-2])$/.test(month) ||
        month<'2016-07'||month>'2024-10')
        throw Error('Invalid historical monthly period at '+at);
      const entries=parseCount(r.entries,at,true),exits=parseCount(r.exits,at,true);
      const id=match(r,at);if(!id)continue;
      const bucket=legacyMonthly[month]||={};
      if(Object.hasOwn(bucket,id))throw Error('Duplicate historical month/station at '+at);
      bucket[id]=[entries,exits];legacyMonths.add(month);legacyMonthlyRows++;
    }
  }
  if (typicalRows + monthlyRows + periodRows + legacyMonthlyRows === 0) throw new Error('No rows matched known stations. Check station names; do not publish empty data as zero.');
  return {
    available: true, typical, monthly, periods, legacyMonthly,
    coverage: { years: [...years].sort(), months: [...months].sort(), samples:SAMPLE_YEARS.filter(x=>samples.has(x)), legacyMonths:[...legacyMonths].sort(),
      stationCount: used.size, typicalRows, monthlyRows, periodRows, legacyMonthlyRows,
      unmatched: [...unmatched].sort().slice(0, 50), unmatchedCount: unmatched.size },
    sources: { typical: typicalCsv ? SOURCE_URLS.typical : null, monthly: monthlyCsv ? SOURCE_URLS.monthly : null,
      periods: periodsCsv ? SOURCE_URLS.typical : null, legacyMonthly: legacyMonthlyCsv ? LEGACY_MONTHLY_SOURCES : null },
    attribution: 'Transport for NSW Open Data · Creative Commons Attribution',
    note: 'Sampled typical-day bins are 06-10, 10-15, 15-19 and overnight 19-06; 24h is supplied total, not inferred. Monthly totals are not hourly values. Suppressed small counts are omitted, not zero.',
  };
}

export function buildStationPatronage(dataDir, stations) {
  const folder = path.join(dataDir, 'patronage');
  const file = name => path.join(folder, name);
  const typicalCsv = fs.existsSync(file('typical-day.csv')) ? fs.readFileSync(file('typical-day.csv'), 'utf8') : null;
  const monthlyCsv = fs.existsSync(file('monthly.csv')) ? fs.readFileSync(file('monthly.csv'), 'utf8') : null;
  const periodsCsv = fs.existsSync(file('typical-periods.csv')) ? fs.readFileSync(file('typical-periods.csv'),'utf8') : null;
  const legacyMonthlyCsv = fs.existsSync(file('historical-monthly.csv')) ? fs.readFileSync(file('historical-monthly.csv'),'utf8') : null;
  if (!typicalCsv && !monthlyCsv && !periodsCsv && !legacyMonthlyCsv) return normalizeStationPatronage({ stations });
  const provenance = fs.existsSync(file('provenance.json'))
    ? JSON.parse(fs.readFileSync(file('provenance.json'), 'utf8')) : null;
  return normalizeStationPatronage({ stations, typicalCsv, monthlyCsv, periodsCsv, legacyMonthlyCsv, provenance });
}
