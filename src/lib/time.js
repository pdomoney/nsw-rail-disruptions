// Time helpers. All stored timestamps are ISO strings in UTC; days are Sydney calendar days.

export const TZ = 'Australia/Sydney';
const dateFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
const partsFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
});

export const MIN = 60_000;
export const HOUR = 3_600_000;
export const DAY = 86_400_000;

export function toMs(v) {
  if (v == null) return null;
  if (typeof v === 'number') return v;
  const t = Date.parse(v);
  return Number.isNaN(t) ? null : t;
}

export function iso(ms) {
  return new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

// 'YYYY-MM-DD' for the Sydney calendar day containing `ms`.
export function sydDate(ms) {
  return dateFmt.format(new Date(ms));
}

export function sydHour(ms) {
  const p = partsFmt.formatToParts(new Date(ms));
  return Number(p.find(x => x.type === 'hour').value);
}

// Day of week for the Sydney day containing `ms` (0 = Monday … 6 = Sunday).
export function sydWeekday(ms) {
  const d = sydDate(ms);
  const [y, m, dd] = d.split('-').map(Number);
  return (new Date(Date.UTC(y, m - 1, dd)).getUTCDay() + 6) % 7;
}

// UTC ms of Sydney local midnight at the start of `dateStr`.
export function sydMidnight(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  for (const off of [11, 10]) {
    const t = Date.UTC(y, m - 1, d) - off * HOUR;
    if (sydDate(t) === dateStr && sydHour(t) === 0) return t;
  }
  throw new Error('Cannot resolve Sydney midnight for ' + dateStr);
}

export function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

export function daysBetween(a, b) {
  const pa = a.split('-').map(Number), pb = b.split('-').map(Number);
  return Math.round((Date.UTC(pb[0], pb[1] - 1, pb[2]) - Date.UTC(pa[0], pa[1] - 1, pa[2])) / DAY);
}

// Split [startMs, endMs) into per-Sydney-day pieces: [{ date, ms }].
export function splitByDay(startMs, endMs) {
  const out = [];
  if (!(endMs > startMs)) return out;
  let day = sydDate(startMs);
  let cur = startMs;
  while (cur < endMs) {
    const next = sydMidnight(addDays(day, 1));
    const stop = Math.min(next, endMs);
    out.push({ date: day, ms: stop - cur });
    cur = stop;
    day = addDays(day, 1);
  }
  return out;
}
