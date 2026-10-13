// Planned trackwork ahead, from the planned alerts currently published in the TfNSW alerts feed
// (TfNSW publishes them about three weeks in advance, each with its exact closure windows).
import { lineOrder } from '../config/lines.js';
import { toMs, DAY } from './time.js';

// Windows longer than this are standing notices rather than trackwork (as in the build's planned hours).
const MAX_WINDOW_MS = 16 * DAY;

// How much an alert changes a journey, from its title (falling back to its text):
//   3  part of the line closed, or buses replace all trains on a section
//   2  some trains replaced by buses, or trains cut short or sent to other platforms
//   1  changed timetable or stopping pattern
//   0  extra services only
export function severity(title, text = '') {
  const t = `${title || ''}`.toLowerCase();
  const all = `${t} ${String(text || '').toLowerCase()}`;
  const test = s => (t ? s.test(t) : s.test(all));
  if (test(/partial closure|do not run|does not run|will not run|\bclosed\b|no (trains|services|light rail|metro)\b/)) return 3;
  if (test(/buses replace (?!some)(\w+ ){0,2}(trains|metro|light rail|services|trams)\b/) && !test(/at times,? buses replace/)) return 3;
  if (test(/buses replace some|at times,? buses replace|run between .+ only|platforms \d|change trains|terminate/)) return 2;
  if (test(/changed timetable|stopping pattern|extra stops?|reduced frequency|less frequent|may need to/)) return 1;
  if (test(/extra .*(services|trains) run/)) return 0;
  return 1;
}

// "T1 Western Line: Buses replace trains …" → { branch: 'Western Line', title: 'Buses replace trains …' }
export function splitBranch(title) {
  const m = /^((?:[TML]\d+ )?[A-Z][\w &'-]*? Line|City Circle):\s*(.+)$/.exec(String(title || '').trim());
  if (!m) return { branch: null, title: String(title || '').trim() };
  return { branch: m[1].replace(/^[TML]\d+ /, ''), title: m[2].charAt(0).toUpperCase() + m[2].slice(1) };
}

// Alert body → the line that gives the dates ("Saturday 24 and Sunday 25 October") and the bullet points.
export function splitText(text) {
  const lines = String(text || '').split(/\n+/).map(s => s.trim()).filter(Boolean);
  let dateLine = null;
  if (lines.length && !lines[0].startsWith('•')) dateLine = lines.shift();
  const bullets = lines.map(s => s.replace(/^•\s*/, '').replace(/\s+([.,])/g, '$1').trim()).filter(Boolean);
  return { dateLine, bullets };
}

// Open alert records → trackwork items with at least one window not yet over, soonest first. TfNSW often
// publishes the same work once per line (T4 and South Coast, say); those are merged into one item.
export function trackworkItems(records, nowMs) {
  const items = [];
  const byKey = new Map();
  for (const r of records) {
    if (r.k !== 'planned' || r.stale) continue;
    const w = (r.w || [])
      .map(([f, t]) => [toMs(f), toMs(t)])
      .filter(([f, t]) => f != null && t != null && t > nowMs && t - f <= MAX_WINDOW_MS)
      .sort((a, b) => a[0] - b[0]);
    if (!w.length || !r.l?.length) continue;
    const { branch, title } = splitBranch(r.t);
    const { dateLine, bullets } = splitText(r.x);
    const key = `${title.toLowerCase()}|${branch || ''}|${JSON.stringify(w)}`;
    const same = byKey.get(key);
    if (same) {
      same.l = [...new Set([...same.l, ...r.l])].sort((a, b) => lineOrder(a) - lineOrder(b));
      continue;
    }
    const item = {
      id: r.id,
      l: [...r.l].sort((a, b) => lineOrder(a) - lineOrder(b)),
      branch,
      title,
      sev: severity(r.t, r.x),
      dateLine,
      bullets,
      w: w.map(([f, t]) => [new Date(f).toISOString(), new Date(t).toISOString()]),
    };
    byKey.set(key, item);
    items.push(item);
  }
  return items.sort((a, b) => Date.parse(a.w[0][0]) - Date.parse(b.w[0][0]) || b.sev - a.sev);
}
