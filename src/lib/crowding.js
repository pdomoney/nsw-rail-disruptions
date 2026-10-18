// Build a Sydney-local hour-by-line occupancy series from existing GTFS-realtime load snapshots.
// This is crowding of reporting carriages, NOT station Opal taps or an estimate of patronage.
// A five-minute snapshot has equal weight regardless of how many carriages a line operates.
import fs from 'node:fs';
import path from 'node:path';
import { parseCsv } from './csv.js';
import { addDays, iso, sydDate, sydHour, toMs } from './time.js';

export const CROWDING_DAYS = 30;
export const CROWDING_COLUMNS = ['snapshots', 'levelSum1000', 'standingShareSum1000', 'carriages', 'running', 'reportingTrains'];

function sixLevels(value) {
  if (typeof value !== 'string') return null;
  const parts = value.trim().split(/\s+/);
  if (parts.length !== 6) return null;
  const values = parts.map(Number);
  if (values.some(n => !Number.isSafeInteger(n) || n < 0)) return null;
  return values;
}

// Pure aggregate, exported for tests. Only carriage-level occupancy is used:
// mixing a full-train occupancy report with each individual carriage would be misleading.
// Repeated feed timestamps within one line count once, not once per collector poll.
export function aggregateCrowding(rows, { start, end, allowedLines = null } = {}) {
  const result = {};
  const seen = new Set();
  for (const row of rows) {
    const t = toMs(row.ts);
    if (!Number.isFinite(t) || !row.line || (allowedLines && !allowedLines.has(row.line))) continue;
    const date = sydDate(t);
    if ((start && date < start) || (end && date > end)) continue;
    const levels = sixLevels(row.cars);
    if (!levels) continue;
    const carriages = levels.reduce((a, b) => a + b, 0);
    if (!carriages) continue; // Train-only, unavailable and missing occupancy are not zero load.
    const key = row.line + '|' + row.ts;
    if (seen.has(key)) continue;
    seen.add(key);
    const hour = sydHour(t);
    const byDate = (result[row.line] ||= {});
    const byHour = (byDate[date] ||= {});
    const bucket = (byHour[hour] ||= [0, 0, 0, 0, 0, 0]);
    const level = levels.reduce((sum, count, i) => sum + count * i, 0) / carriages;
    const standing = (levels[3] + levels[4] + levels[5]) / carriages;
    bucket[0]++;
    bucket[1] += Math.round(level * 1000);
    bucket[2] += Math.round(standing * 1000);
    bucket[3] += carriages;
    bucket[4] += Math.max(0, Number(row.running) || 0);
    bucket[5] += Math.max(0, Number(row.with_occ) || 0);
  }
  return result;
}

// Reads the last 30 Sydney calendar days, preserving each day's hour buckets so the browser
// can switch weekday/weekend and 7/30 day windows without another backend request.
export function buildCrowding(dataDir, today, allowedLines = null, { days = CROWDING_DAYS, generatedAt = Date.now() } = {}) {
  const start = addDays(today, 1 - days);
  const rows = [];
  for (let i = 0; i < days; i++) {
    const date = addDays(start, i);
    const file = path.join(dataDir, 'load', date.slice(0, 7), date + '.csv');
    if (!fs.existsSync(file)) continue;
    rows.push(...parseCsv(fs.readFileSync(file, 'utf8'), ['ts', 'line', 'running', 'with_occ', 'cars']));
  }
  return {
    version: 1, generatedAt: iso(generatedAt), start, end: today,
    unit: 'reported_carriages', source: 'TfNSW GTFS-realtime vehicle occupancy',
    columns: CROWDING_COLUMNS, lines: aggregateCrowding(rows, { start, end: today, allowedLines }),
  };
}
