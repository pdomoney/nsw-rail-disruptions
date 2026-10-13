// The delay clock: a rough count of the time passengers lose to late trains, from the load and
// delay of every running service at each collection run (load/YYYY-MM/YYYY-MM-DD.csv).
//
// At each run, a service carrying L people that is D seconds late delivers, every minute, about
// L ÷ RIDE_MINUTES passengers to their stop, each D seconds late. So the lateness delivered per minute
// is (sum of D × L over running services) ÷ RIDE_MINUTES, and each run stands for the minutes until
// the next one (at most 10). Loads come from TfNSW occupancy levels: predicted per carriage for
// Sydney Trains and Intercity, measured per carriage for Metro.
import { RIDE_MINUTES, PAX_PER_CAR } from './service-stats.js';
import { sydDate, sydHour, toMs } from './time.js';

// Rough passengers aboard one carriage at each occupancy level (empty, many seats, few seats, standing
// room, crowded, full): a double-deck Sydney Trains carriage (about 110 seats) and a Metro carriage
// (about 63 seats, with more standing room).
export const CAR_LOAD = {
  train: PAX_PER_CAR,
  metro: [3, 15, 45, 100, 150, 180],
};
const TRAIN_CARS = 8;           // carriages assumed when only a level for the whole train is given
const MAX_STEP_MIN = 10;         // a run counts for at most this many minutes
const MAX_SCALE = 4;             // running services without a load figure are assumed to be like those with one

const nums = s => String(s || '').trim().split(/\s+/).map(Number);

// One load row → { pax aboard, paxDelay (passenger-seconds of current lateness) }, scaled up to all
// running services of the line, or null when the line has no load figures for this mode.
export function rowLoad(r, mode) {
  const table = CAR_LOAD[mode];
  if (!table) return null;
  const running = Number(r.running) || 0, withOcc = Number(r.with_occ) || 0;
  if (!withOcc) return null;
  const cars = nums(r.cars), carDelay = nums(r.car_delay_s), trains = nums(r.trains), trainDelay = nums(r.train_delay_s);
  let pax = 0, paxDelay = 0;
  for (let l = 0; l < 6; l++) {
    pax += (cars[l] || 0) * table[l] + (trains[l] || 0) * TRAIN_CARS * table[l];
    paxDelay += (carDelay[l] || 0) * table[l] + (trainDelay[l] || 0) * TRAIN_CARS * table[l];
  }
  const scale = Math.min(MAX_SCALE, running / withOcc);
  return { pax: pax * scale, paxDelay: paxDelay * scale };
}

// rows: parsed load CSV rows (any order). modeOf(line) → 'train' | 'intercity' | 'metro' | ….
// Returns { days: { date: { line: { min, hours[24] } } }, latest: { line: { at, perMin, pax } }, first: { date: ms } }
// where min is passenger-minutes of lateness, perMin the rate at the latest run and first the time of
// the day's first reading.
export function delayClock(rows, modeOf) {
  const byLine = new Map();
  for (const r of rows) {
    const t = toMs(r.ts);
    if (t == null || !r.line) continue;
    if (!byLine.has(r.line)) byLine.set(r.line, []);
    byLine.get(r.line).push([t, r]);
  }
  const days = {}, latest = {}, first = {};
  for (const [line, list] of byLine) {
    const mode = modeOf(line) === 'intercity' ? 'train' : modeOf(line);
    list.sort((a, b) => a[0] - b[0]);
    list.forEach(([t, r], i) => {
      const load = rowLoad(r, mode);
      if (!load) return;
      const next = list[i + 1]?.[0];
      const step = Math.min(MAX_STEP_MIN, next ? (next - t) / 60000 : 5);
      const perMin = load.paxDelay / RIDE_MINUTES / 60; // passenger-minutes of lateness per minute
      const d = sydDate(t);
      if (!(first[d] <= t)) first[d] = t;
      const L = ((days[d] ||= {})[line] ||= { min: 0, hours: new Array(24).fill(0) });
      L.min += perMin * step;
      L.hours[sydHour(t)] += perMin * step;
      if (!latest[line] || t > latest[line].at) latest[line] = { at: t, perMin, pax: load.pax };
    });
  }
  return { days, latest, first };
}
