import { heatmap, hbars, columns, line as lineChart, onColor, showTip, hideTip, compact } from './charts.js';
import { viewPatronage } from './patronage.js';
import { loadLeaflet, createGeographicMap, geographicStationLines, trainDescription } from './geo-map.js';
import {southwestMetroMapSummary,METRO_SOUTHWEST_OFFICIAL_URL} from './metro-southwest.js';
import { drawOfficialOverlay, OFFICIAL_MAP, loadOfficialMapImage, mapTrainHoverRows } from './official-map.js';
import { viewStationPatronage } from './station-patronage.js';

// Replaced in the published JS asset, never in the repository source file.
const SITE_RELEASE = '__SITE_RELEASE__';


// ---------- formatting (always Sydney time) ----------
const TZ = 'Australia/Sydney';
const F = {
  day: new Intl.DateTimeFormat('en-AU', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }),
  dayShort: new Intl.DateTimeFormat('en-AU', { timeZone: TZ, day: 'numeric', month: 'short' }),
  month: new Intl.DateTimeFormat('en-AU', { timeZone: 'UTC', month: 'short', year: 'numeric' }),
  monthShort: new Intl.DateTimeFormat('en-AU', { timeZone: 'UTC', month: 'short' }),
  dateUTC: new Intl.DateTimeFormat('en-AU', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }),
  dateUTCShort: new Intl.DateTimeFormat('en-AU', { timeZone: 'UTC', day: 'numeric', month: 'short' }),
  time: new Intl.DateTimeFormat('en-AU', { timeZone: TZ, hour: 'numeric', minute: '2-digit' }),
  dayKey: new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }),
  hour: new Intl.DateTimeFormat('en-AU', { timeZone: TZ, hour: 'numeric', hourCycle: 'h23' }),
  dayNoYear: new Intl.DateTimeFormat('en-AU', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short' }),
};
const ms = s => Date.parse(s);
const time = s => F.time.format(new Date(ms(s))).replace(' ', ' ');
const dayOf = s => F.day.format(new Date(ms(s)));
const sydKey = t => F.dayKey.format(new Date(t));
const dateFromKey = k => new Date(k + 'T00:00:00Z');
const addDays = (k, n) => { const d = dateFromKey(k); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const plural = (n, one, many = one + 's') => `${n.toLocaleString('en-AU')} ${n === 1 ? one : many}`;

function duration(msLen) {
  const m = Math.max(1, Math.round(msLen / 60000));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60), r = m % 60;
  if (h < 48) return r ? `${h} h ${r} min` : `${h} h`;
  const d = Math.floor(h / 24), rh = h % 24;
  return rh ? `${d} days ${rh} h` : `${d} days`;
}
function hours(minutes) {
  const h = minutes / 60;
  if (h === 0) return '0 h';
  if (h < 10) return `${(Math.round(h * 10) / 10).toLocaleString('en-AU')} h`;
  return `${Math.round(h).toLocaleString('en-AU')} h`;
}
function ago(iso) {
  const m = Math.round((Date.now() - ms(iso)) / 60000);
  if (m < 2) return 'just now';
  if (m < 60) return `${m} minutes ago`;
  const h = Math.round(m / 60);
  if (h < 36) return `${h} ${h === 1 ? 'hour' : 'hours'} ago`;
  return `${Math.round(h / 24)} days ago`;
}

// ---------- tiny DOM helper ----------
function h(tag, attrs = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else if (k === 'style' && typeof v === 'object') {
      for (const [prop, val] of Object.entries(v)) {
        if (prop.startsWith('--')) n.style.setProperty(prop, String(val)); else n.style[prop] = val;
      }
    }
    else n.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat(Infinity)) if (c != null && c !== false) n.append(c instanceof Node ? c : String(c));
  return n;
}
const ICON = {
  disrupted: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.6 15 14H1L8 1.6Z" fill="currentColor"/><path d="M8 6v3.6M8 11.6v.2" stroke="#fff" stroke-width="1.7" stroke-linecap="round"/></svg>',
  planned: '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="1.5" y="2.5" width="13" height="12" rx="2" fill="currentColor"/><path d="M4.5 1v3M11.5 1v3M4 7.5h8" stroke="#fff" stroke-width="1.5" stroke-linecap="round"/></svg>',
  good: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="7" fill="currentColor"/><path d="m4.8 8.2 2.2 2.2 4.2-4.6" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  unknown: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M5 8h6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
};
function stateEl(kind, label) {
  const s = h('span', { class: `state ${kind}` });
  s.innerHTML = ICON[kind];
  s.append(label);
  return s;
}

// ---------- data ----------
const D = { meta: null, daily: null, status: null, delays: null, clock: null, line: {}, log: {}, service: null, serviceDay: {}, trackwork: null, network: null, live: null };
async function getJson(p) {
  const r = await fetch(p, { cache: 'no-cache' });
  if (!r.ok) throw new Error(`Could not load ${p} (HTTP ${r.status})`);
  return r.json();
}
const lineInfo = id => D.meta.lines.find(l => l.id === id) || { id, name: id, color: '#7a7a7a', mode: 'train' };
const fullName = l => (/^[TML]\d/.test(l.id) ? `${l.id} ${l.name}` : l.name);
function badge(id, { link = true, size = '' } = {}) {
  const l = lineInfo(id);
  const attrs = { class: `badge ${size}`.trim(), style: { background: l.color, color: onColor(l.color) }, title: fullName(l) };
  return link ? h('a', { ...attrs, href: `#/line/${l.id}`, 'aria-label': fullName(l) }, l.id) : h('span', attrs, l.id);
}

// ---------- preferences (per viewer, optional) ----------
const prefs = (() => {
  let p = {};
  try { p = JSON.parse(localStorage.getItem('nrd-prefs') || '{}'); } catch { p = {}; }
  return {
    get: (k, d) => (p[k] ?? d),
    set: (k, v) => { p[k] = v; try { localStorage.setItem('nrd-prefs', JSON.stringify(p)); } catch { /* storage unavailable */ } },
  };
})();

// ---------- ranges, buckets and metrics ----------
const RANGES = [['30d', '30 days', 30], ['90d', '90 days', 90], ['12m', '12 months', 365], ['all', 'All', Infinity]];
function rangeIdx(key) {
  const N = D.daily.days;
  const len = RANGES.find(r => r[0] === key)?.[2] ?? 90;
  return [Math.max(0, N - Math.min(len, N)), N - 1];
}
const dayKeyAt = i => addDays(D.daily.start, i);

// Split [a, b] day indexes into columns of a day, a week (Mon–Sun) or a calendar month.
function buckets(a, b, unit) {
  const cols = [];
  if (unit === 'day') {
    for (let i = a; i <= b; i++) cols.push({ a: i, b: i, key: dayKeyAt(i) });
  } else if (unit === 'week') {
    let i = a;
    while (i <= b) {
      const dow = (dateFromKey(dayKeyAt(i)).getUTCDay() + 6) % 7;
      const end = Math.min(b, i + (6 - dow));
      cols.push({ a: i, b: end, key: dayKeyAt(i) });
      i = end + 1;
    }
  } else {
    let i = a;
    while (i <= b) {
      const k = dayKeyAt(i);
      const next = new Date(Date.UTC(+k.slice(0, 4), +k.slice(5, 7), 1)).toISOString().slice(0, 10);
      const end = Math.min(b, i + Math.round((dateFromKey(next) - dateFromKey(k)) / 864e5) - 1);
      cols.push({ a: i, b: end, key: k });
      i = end + 1;
    }
  }
  return cols;
}
function pickUnit(nDays, plotW, minCell = 5) {
  if (plotW / nDays >= minCell) return 'day';
  if (plotW / Math.ceil(nDays / 7) >= minCell) return 'week';
  return 'month';
}
function colLabel(c, unit) {
  const d = dateFromKey(c.key);
  if (unit === 'month') return F.month.format(d);
  if (unit === 'week') return `Week of ${F.dateUTC.format(d)}`;
  return F.dateUTC.format(d);
}
function ticksFor(cols, unit) {
  const out = [];
  let lastMonth = null, lastYear = null;
  cols.forEach((c, i) => {
    const m = c.key.slice(0, 7), y = c.key.slice(0, 4);
    const newYear = lastYear !== null && y !== lastYear;
    if (unit === 'month') {
      if (lastYear === null || newYear) out.push({ i, label: y, major: true });
      else if (cols.length <= 14) out.push({ i, label: F.monthShort.format(dateFromKey(c.key)) });
    } else if (m !== lastMonth) {
      out.push(newYear ? { i, label: y, major: true } : { i, label: F.monthShort.format(dateFromKey(c.key)) });
    }
    lastMonth = m; lastYear = y;
  });
  return out;
}

const HEAT = ['var(--heat-1)', 'var(--heat-2)', 'var(--heat-3)', 'var(--heat-4)', 'var(--heat-5)', 'var(--heat-6)'];
const PLAN = ['var(--plan-1)', 'var(--plan-2)', 'var(--plan-3)', 'var(--plan-4)', 'var(--plan-5)', 'var(--plan-6)'];
const METRICS = {
  unplanned: {
    label: 'Unplanned disruption', ramp: HEAT, bins: [1, 3, 6, 12, 18], legend: 'Hours per day with an unplanned disruption alert',
    tickLabels: ['<1', '1–3', '3–6', '6–12', '12–18', '18+'],
    day: (L, i) => L.inc[i] / 60, total: (L, a, b) => sum(L.inc, a, b), totalLabel: v => hours(v),
    tip: (L, c) => [`${hours(sum(L.inc, c.a, c.b))} of unplanned disruption`, plural(sum(L.n, c.a, c.b), 'incident')],
  },
  planned: {
    label: 'Planned closures', ramp: PLAN, bins: [1, 3, 6, 12, 18], legend: 'Hours per day covered by planned trackwork or closures',
    tickLabels: ['<1', '1–3', '3–6', '6–12', '12–18', '18+'],
    day: (L, i) => L.pl[i] / 60, total: (L, a, b) => countDays(L.pl, a, b), totalLabel: v => `${v} d`,
    tip: (L, c) => [`${hours(sum(L.pl, c.a, c.b))} of planned closures`, plural(countDays(L.pl, c.a, c.b), 'day') + ' affected'],
  },
  lost: {
    label: 'Trips lost', ramp: HEAT, bins: [0.5, 1, 2, 5, 10], legend: 'Share of timetabled trips cancelled or never seen in the live data',
    tickLabels: ['<0.5%', '0.5–1%', '1–2%', '2–5%', '5–10%', '10%+'],
    day: (L, i) => (L.tc?.[i] ? (100 * L.tl[i]) / L.tc[i] : null),
    total: (L, a, b) => { const c = sum(L.tc || [], a, b); return c ? (100 * sum(L.tl || [], a, b)) / c : 0; },
    totalLabel: v => pctLabel(v), from: () => D.daily.service?.start ?? Infinity, noData: 'No live trip data for this period',
    tip: (L, c) => { const n = sum(L.tc || [], c.a, c.b), l = sum(L.tl || [], c.a, c.b); return [`${pctLabel(n ? (100 * l) / n : 0)} of timetabled trips lost`, `${plural(l, 'trip')} of ${n.toLocaleString('en-AU')} cancelled or never seen`]; },
  },
  cancelled: {
    label: 'Cancellation alerts', ramp: HEAT, bins: [2, 5, 10, 20, 40], legend: 'Trip cancellation alerts per day',
    tickLabels: ['1', '2–4', '5–9', '10–19', '20–39', '40+'],
    day: (L, i) => L.can[i], total: (L, a, b) => sum(L.can, a, b), totalLabel: v => compact(v), from: () => D.daily.tripStart ?? 0,
    tip: (L, c) => [plural(sum(L.can, c.a, c.b), 'cancellation alert'), plural(sum(L.late, c.a, c.b), 'running-late alert')],
  },
};
function sum(arr, a, b) { let s = 0; for (let i = a; i <= b; i++) s += arr[i] || 0; return s; }
// "1.2%", "0.4%", "12%", "100%"
function pctLabel(v) {
  if (!(v > 0)) return '0%';
  if (v >= 99.95 && v < 100) return '99.9%';
  return v < 10 || (v > 90 && v < 100) ? `${(Math.round(v * 10) / 10).toLocaleString('en-AU')}%` : `${Math.round(v)}%`;
}
// Copy the per-day service counts (trips counted and lost) onto the calendar's line arrays.
function attachService(daily) {
  const svc = daily.service;
  if (!svc) return;
  for (const [id, { tc, tl }] of Object.entries(svc.lines)) {
    const L = daily.lines[id];
    if (!L) continue;
    L.tc = new Array(daily.days).fill(0);
    L.tl = new Array(daily.days).fill(0);
    tc.forEach((v, k) => { if (svc.start + k < daily.days) { L.tc[svc.start + k] = v; L.tl[svc.start + k] = tl[k]; } });
  }
}
function countDays(arr, a, b) { let s = 0; for (let i = a; i <= b; i++) if (arr[i] > 0) s++; return s; }
function covered(c) { for (let i = c.a; i <= c.b; i++) if (D.daily.coverage[i] > 0) return true; return false; }
function binOf(v, bins) {
  if (!(v > 0)) return -1;
  let k = 0;
  while (k < bins.length && v >= bins[k]) k++;
  return k;
}

function legendEl(metric) {
  const m = METRICS[metric];
  return h('div', { class: 'legend' },
    h('span', {}, m.legend),
    h('span', { class: 'legend-item' }, h('span', { class: 'legend-swatch', style: { background: 'var(--heat-0)' } }), 'None'),
    h('span', { class: 'legend-scale' }, m.ramp.map((c, k) => h('span', { class: 'legend-step' },
      h('span', { class: 'legend-swatch', style: { background: c } }), h('span', {}, m.tickLabels[k])))),
    h('span', { class: 'legend-item' }, h('span', { class: 'legend-swatch hatch' }), 'No data collected'),
  );
}

// ---------- shared controls ----------
function segmented(options, current, onChange, label) {
  const g = h('div', { class: 'seg', role: 'group', 'aria-label': label });
  for (const [val, text] of options) {
    g.append(h('button', { type: 'button', 'aria-pressed': String(val === current), onclick: () => onChange(val) }, text));
  }
  return g;
}

let resizeHandlers = [];
// Listeners added by a view are removed when the view is replaced.
let viewAbort = new AbortController();
let resizeTimer = null;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => resizeHandlers.forEach(f => f()), 150);
});
function onResize(f) { resizeHandlers.push(f); }

// ---------- views ----------
function lineStatus(id) {
  const s = D.status.lines[id] || {};
  if (s.incidents?.length) return { kind: 'disrupted', label: s.incidents.length > 1 ? `${s.incidents.length} disruptions` : 'Disrupted', detail: s.incidents[0].x || s.incidents[0].t };
  const nowPlanned = s.planned?.filter(p => p.now) || [];
  if (nowPlanned.length) return { kind: 'planned', label: 'Planned closure now', detail: nowPlanned[0].t };
  if (s.planned?.length) return { kind: 'planned', label: 'Trackwork today', detail: s.planned[0].t };
  return { kind: 'good', label: 'No alerts', detail: '' };
}

function liveText(live, id) {
  if (!live || !live.active) return null;
  const thr = lineInfo(id).mode === 'intercity' ? 6 : 5;
  const pct = Math.round((100 * live.late) / live.active);
  return `Average delay ${(live.mean / 60).toFixed(1)} min, ${pct}% over ${thr} min`;
}

// Current unplanned incidents, one entry per alert with every line it affects (newest first).
function currentDisruptions() {
  const byId = new Map();
  for (const l of D.meta.lines) {
    for (const inc of D.status.lines[l.id]?.incidents || []) {
      if (!byId.has(inc.id)) byId.set(inc.id, { inc, lines: [] });
      byId.get(inc.id).lines.push(l.id);
    }
  }
  return [...byId.values()].sort((a, b) => ms(b.inc.st) - ms(a.inc.st));
}

function liveSentence(lines) {
  const parts = [];
  for (const id of lines) {
    const live = D.status.lines[id]?.live;
    if (!live?.active) continue;
    const thr = lineInfo(id).mode === 'intercity' ? 6 : 5;
    const pct = Math.round((100 * live.late) / live.active);
    parts.push(`${id} average delay ${(live.mean / 60).toFixed(1)} min, ${pct}% of services ${thr}+ min late`);
  }
  return parts.length ? `Live trip data: ${parts.join('; ')}.` : null;
}

const NOW_SHOWN = 4;
let nowShowAll = false;

function mentionsStation(text, station) {
  const name = station.s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\b(at|near|between|and|from|to|around)\\s+${name}\\b`, 'i').test(text);
}

function disruptionItem({ inc, lines }, { stations = [] } = {}) {
  const summary = inc.t || 'Service disruption';
  let rest = inc.x || '';
  if (!summary.endsWith('…') && rest.startsWith(summary)) rest = rest.slice(summary.length).trim();
  else if (rest === summary) rest = '';
  rest = rest.replace(/\n{2,}/g, '\n');
  const start = ms(inc.st);
  const startDay = sydKey(start) === sydKey(Date.now()) ? '' : ` ${F.dayShort.format(new Date(start))}`;
  const live = liveSentence(lines);
  const cause = inc.c && inc.c !== 'unknown' ? D.meta.causes[inc.c] : null;
  return h('li', { class: 'now-alert' },
    h('div', { class: 'now-alert-meta' },
      h('span', { class: 'now-alert-lines' }, lines.map(id => badge(id))),
      stateEl('disrupted', `Since ${time(inc.st)}${startDay}, ${duration(Date.now() - start)} so far`),
      cause ? h('span', { class: 'muted' }, `Cause: ${cause}`) : null,
      stations.filter(st => mentionsStation(`${inc.t} ${inc.x}`, st)).map(st => h('span', { class: 'mention' }, `Mentions ${st.s}`))),
    h('p', { class: 'now-alert-summary' }, summary),
    rest ? (rest.length > 280 ? longText(rest) : h('p', { class: 'alert-text' }, rest)) : null,
    h('p', { class: 'now-alert-foot' },
      live ? h('span', {}, live) : null,
      h('a', { href: `https://transportnsw.info/alerts/details#/${encodeURIComponent(inc.id)}`, rel: 'noopener' }, 'Full alert on transportnsw.info')));
}

function nowAlerts() {
  const list = currentDisruptions();
  if (!list.length) return null;
  const shown = nowShowAll ? list : list.slice(0, NOW_SHOWN);
  const wrap = h('div', {}, h('ul', { class: 'now-alerts', 'aria-label': 'Current unplanned disruptions' }, shown.map(disruptionItem)));
  if (list.length > shown.length) {
    wrap.append(h('button', { type: 'button', class: 'more', onclick: () => { nowShowAll = true; wrap.replaceWith(nowAlerts()); } },
      `Show ${plural(list.length - shown.length, 'more disruption')}`));
  }
  return wrap;
}

function viewOverview(main) {
  const { meta, status } = D;
  const disrupted = meta.lines.filter(l => status.lines[l.id]?.incidents?.length);
  const plannedToday = meta.lines.filter(l => status.lines[l.id]?.planned?.length);

  const head = h('h1', { class: 'now-headline' });
  if (!disrupted.length) head.append('No unplanned disruptions on trains, metro or light rail right now.');
  else {
    head.append(disrupted.length === 1 ? 'Unplanned disruption on ' : 'Unplanned disruptions on ');
    // Keep each comma with its badge so a line never starts with one.
    const n = disrupted.length;
    disrupted.forEach((l, i) => {
      head.append(h('span', { class: 'nowrap' }, badge(l.id), i < n - 2 ? ',' : ''));
      if (i < n - 1) head.append(i === n - 2 ? ' and ' : ' ');
    });
    head.append(' right now.');
  }
  const checked = status.alertsAt
    ? `Alerts checked at ${time(status.alertsAt)} on ${F.dayShort.format(new Date(ms(status.alertsAt)))}. This page updates itself every few minutes.`
    : 'Alerts have not been checked yet.';
  const sub = h('p', { class: 'now-sub' },
    plannedToday.length ? `Planned trackwork or closures affect ${plural(plannedToday.length, 'line')} today. ` : 'No planned closures today. ',
    h('a', { href: '#/trackwork' }, 'See trackwork ahead'), '. ',
    checked);
  const stale = isStale()
    ? h('p', { class: 'stale-note' }, stateEl('unknown', ''), `The alerts were last collected ${ago(status.alertsAt)}, so this may be out of date. Check transportnsw.info for live information.`)
    : null;

  // Sydney Trains on the left, Metro and Light rail on the right, everything else (Intercity) below.
  const BOARD_LEFT = ['train'], BOARD_RIGHT = ['metro', 'lightrail'];
  const modes = Object.entries(meta.modes).sort((a, b) => a[1].order - b[1].order).map(([m]) => m);
  const group = (mode, wide = false) => {
    const lines = meta.lines.filter(l => l.mode === mode);
    if (!lines.length) return null;
    const label = meta.modes[mode]?.label || mode;
    const rows = h('div', { class: 'board-rows', style: { '--rows': Math.ceil(lines.length / 2) } });
    for (const l of lines) {
      const st = lineStatus(l.id);
      const live = liveText(status.lines[l.id]?.live, l.id);
      rows.append(h('a', { class: 'board-row', href: `#/line/${l.id}` },
        badge(l.id, { link: false }),
        h('span', { class: 'board-name' }, l.name, st.detail ? h('span', { class: 'board-detail' }, st.detail) : null),
        h('span', {}, stateEl(st.kind, st.label), live ? h('span', { class: 'live' }, live) : null)));
    }
    return h('section', { class: wide ? 'board-group board-wide' : 'board-group', 'aria-label': label }, h('h2', {}, label), rows);
  };
  const board = h('div', { class: 'board' },
    h('div', { class: 'board-main' },
      h('div', { class: 'board-col' }, BOARD_LEFT.map(m => group(m))),
      h('div', { class: 'board-col' }, BOARD_RIGHT.map(m => group(m)))),
    modes.filter(m => !BOARD_LEFT.includes(m) && !BOARD_RIGHT.includes(m)).map(m => group(m, true)));

  // This landing page serves immediate travel decisions. Long-running
  // disruption calendar/ranking charts now live under Insights → History,
  // where they keep their existing data, filters and interactive elements.
  const shortcuts=h('nav', { class:'today-shortcuts',
    'aria-label':'Useful actions for travelling today' },
    h('a', { href:'#/map', class:'today-shortcut' },
      h('strong', {}, 'Explore network map'),
      h('span', {}, 'Train positions and stations')),
    h('a', { href:'#/trackwork', class:'today-shortcut' },
      h('strong', {}, 'Check trackwork'),
      h('span', {}, 'Planned changes and closures')),
    h('a', { href:'#/trip', class:'today-shortcut' },
      h('strong', {}, 'Plan a trip'),
      h('span', {}, 'Check a route and its alerts')));
  const historical=h('aside', { class:'today-history-link',
    'aria-label':'Historical rail disruption analysis' },
    h('div', {},
      h('strong', {}, 'Looking for historical performance?'),
      h('p', {}, 'Find the disruption calendar, line comparisons and causes alongside the full alert archive.')),
    h('a', { href:'#/log' }, 'Explore Insights → History'));
  main.replaceChildren(
    nowSection(head, sub, stale),
    shortcuts,
    board,
    historical,
  );
}

// ---------- delay clock ----------
// Passenger-hours lost to lateness and to waiting after cancelled trips, per line and day.
function clockDay(date) {
  const c = D.clock;
  const j = c?.days.indexOf(date) ?? -1;
  const byLine = {};
  let late = 0, wait = 0;
  if (j < 0) return { late, wait, byLine, found: false };
  for (const [id, perDay] of Object.entries(c.lines)) {
    const v = perDay[j];
    if (!v || !D.meta.lines.some(l => l.id === id)) continue;
    byLine[id] = v;
    late += v[0]; wait += v[1];
  }
  return { late, wait, byLine, found: true };
}
const hoursLabel = minutes => Math.round(minutes / 60).toLocaleString('en-AU');
let clockTimer = null;
// The hero: a slim banner with the delay clock and today's trips; the headline under it with the lines
// running late now beside it; then the current disruptions across the full width.
function nowSection(head, sub, stale) {
  const alerts = nowAlerts();
  const banner = statsBanner();
  const late = lateNowBlock();
  return h('section', { class: 'now', 'aria-labelledby': 'now-h' },
    banner,
    h('div', { class: 'now-head' },
      h('p', { class: 'page-eyebrow' }, 'Today · NSW network'),
      Object.assign(head, { id: 'now-h' }), sub, stale),
    late ? h('div', { class: 'now-side' }, late) : null,
    alerts ? h('div', { class: 'now-list-wrap' }, alerts) : null);
}

function statsBanner() {
  const cells = [clockCell(), tripsTodayCell()].filter(Boolean);
  if (!cells.length) return null;
  return h('aside', { class: 'stats-banner', 'aria-label': 'Today in numbers' }, cells);
}

// Today's timetabled trips so far (from the service record).
function tripsTodayCell() {
  const t = D.status.service;
  if (!t || t.date !== sydKey(Date.now()) || !t.counted) return null;
  const lost = t.cancelled + t.missing;
  const n = v => v.toLocaleString('en-AU');
  const parts = [`${n(t.counted - lost)} of ${n(t.counted)}`];
  if (t.cancelled) parts.push(`${n(t.cancelled)} cancelled`);
  if (t.missing) parts.push(`${n(t.missing)} never seen`);
  return h('p', { class: 'stat' },
    h('span', { class: 'stat-label' }, 'Trips today'),
    h('span', { class: 'stat-num' }, `${pctLabel((100 * (t.counted - lost)) / t.counted)} ran`),
    h('span', { class: 'stat-text' }, parts.join(' · ')),
    h('a', { class: 'stat-link', href: '#/service', 'aria-label': 'See today’s trips' }, 'Details'));
}

// Lines with the most late services in the latest live trip data.
const LATE_SHOWN = 5;
function lateNowBlock() {
  const rows = D.meta.lines.map(l => ({ id: l.id, live: D.status.lines[l.id]?.live }))
    .filter(x => x.live?.active >= 3)
    .map(x => ({ ...x, pct: (100 * x.live.late) / x.live.active }))
    .sort((a, b) => b.pct - a.pct || b.live.mean - a.live.mean);
  if (!rows.length) return null;
  const late = rows.filter(x => x.pct >= 5 || x.live.mean >= 120).slice(0, LATE_SHOWN);
  const at = rows.map(x => x.live.at).sort().pop();
  return h('section', { class: 'side-block', 'aria-labelledby': 'late-now-h' },
    h('h2', { id: 'late-now-h', class: 'clock-label' }, 'Running late now'),
    late.length
      ? h('ul', { class: 'late-list' }, late.map(x => {
        const thr = lineInfo(x.id).mode === 'intercity' ? 6 : 5;
        return h('li', {}, badge(x.id),
          h('span', { class: 'late-bar', style: { '--w': `${Math.min(100, x.pct)}%` }, 'aria-hidden': 'true' }),
          h('span', { class: 'late-text' }, h('strong', {}, `${Math.round(x.pct)}%`), ` ${thr}+ min late`, h('span', { class: 'muted' }, ` · avg ${(x.live.mean / 60).toFixed(1)} min`)));
      }))
      : h('p', { class: 'clock-unit' }, 'Every line is within a few minutes of its timetable.'),
    h('p', { class: 'clock-meta' }, `Share of running services, from live trip data at ${time(at)}.`));
}

function clockCell() {
  const c = D.clock;
  const today = sydKey(Date.now());
  const day = clockDay(today);
  if (!c || !day.found || !(day.late + day.wait > 0)) return null;
  const num = h('span', { class: 'stat-num' });
  const base = day.late + day.wait;
  // Between data updates the clock keeps counting at the latest rate (for up to 15 minutes).
  const tick = () => {
    const since = c.asOf ? Math.min(15, Math.max(0, (Date.now() - ms(c.asOf)) / 60000)) : 0;
    num.textContent = hoursLabel(base + (c.perMin || 0) * since);
  };
  tick();
  clearInterval(clockTimer);
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  clockTimer = setInterval(tick, reduce ? 60000 : 2000);
  // Say so when today's readings started late (the first day, or after an outage).
  const firstAt = c.firstAt?.[c.days.indexOf(today)];
  const lateStart = !!firstAt && Number(F.hour.format(new Date(ms(firstAt)))) >= 5;
  const title = `To late trains and metros, and waits after cancelled trains. ${c.perMin && c.asOf ? `Losing about ${plural(Math.round(c.perMin), 'minute')} a minute at ${time(c.asOf)}. ` : ''}A rough estimate.`;
  return h('p', { class: 'stat', title },
    h('span', { class: 'stat-label' }, 'Delay clock'),
    num,
    h('span', { class: 'stat-text' }, lateStart ? `passenger-hours lost since ${time(firstAt)}` : 'passenger-hours lost today'),
    h('a', { class: 'stat-link', href: '#/service', 'aria-label': 'How the delay clock is worked out' }, 'Details'));
}

function calendarSection() {
  let range = prefs.get('range', '90d');
  let metric = prefs.get('metric', 'unplanned');
  const filters = h('div', { class: 'filters' });
  const chart = h('div', { class: 'calendar' });
  const legend = h('div');
  const caption = h('p', { class: 'section-intro' });
  const sec = h('section', { class: 'section', 'aria-labelledby': 'cal-h' },
    h('div', { class: 'section-head' }, h('h2', { id: 'cal-h' }, 'Disruption calendar')),
    caption, filters, chart, legend);

  const draw = () => {
    const [a, b] = rangeIdx(range);
    const m = METRICS[metric];
    const W = chart.clientWidth || 900;
    const plotW = W - (W < 640 ? 52 : 236) - (W < 640 ? 46 : 64) - 8;
    const unit = pickUnit(b - a + 1, plotW, W < 640 ? 3 : 4);
    const cols = buckets(a, b, unit);
    const per = unit === 'day' ? 'day' : unit;
    caption.textContent = `Each square is one ${per} on one line. Stronger colour means more of the ${per} was affected. ` +
      `Select a line to see its alerts in full.`;
    const groups = [];
    const rows = [];
    let lastMode = null;
    for (const l of D.meta.lines) {
      if (l.mode !== lastMode) { groups.push({ label: D.meta.modes[l.mode]?.label || l.mode, from: rows.length }); lastMode = l.mode; }
      const L = D.daily.lines[l.id];
      const firstDay = m.from ? m.from() : 0;
      const values = cols.map(c => {
        if (!covered(c) || c.b < firstDay) return null;
        let s = 0, n = 0;
        for (let i = Math.max(c.a, firstDay); i <= c.b; i++) {
          if (!(D.daily.coverage[i] > 0)) continue;
          const v = m.day(L, i);
          if (v != null) { s += v; n++; }
        }
        return n ? s / n : null;
      });
      rows.push({ id: l.id, color: l.color, short: l.id, name: l.name, href: `#/line/${l.id}`, values, L, total: m.totalLabel(m.total(L, a, b)) });
    }
    heatmap(chart, {
      rows, groups, columns: cols,
      ticks: ticksFor(cols, unit),
      ariaLabel: `${m.label} by line, ${RANGES.find(r => r[0] === range)[1]}. Use the arrow keys to move between days.`,
      fill: v => (v == null ? 'url(#nodata)' : v > 0 ? m.ramp[binOf(v, m.bins)] : 'var(--heat-0)'),
      cellTip: (row, i) => {
        const c = cols[i];
        const head = [{ value: `${row.short} ${row.name}` }, { label: colLabel(c, unit), muted: true }];
        if (row.values[i] == null) return [...head, { label: m.noData || (m.from && c.b < m.from() ? 'TfNSW did not publish trip alerts this early' : 'No data was collected for this period') }];
        return [...head, ...m.tip(row.L, c).map(t => ({ label: t }))];
      },
      onCell: row => { location.hash = `#/line/${row.id}`; },
    });
    addHatchPattern(chart.querySelector('svg'));
    legend.replaceChildren(legendEl(metric));
    filters.replaceChildren(
      segmented(RANGES.map(r => [r[0], r[1]]), range, v => { range = v; prefs.set('range', v); draw(); document.dispatchEvent(new CustomEvent('range', { detail: v })); }, 'Time range'),
      segmented(Object.entries(METRICS).map(([k, v]) => [k, v.label]), metric, v => { metric = v; prefs.set('metric', v); draw(); document.dispatchEvent(new CustomEvent('metric', { detail: v })); }, 'Measure'),
    );
  };
  requestAnimationFrame(draw);
  onResize(draw);
  return sec;
}

function addHatchPattern(svg) {
  if (!svg) return;
  const NS = 'http://www.w3.org/2000/svg';
  const defs = document.createElementNS(NS, 'defs');
  defs.innerHTML = '<pattern id="nodata" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(135)"><rect width="5" height="5" fill="var(--surface)"/><rect width="2" height="5" fill="var(--nodata)"/></pattern>';
  svg.prepend(defs);
}

function rankingSection() {
  const chart = h('div', { class: 'chart' });
  const causeChart = h('div', { class: 'chart' });
  const tableHolder = h('div');
  const note = h('p', { class: 'chart-note' });
  const causeNote = h('p', { class: 'chart-note' });
  let showTable = false;
  const toggle = h('button', { type: 'button', class: 'table-toggle', onclick: () => { showTable = !showTable; draw(); } });
  const sec = h('section', { class: 'section', 'aria-labelledby': 'rank-h' },
    h('div', { class: 'section-head' }, h('h2', { id: 'rank-h' }, 'Lines and causes compared')),
    h('p', { class: 'section-intro' }, 'Totals for the time range and measure selected in the calendar above.'),
    h('div', { class: 'chart-grid' },
      h('div', { class: 'chart-block' }, h('h3', {}, 'Most affected lines'), note, chart, h('p', {}, toggle), tableHolder),
      h('div', { class: 'chart-block' }, h('h3', {}, 'What caused unplanned disruptions'), causeNote, causeChart)));

  const draw = () => {
    const range = prefs.get('range', '90d');
    const metric = prefs.get('metric', 'unplanned');
    const m = METRICS[metric];
    const [a, b] = rangeIdx(range);
    const rlabel = RANGES.find(r => r[0] === range)[1].toLowerCase();
    const since = rlabel === 'all' ? `since ${F.dateUTC.format(dateFromKey(D.daily.start))}` : `in the last ${rlabel}`;
    note.textContent = `${m.label} ${since}.` +
      (metric === 'planned' ? ' Days with at least one planned closure.' : metric === 'unplanned' ? ' Hours with at least one unplanned disruption alert.'
        : metric === 'lost' ? ' Share of timetabled trips that were cancelled or never seen in the live data.' : ' Alerts about individual cancelled trips.');
    const items = D.meta.lines.filter(l => metric !== 'lost' || sum(D.daily.lines[l.id].tc || [], a, b) > 0).map(l => {
      const L = D.daily.lines[l.id];
      const v = m.total(L, a, b);
      return { id: l.id, label: l.name, short: l.id, color: l.color, href: `#/line/${l.id}`, value: metric === 'unplanned' ? v / 60 : v, valueLabel: m.totalLabel(v),
        tip: [{ value: m.totalLabel(v) }, { label: fullName(l) }] };
    }).sort((x, y) => y.value - x.value);
    hbars(chart, { items, badges: true, fillClass: metric === 'planned' ? 'mark-plan' : 'mark-heat', ariaLabel: `${m.label} by line` });
    toggle.textContent = showTable ? 'Hide the table' : 'Show all measures as a table';
    tableHolder.replaceChildren(showTable ? summaryTable(a, b) : '');

    // causes
    const counts = new Map();
    let total = 0;
    for (const [d, , ci, n] of D.daily.causes) {
      if (d < a || d > b) continue;
      const c = D.daily.causeOrder[ci];
      counts.set(c, (counts.get(c) || 0) + n);
      total += n;
    }
    causeNote.textContent = `Incidents by the cause given in the alert text, ${since}. An incident affecting three lines counts three times.`;
    const citems = D.daily.causeOrder.map(c => ({ label: D.meta.causes[c], value: counts.get(c) || 0 }))
      .sort((x, y) => (x.label === 'Not stated') - (y.label === 'Not stated') || y.value - x.value)
      .map(d => ({ ...d, valueLabel: compact(d.value), tip: [{ value: plural(d.value, 'incident') }, { label: d.label }, { label: total ? `${Math.round((100 * d.value) / total)}% of the total` : '', muted: true }] }));
    if (total) hbars(causeChart, { items: citems, ariaLabel: 'Incidents by cause' });
    else causeChart.replaceChildren(h('p', { class: 'empty-chart' }, 'No unplanned incidents were recorded in this period.'));
  };
  requestAnimationFrame(draw);
  onResize(draw);
  document.addEventListener('range', draw, { signal: viewAbort.signal });
  document.addEventListener('metric', draw, { signal: viewAbort.signal });
  return sec;
}

function summaryTable(a, b) {
  const rows = D.meta.lines.map(l => {
    const L = D.daily.lines[l.id];
    return h('tr', {},
      h('td', {}, badge(l.id), ' ', l.name),
      h('td', { class: 'num' }, hours(sum(L.inc, a, b))),
      h('td', { class: 'num' }, sum(L.n, a, b).toLocaleString('en-AU')),
      h('td', { class: 'num' }, countDays(L.pl, a, b).toLocaleString('en-AU')),
      h('td', { class: 'num' }, sum(L.can, a, b).toLocaleString('en-AU')));
  });
  return h('div', { class: 'table-wrap' }, h('table', {},
    h('thead', {}, h('tr', {}, h('th', {}, 'Line'), h('th', { class: 'num' }, 'Unplanned disruption'), h('th', { class: 'num' }, 'Incidents'),
      h('th', { class: 'num' }, 'Days with planned closures'), h('th', { class: 'num' }, 'Cancellation alerts'))),
    h('tbody', {}, rows)));
}

// ----- alert list item -----
const KIND_LABEL = { incident: 'Unplanned', planned: 'Planned', advisory: 'Advisory' };
function alertItem(e, { showLines = true } = {}) {
  const start = ms(e.st), end = ms(e.en);
  let when;
  if (e.k === 'planned' && e.w?.length) {
    const first = e.w[0];
    when = h('div', { class: 'alert-when' }, h('strong', {}, dayOf(first[0])),
      `${time(first[0])} to ${sydKey(ms(first[1])) === sydKey(ms(first[0])) ? time(first[1]) : `${time(first[1])} ${F.dayShort.format(new Date(ms(first[1])))}`}`,
      e.w.length > 1 ? h('div', {}, `and ${plural(e.w.length - 1, 'more period')}`) : null);
  } else {
    when = h('div', { class: 'alert-when' }, h('strong', {}, dayOf(e.st)),
      e.o ? `Ongoing since ${time(e.st)}` : `${time(e.st)} to ${sydKey(end) === sydKey(start) ? time(e.en) : `${time(e.en)} ${F.dayShort.format(new Date(end))}`}`,
      !e.o && e.k !== 'planned' ? h('div', {}, duration(end - start)) : null);
  }
  let text = e.x || '';
  // When the headline was taken from the first sentence, don't repeat it in the body.
  if (e.t && !e.t.endsWith('…') && text.startsWith(e.t)) text = text.slice(e.t.length).trim();
  const long = text.length > 260;
  return h('li', { class: 'alert' }, when, h('div', {},
    h('div', { class: 'alert-title' }, showLines ? e.l.map(id => badge(id)) : null, h('span', {}, e.t || 'Service alert')),
    h('div', { class: 'alert-meta' },
      h('span', { class: `tag ${e.k}` }, KIND_LABEL[e.k] || e.k),
      e.c ? h('span', {}, `Cause: ${D.meta.causes[e.c] || e.c}`) : null,
      e.k === 'planned' && e.s === 'change' ? h('span', {}, 'Timetable or service change') : null),
    text && !long ? h('p', { class: 'alert-text' }, text) : null,
    text && long ? longText(text) : null));
}

function longText(text) {
  const preview = h('p', { class: 'alert-text' }, text.slice(0, 220).replace(/\s+\S*$/, '') + '…');
  const full = h('p', { class: 'alert-text' }, text);
  const d = h('details', { ontoggle: () => { preview.hidden = d.open; } }, h('summary', {}, 'Read the full alert'), full);
  return h('div', {}, preview, d);
}

function pagedList(list, render, step = 30) {
  const ul = h('ul', { class: 'alerts' });
  const wrap = h('div', {}, ul);
  let shown = 0;
  const more = h('button', { type: 'button', class: 'more', onclick: () => add() });
  const add = () => {
    const next = list.slice(shown, shown + step);
    next.forEach(e => ul.append(render(e)));
    shown += next.length;
    more.textContent = `Show ${Math.min(step, list.length - shown)} more`;
    if (shown >= list.length) more.remove();
    else if (!more.isConnected) wrap.append(more);
  };
  add();
  return wrap;
}

// ----- line page -----
async function viewLine(main, id) {
  const requestRoute = main.dataset.routeId;
  const l = lineInfo(id);
  if (!D.meta.lines.some(x => x.id === id)) { notFound(main, `There is no line called “${id}”.`); return; }
  document.title = `${fullName(l)} | NSW Rail Disruptions`;
  const data = D.line[id] || (D.line[id] = await getJson(`data/line/${id}.json`));
  if (main.dataset.routeId !== requestRoute) return;
  const st = D.status.lines[id] || {};
  const L = D.daily.lines[id];
  let range = prefs.get('range', '90d');
  let kind = 'incident';

  const nowList = h('ul', { class: 'now-list' });
  for (const e of st.incidents || []) nowList.append(h('li', {}, stateEl('disrupted', `Since ${time(e.st)}`), h('div', { class: 'alert-text' }, e.x || e.t)));
  for (const p of st.planned || []) nowList.append(h('li', {}, stateEl('planned', p.now ? 'Planned closure now' : 'Planned today'), h('div', { class: 'alert-text' }, p.t)));
  if (!nowList.children.length) nowList.append(h('li', {}, stateEl('good', 'No alerts for this line right now')));
  const live = liveText(st.live, id);
  if (live) nowList.append(h('li', { class: 'ink-2' }, `Live trip data: ${live}, from ${plural(st.live.active, 'service')} running at ${time(st.live.at)}.`));

  const filters = h('div', { class: 'filters' });
  const kpis = h('div', { class: 'kpis' });
  const cUnplanned = h('div', { class: 'chart' }), cPlanned = h('div', { class: 'chart' });
  const cCause = h('div', { class: 'chart' }), cHour = h('div', { class: 'chart' });
  const cDelay = h('div', { class: 'chart' }), cLate = h('div', { class: 'chart' });
  const nUnplanned = h('p', { class: 'chart-note' }), nPlanned = h('p', { class: 'chart-note' }), nCause = h('p', { class: 'chart-note' });
  const listHead = h('div', { class: 'filters' });
  const listHolder = h('div');
  const countLine = h('p', { class: 'count-line' });
  const delaySection = h('div', { class: 'chart-grid' });
  const svcSection = h('div');
  lineService(svcSection, id);
  const twHolder = h('div');
  lineTrackwork(twHolder, id);

  mount(main,
    h('div', { class: 'line-head' }, badge(id, { link: false, size: 'lg' }), h('div', {}, h('h1', {}, l.name), h('div', { class: 'line-mode' }, D.meta.modes[l.mode]?.label || ''))),
    l.note ? h('p', { class: 'line-note' }, l.note) : null,
    h('section', { 'aria-labelledby': 'ln-now' }, h('h2', { id: 'ln-now', style: { marginTop: '18px', fontSize: '1.25rem' } }, 'Right now'), nowList),
    h('section', { class: 'section', 'aria-labelledby': 'ln-tw' }, h('h2', { id: 'ln-tw' }, 'Trackwork ahead'), twHolder),
    h('section', { class: 'section', 'aria-labelledby': 'ln-hist' },
      h('h2', { id: 'ln-hist' }, 'History'),
      filters, kpis,
      h('div', { class: 'chart-grid' },
        h('div', { class: 'chart-block' }, h('h3', {}, 'Unplanned disruption'), nUnplanned, cUnplanned),
        h('div', { class: 'chart-block' }, h('h3', {}, 'Planned closures'), nPlanned, cPlanned),
        h('div', { class: 'chart-block' }, h('h3', {}, 'Causes of unplanned disruption'), nCause, cCause),
        h('div', { class: 'chart-block' }, h('h3', {}, 'When incidents begin'), h('p', { class: 'chart-note' }, 'Unplanned incidents by Sydney hour of day, across all data.'), cHour))),
    h('section', { class: 'section', 'aria-labelledby': 'ln-delay' },
      h('h2', { id: 'ln-delay' }, 'Delays from live trip data'),
      delaySection),
    h('section', { class: 'section', 'aria-labelledby': 'ln-svc' },
      h('h2', { id: 'ln-svc' }, 'Timetabled trips that ran'),
      svcSection),
    h('section', { class: 'section', 'aria-labelledby': 'ln-alerts' },
      h('h2', { id: 'ln-alerts' }, 'Alerts'), listHead, countLine, listHolder));

  const draw = () => {
    const [a, b] = rangeIdx(range);
    filters.replaceChildren(segmented(RANGES.map(r => [r[0], r[1]]), range, v => { range = v; prefs.set('range', v); draw(); }, 'Time range'));
    const incMin = sum(L.inc, a, b), incN = sum(L.n, a, b), plDays = countDays(L.pl, a, b), can = sum(L.can, a, b);
    const covDays = (() => { let s = 0; for (let i = a; i <= b; i++) if (D.daily.coverage[i] > 0) s++; return s; })();
    kpis.replaceChildren(
      kpi('Unplanned disruption', hours(incMin), `Across ${plural(covDays, 'day')} with data`),
      kpi('Incidents', incN.toLocaleString('en-AU'), 'Unplanned alerts for this line'),
      kpi('Days with planned closures', plDays.toLocaleString('en-AU'), 'Trackwork and other planned closures'),
      kpi('Cancellation alerts', can.toLocaleString('en-AU'), 'Alerts about individual trips'),
    );
    const W = cUnplanned.clientWidth || 500;
    const unit = pickUnit(b - a + 1, W - 50, 6);
    const cols = buckets(a, b, unit);
    const ticks = ticksFor(cols, unit);
    nUnplanned.textContent = `Hours with an unplanned disruption alert, per ${unit}.`;
    nPlanned.textContent = `Hours covered by planned trackwork or closures, per ${unit}.`;
    columns(cUnplanned, { items: cols.map(c => { const v = sum(L.inc, c.a, c.b) / 60; return { value: v, tip: [{ value: hours(v * 60) }, { label: colLabel(c, unit) }, { label: plural(sum(L.n, c.a, c.b), 'incident'), muted: true }] }; }), ticks, yUnit: ' h', ariaLabel: 'Unplanned disruption hours over time' });
    columns(cPlanned, { items: cols.map(c => { const v = sum(L.pl, c.a, c.b) / 60; return { value: v, tip: [{ value: hours(v * 60) }, { label: colLabel(c, unit) }] }; }), ticks, yUnit: ' h', fillClass: 'mark-plan', ariaLabel: 'Planned closure hours over time' });
    // causes for this line
    const li = D.daily.lineOrder.indexOf(id);
    const counts = new Map();
    let total = 0;
    for (const [d, lx, ci, n] of D.daily.causes) {
      if (lx !== li || d < a || d > b) continue;
      counts.set(ci, (counts.get(ci) || 0) + n);
      total += n;
    }
    nCause.textContent = 'Incidents by the cause given in the alert text.';
    if (total) {
      hbars(cCause, { items: D.daily.causeOrder.map((c, ci) => ({ label: D.meta.causes[c], value: counts.get(ci) || 0 }))
        .filter(d => d.value > 0)
        .sort((x, y) => (x.label === 'Not stated') - (y.label === 'Not stated') || y.value - x.value)
        .map(d => ({ ...d, valueLabel: String(d.value), tip: [{ value: plural(d.value, 'incident') }, { label: d.label }] })), ariaLabel: 'Incidents by cause' });
    } else cCause.replaceChildren(h('p', { class: 'empty-chart' }, 'No unplanned incidents in this period.'));
    const hourLabel = i => (i === 0 ? '12 am' : i < 12 ? `${i} am` : i === 12 ? '12 pm' : `${i - 12} pm`);
    columns(cHour, { items: data.hours.map((v, i) => ({ value: v, tip: [{ value: plural(v, 'incident') }, { label: `Starting between ${hourLabel(i)} and ${hourLabel((i + 1) % 24)}` }] })),
      ticks: [0, 6, 12, 18].map(i => ({ i, label: hourLabel(i) })), ariaLabel: 'Incidents by hour of day' });

    // alerts list
    const fromMs = ms(dayKeyAt(a) + 'T00:00:00+10:00');
    const list = data.events.filter(e => e.k === kind && ms(e.en) >= fromMs);
    listHead.replaceChildren(segmented([['incident', 'Unplanned'], ['planned', 'Planned']], kind, v => { kind = v; draw(); }, 'Alert type'));
    countLine.textContent = `${plural(list.length, kind === 'incident' ? 'unplanned alert' : 'planned alert')} in the selected range, newest first.`;
    listHolder.replaceChildren(list.length ? pagedList(list, e => alertItem(e, { showLines: true })) : h('p', { class: 'empty-chart' }, 'Nothing recorded for this period.'));
    drawDelays(delaySection, id, cDelay, cLate);
  };
  requestAnimationFrame(draw);
  onResize(draw);
}

function mount(node, ...kids) {
  node.replaceChildren(...kids.flat().filter(k => k != null && k !== false));
}

function kpi(label, value, sub) {
  return h('div', { class: 'kpi' }, h('div', { class: 'kpi-label' }, label), h('div', { class: 'kpi-value' }, value), sub ? h('div', { class: 'kpi-sub' }, sub) : null);
}

function drawDelays(holder, id, cDelay, cLate) {
  const dl = D.delays.lines?.[id];
  const thr = lineInfo(id).mode === 'intercity' ? 6 : 5;
  const recent = D.delays.recent?.[id] || [];
  if (!dl && !recent.length) {
    holder.replaceChildren(h('p', { class: 'section-intro' },
      D.delays.start ? 'No live trip data has been matched to this line yet.' :
        'Delay tracking starts once the collector has run for a while. Each run samples where every train or tram is against its timetable, and the daily averages will appear here.'));
    return;
  }
  const useRecent = !dl || dl.mean.filter(v => v != null).length < 3;
  let points, ticks, note;
  if (useRecent) {
    points = recent.map(([t, mean, pct]) => ({ t, y: mean / 60, pct }));
    ticks = points.map((p, i) => ({ i, label: F.dayShort.format(new Date(ms(p.t))) })).filter((t, i, arr) => i === 0 || t.label !== arr[i - 1].label);
    note = 'Hourly, last 7 days.';
  } else {
    points = dl.mean.map((v, i) => ({ t: addDays(D.delays.start, i), y: v == null ? null : v / 60, pct: dl.pct[i], day: true }));
    const months = new Set();
    ticks = points.map((p, i) => ({ i, label: F.dateUTCShort.format(dateFromKey(p.t)) })).filter((t, i) => i % Math.max(1, Math.ceil(points.length / 6)) === 0);
    note = `Daily, since ${F.dateUTC.format(dateFromKey(D.delays.start))}.`;
    void months;
  }
  if (points.filter(p => p.y != null).length < 6) {
    holder.replaceChildren(h('p', { class: 'section-intro' },
      `Delay tracking for this line started on ${F.dateUTC.format(dateFromKey(D.delays.start || sydKey(Date.now())))}. The charts appear once a few hours of samples have been collected.`));
    return;
  }
  const tipFor = p => [{ value: p.y == null ? 'No data' : `${p.y.toFixed(1)} min average delay` },
    { label: p.day ? F.dateUTC.format(dateFromKey(p.t)) : `${F.day.format(new Date(ms(p.t)))} ${time(p.t)}` },
    { label: p.pct == null ? '' : `${p.pct}% of services ${thr}+ min late`, muted: true }];
  holder.replaceChildren(
    h('div', { class: 'chart-block' }, h('h3', {}, 'Average delay'), h('p', { class: 'chart-note' }, `${note} Minutes behind timetable, averaged over services running at each sample.`), cDelay),
    h('div', { class: 'chart-block' }, h('h3', {}, `Services ${thr} or more minutes late`), h('p', { class: 'chart-note' }, `${note} Share of running services, the measure TfNSW uses for punctuality.`), cLate));
  requestAnimationFrame(() => {
    lineChart(cDelay, { points, ticks, yFormat: v => `${Math.round(v * 10) / 10} min`, tipFor, ariaLabel: 'Average delay over time' });
    lineChart(cLate, { points: points.map(p => ({ ...p, y: p.pct })), ticks, yFormat: v => `${Math.round(v)}%`, tipFor, ariaLabel: 'Share of late services over time' });
  });
}

// ----- alert log -----
async function viewLog(main) {
  const requestRoute = main.dataset.routeId;
  let newestSearch = 0;
  document.title = 'Alert log | NSW Rail Disruptions';
  const years = [...D.meta.logYears].reverse();
  const q = new URLSearchParams(location.hash.split('?')[1] || '');
  const f = { line: q.get('line') || '', kind: q.get('kind') || 'incident', cause: q.get('cause') || '', year: q.get('year') || years[0] || '', text: q.get('q') || '' };
  const listHolder = h('div');
  const countLine = h('p', { class: 'count-line', role: 'status' });
  const sel = (label, key, options) => h('label', { class: 'field' }, label,
    h('select', { onchange: ev => { f[key] = ev.target.value; update(); } }, options.map(([v, t]) => { const o = h('option', { value: v }, t); if (v === f[key]) o.selected = true; return o; })));
  const search = h('input', { type: 'search', placeholder: 'Station, cause or any word', value: f.text, oninput: ev => { f.text = ev.target.value; clearTimeout(search._t); search._t = setTimeout(update, 200); } });
  // Render expensive SVG charts only when requested, in a *visible*
  // container. Rendering while a native <details> is closed would give
  // inaccurate chart widths on iPhone Safari.
  const trendContent=h('div', { class:'history-trends-content' });
  const trends=h('details', { class:'history-trends' },
    h('summary', {}, 'Disruption calendar and comparisons'),
    h('p', { class:'history-trends-intro' },
      'Explore disruption intensity over time, most affected lines and recorded causes. '+
      'These charts show historical observations, not current service conditions.'),
    trendContent);
  let trendChartsMounted=false;
  trends.addEventListener('toggle', () => {
    if (!trends.open || trendChartsMounted || !trends.isConnected) return;
    trendChartsMounted=true;
    // Both pre-existing components retain their time-range and measure
    // coordination, table view, keyboard navigation and responsive redraw.
    trendContent.replaceChildren(calendarSection(),rankingSection());
  });
  main.replaceChildren(
    h('div', { class: 'line-head' }, h('h1', {}, 'Alert history')),
    h('p', { class: 'section-intro' }, 'Every train, metro and light rail alert recorded since July 2023, as published by Transport for NSW. Times are when the alert was first and last seen in the feed.'),
    trends,
    h('h2', { class:'history-log-heading' }, 'Search recorded alerts'),
    h('div', { class: 'filters' },
      sel('Line', 'line', [['', 'All lines'], ...D.meta.lines.map(l => [l.id, fullName(l)])]),
      sel('Type', 'kind', [['incident', 'Unplanned'], ['planned', 'Planned'], ['advisory', 'Advisory'], ['', 'All types']]),
      sel('Cause', 'cause', [['', 'Any cause'], ...Object.entries(D.meta.causes)]),
      sel('Year', 'year', years.map(y => [y, y])),
      h('label', { class: 'field' }, 'Search', search)),
    countLine, listHolder);

  async function update() {
    if (main.dataset.routeId !== requestRoute || !listHolder.isConnected) return;
    const searchId = ++newestSearch;
    const year = f.year;
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ line: f.line, kind: f.kind, cause: f.cause, year: f.year, q: f.text })) if (v) p.set(k, v);
    history.replaceState(null, '', `#/log?${p}`);
    if (!f.year) { countLine.textContent = 'No alerts have been recorded yet.'; return; }
    listHolder.style.opacity = '0.5';
    let list;
    try {
      list = D.log[year] || await getJson(`data/log/${year}.json`);
      D.log[year] = list;
    } catch {
      if (searchId !== newestSearch || main.dataset.routeId !== requestRoute ||
          !listHolder.isConnected) return;
      countLine.textContent = 'Recorded alerts for ' + year + ' could not be loaded.';
      listHolder.replaceChildren(h('div', { class:'history-load-error', role:'alert' },
        h('p', {}, 'The archived alerts for this year are unavailable. Check your connection and try again.'),
        h('button', { type:'button', class:'history-retry',
          onclick:() => update() }, 'Retry loading history')));
      listHolder.style.opacity = '';
      return;
    }
    if (searchId !== newestSearch || main.dataset.routeId !== requestRoute ||
        !listHolder.isConnected) return;
    const needle = f.text.trim().toLowerCase();
    const rows = list.filter(e => (!f.line || e.l.includes(f.line)) && (!f.kind || e.k === f.kind) && (!f.cause || e.c === f.cause) &&
      (!needle || `${e.t} ${e.x}`.toLowerCase().includes(needle)));
    countLine.textContent = `${plural(rows.length, 'alert')} in ${year}, newest first.`;
    listHolder.replaceChildren(rows.length ? pagedList(rows, e => alertItem(e), 40) : h('p', { class: 'empty-chart' }, 'No alerts match these filters. Try another year or clear the search.'));
    listHolder.style.opacity = '';
  }
  update();
}

// ----- about -----
function viewAbout(main) {
  document.title = 'About the data | NSW Rail Disruptions';
  const m = D.meta;
  const cov = h('div', { class: 'chart' });
  const feeds = Object.entries(m.feeds || {});
  main.replaceChildren(h('div', { class: 'prose' },
    h('div', { class: 'line-head' }, h('h1', {}, 'About the data')),
    h('p', {}, 'This site keeps a running record of disruptions on Sydney Trains, Intercity, Sydney Metro and light rail lines, so they can be compared over time. It is an independent open-source project and is not run by Transport for NSW.'),
    h('h2', {}, 'Where the data comes from'),
    h('ul', {},
      h('li', {}, h('strong', {}, 'Service alerts. '), 'Every few minutes a scheduled job on GitHub reads the Transport for NSW Trip Planner alerts feed, the same alerts shown on transportnsw.info. Each alert is followed from the moment it appears until it disappears.'),
      h('li', {}, h('strong', {}, 'Earlier alerts. '), `Alerts from July 2023 until this site started come from a community archive that saved the same feed every 20 to 30 minutes (github.com/jxeeno/nsw-service-alerts-historical).${m.archive ? ` ${m.archive.snapshots.toLocaleString('en-AU')} archived snapshots were replayed.` : ''}`),
      h('li', {}, h('strong', {}, 'Delays. '), 'The job also reads the GTFS-realtime trip updates for Sydney Trains, Metro and the four light rail networks, works out how far behind the timetable each running service is, and stores an average per line. This only exists from the day collection started.'),
      h('li', {}, h('strong', {}, 'Timetabled trips. '), 'Each day’s timetable is taken from the TfNSW static timetables and every trip in it is followed through the live data, to see which ran, ran late, were cancelled or never appeared. See ', h('a', { href: '#/service' }, 'Service delivered'), '. Recording started in October 2026.')),
    h('h2', {}, 'How alerts are sorted'),
    h('ul', {},
      h('li', {}, h('strong', {}, 'Unplanned: '), 'alerts about something going wrong, such as signal or track repairs, emergencies, weather, train faults or industrial action. The cause is read from the alert wording, so it is only as good as that wording.'),
      h('li', {}, h('strong', {}, 'Planned: '), 'trackwork, planned closures and timetable changes. Only closures with set dates are counted as planned closure time.'),
      h('li', {}, h('strong', {}, 'Advisory: '), 'general notices such as special events, wet weather or exam reminders. They are kept in the log but not counted as disruption.'),
      h('li', {}, 'Alerts about individual trips (cancelled, running late, not stopping) are counted per line and day, but not listed one by one.')),
    h('h2', {}, 'Limits worth knowing'),
    h('ul', {},
      h('li', {}, 'Hours of disruption are measured from when an alert appears until it is removed. Operators sometimes leave an alert up after services recover, so a single alert counts for at most ', String(m.config?.maxIncidentHours ?? 24), ' hours.'),
      h('li', {}, 'An incident that affects several lines is counted on each of them.'),
      h('li', {}, 'Short problems that never got an alert are not here. Delays from live trip data catch some of those.'),
      h('li', {}, 'Days with no collected data are hatched in the calendar. The archive has no data between February 2022 and June 2023, which is why history starts in July 2023.'),
      h('li', {}, 'Line names changed over time. When the Bankstown Line was converted to metro in September 2024, T3 became the Liverpool & Inner West Line and T6 became the Lidcombe & Bankstown Line. Older alerts stay under the code they were published with.')),
    h('h2', {}, 'Days with collected data'),
    h('p', { class: 'muted' }, 'Feed snapshots per day. Gaps mean nothing was recorded that day.'),
    cov,
    feeds.length ? h('h2', {}, 'Live trip data feeds') : null,
    feeds.length ? h('div', { class: 'table-wrap' }, h('table', {},
      h('thead', {}, h('tr', {}, h('th', {}, 'Feed'), h('th', {}, 'Last read'), h('th', { class: 'num' }, 'Trips'), h('th', { class: 'num' }, 'Matched to a line'), h('th', {}, 'Last error'))),
      h('tbody', {}, feeds.map(([k, v]) => h('tr', {}, h('td', {}, v.label || k), h('td', {}, v.lastAt ? ago(v.lastAt) : 'never'),
        h('td', { class: 'num' }, v.trips ?? ''), h('td', { class: 'num' }, v.trips ? `${Math.round((100 * v.matched) / v.trips)}%` : ''),
        h('td', {}, v.error ? `${v.error} (${ago(v.errorAt)})` : 'None')))))) : null,
    h('h2', {}, 'Licence'),
    h('p', {}, 'The code is MIT licensed. The data is from Transport for NSW Open Data and is reused under Creative Commons Attribution 4.0. All collected data is published in the data branch of the GitHub repository.'),
    h('p', { class: 'muted' }, `Site data built ${dayOf(m.generatedAt)} at ${time(m.generatedAt)}.`)));
  const draw = () => {
    const N = D.daily.days;
    const W = cov.clientWidth || 600;
    const unit = pickUnit(N, W - 50, 3);
    const cols = buckets(0, N - 1, unit);
    columns(cov, { items: cols.map(c => { const v = sum(D.daily.coverage, c.a, c.b); return { value: v, tip: [{ value: plural(v, 'snapshot') }, { label: colLabel(c, unit) }] }; }),
      ticks: ticksFor(cols, unit), fillClass: 'mark-plan', ariaLabel: 'Feed snapshots per day', height: 150 });
  };
  requestAnimationFrame(draw);
  onResize(draw);
}

// ---------- service delivered ----------
// Timetabled trips against what the live trip data showed: ran, ran late, cancelled, never appeared.
async function loadService() {
  if (!D.service) D.service = await getJson(`data/service.json?t=${Date.now()}`);
  return D.service;
}
async function loadServiceDay(date) {
  if (!D.serviceDay[date]) D.serviceDay[date] = await getJson(`data/service/${date}.json?t=${Date.now()}`);
  return D.serviceDay[date];
}
const svcK = () => Object.fromEntries(D.service.cols.map((c, i) => [c, i]));
const trackedLine = id => D.meta.lines.some(l => l.id === id);

// "7:42 am" for seconds after the start of a service day (after midnight shows as the next morning).
function svcTime(sec) {
  const m = Math.floor(sec / 60) % (24 * 60);
  const hh = Math.floor(m / 60), mm = m % 60;
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  return `${h12}:${String(mm).padStart(2, '0')} ${hh < 12 ? 'am' : 'pm'}`;
}

// Counters summed over the selected days, per line and for the whole network.
function serviceTotals(dayIdx) {
  const K = svcK();
  const lines = {};
  const all = new Array(D.service.cols.length).fill(0);
  for (const [id, perDay] of Object.entries(D.service.lines)) {
    if (!trackedLine(id)) continue;
    const acc = new Array(D.service.cols.length).fill(0);
    for (const j of dayIdx) {
      const c = perDay[j];
      if (c) c.forEach((v, k) => { acc[k] += v; });
    }
    lines[id] = acc;
    acc.forEach((v, k) => { all[k] += v; });
  }
  return { K, lines, all };
}

const SVC_PERIODS = [['today', 'Today'], ['yesterday', 'Yesterday'], ['7d', 'Last 7 days'], ['30d', 'Last 30 days']];

async function viewService(main) {
  const requestRoute = main.dataset.routeId;
  document.title = 'Reliability | NSW Rail Disruptions';
  main.replaceChildren(h('p', { class:'loading', role:'status' }, 'Loading service reliability…'));
  await loadService();
  if (main.dataset.routeId !== requestRoute) return;
  const ride = D.clock?.assumptions?.rideMinutes ?? 30;
  const levelNames = ['empty', 'many seats free', 'few seats free', 'standing room only', 'crowded', 'full'];
  const loads = (D.clock?.assumptions?.carLoad?.train || []).map((n, i) => `${n} people when ${levelNames[i]}`).join(', ') || 'see the source code';
  const q = new URLSearchParams(location.hash.split('?')[1] || '');
  const days = D.service.days;
  const today = sydKey(Date.now());
  let period = q.get('day') && days.some(d => d.date === q.get('day')) ? q.get('day') : (q.get('period') || prefs.get('svcPeriod', 'today'));
  let lineFilter = q.get('line') || '';
  let showAll = false;

  const intro = h('p', { class: 'section-intro' },
    'How many of the trips in the timetable actually ran, worked out from the live trip data that TfNSW publishes for every train, metro and tram. ',
    'Trips the feed marks as cancelled, and trips that never appear in it at all, count as lost; the rest count as run.');
  const filters = h('div', { class: 'filters' });
  const headline = h('div', { class: 'svc-headline', role: 'status' });
  const kpis = h('div', { class: 'kpis' });
  const cLines = h('div', { class: 'chart' }), cLate = h('div', { class: 'chart' }), cHour = h('div', { class: 'chart' }), cDays = h('div', { class: 'chart' });
  const nLines = h('p', { class: 'chart-note' }), nHour = h('p', { class: 'chart-note' });
  const daysBlock = h('div', { class: 'chart-block' }, h('h3', {}, 'Trips lost each day'), h('p', { class: 'chart-note' }, 'Share of judged trips that were cancelled or never seen, all lines.'), cDays);
  const tableHolder = h('div');
  let showTable = false;
  const toggle = h('button', { type: 'button', class: 'table-toggle', onclick: () => { showTable = !showTable; draw(); } });
  const listHead = h('div', { class: 'filters' });
  const listHolder = h('div');
  const listSection = h('section', { class: 'section', 'aria-labelledby': 'svc-list-h' }, h('h2', { id: 'svc-list-h' }, 'Trips that did not run'), listHead, listHolder);
  const clockHead = h('div', { class: 'svc-headline' });
  const cClockLines = h('div', { class: 'chart' }), cClockTime = h('div', { class: 'chart' });
  const nClockTime = h('p', { class: 'chart-note' }), hClockTime = h('h3', {});
  const clockSection = h('section', { class: 'section', id: 'clock', 'aria-labelledby': 'svc-clock-h' },
    h('h2', { id: 'svc-clock-h' }, 'Delay clock'),
    h('p', { class: 'section-intro' }, 'A rough count of the time passengers lose: minutes late arriving, for everyone on a late train or metro, plus the wait for the next train for everyone whose train was cancelled or never turned up. Sydney Trains, Intercity and Metro only.'),
    clockHead,
    h('div', { class: 'chart-grid' },
      h('div', { class: 'chart-block' }, h('h3', {}, 'Passenger-hours lost, by line'), h('p', { class: 'chart-note' }, 'For the period selected above.'), cClockLines,
        h('div', { class: 'key' }, h('span', {}, h('i', { class: 'key-late' }), 'Arriving late'), h('span', {}, h('i', { class: 'key-wait' }), 'Waiting after a lost trip'))),
      h('div', { class: 'chart-block' }, hClockTime, nClockTime, cClockTime)));

  mount(main,
    h('div', { class: 'line-head' }, h('h1', {}, 'Service reliability')),
    intro, filters, headline, kpis,
    h('div', { class: 'chart-grid' },
      h('div', { class: 'chart-block' }, h('h3', {}, 'Trips lost, by line'), nLines, cLines, h('div', { class: 'key' },
        h('span', {}, h('i', { class: 'key-cancel' }), 'Cancelled'), h('span', {}, h('i', { class: 'key-missing' }), 'Never seen in the live data'))),
      h('div', { class: 'chart-block' }, h('h3', {}, 'Late at the end of the line'), h('p', { class: 'chart-note' }, 'Share of trips that ran and reached their last stop 5 or more minutes late (6 for Intercity).'), cLate),
      h('div', { class: 'chart-block' }, h('h3', {}, 'When trips were lost'), nHour, cHour),
      daysBlock),
    h('p', {}, toggle), tableHolder,
    clockSection,
    listSection,
    h('details', { class: 'method' }, h('summary', {}, 'How this is worked out'),
      h('ul', {},
        h('li', {}, 'Each morning the day’s timetable is taken from the TfNSW static timetables and frozen, so later changes do not rewrite it. Trips marked “Empty Train” are left out.'),
        h('li', {}, 'About every five minutes the live trip data is read. A trip is ', h('strong', {}, 'cancelled'), ' if the feed marks it cancelled and it is never seen running, and ', h('strong', {}, 'never seen'), ' if it does not appear in the feed at all. Every other judged trip counts as run: almost all of them are seen moving against their timetable, and the rest were listed in the feed as running but happened to fall between readings.'),
        h('li', {}, 'Only trips that were due while the live data was being collected are judged. Some train types hardly ever appear in the live data (the Hunter Line’s diesel railcars, for example), so their trips are not judged either.'),
        h('li', {}, 'Late means arriving at the last stop 5 or more minutes behind the timetable (6 for Intercity), using the last delay the feed gave for that stop.'),
        h('li', {}, `People on lost trips is a rough estimate for Sydney Trains and Intercity, where TfNSW forecasts how full each trip will be: carriages × an assumed load for the forecast level × the trip’s length in average ${ride}-minute journeys. Treat it as an order of magnitude.`),
        h('li', {}, `The delay clock uses the occupancy TfNSW publishes for each carriage (predicted for Sydney Trains and Intercity, measured on board for Metro), turned into people with assumed loads. For a Sydney Trains carriage: ${loads}. At each reading, a train carrying L people D minutes late is taken to drop off L ÷ ${ride} people a minute, each D minutes late. Services with no occupancy figure are assumed to be like those with one. People on a lost trip wait until the next timetabled train on the line in the same direction, up to an hour. The loads are assumptions and have not yet been checked against Opal trip counts.`),
        h('li', {}, 'This is not TfNSW’s official on-time running measure, which uses peak-hour arrivals at key stations.'))));

  const dayIndexes = () => {
    if (period === 'today') return days.map((d, j) => (d.date === today ? j : -1)).filter(j => j >= 0);
    if (period === 'yesterday') return days.map((d, j) => (d.date === addDays(today, -1) ? j : -1)).filter(j => j >= 0);
    if (period === '7d' || period === '30d') {
      const n = period === '7d' ? 7 : 30;
      return days.map((d, j) => ((dateFromKey(today) - dateFromKey(d.date)) / 864e5 < n ? j : -1)).filter(j => j >= 0);
    }
    return days.map((d, j) => (d.date === period ? j : -1)).filter(j => j >= 0);
  };
  const singleDate = () => (period === 'today' ? today : period === 'yesterday' ? addDays(today, -1) : /^\d{4}-/.test(period) ? period : null);
  const setPeriod = v => {
    period = v;
    if (!/^\d{4}-/.test(v)) prefs.set('svcPeriod', v);
    const p = new URLSearchParams();
    if (/^\d{4}-/.test(v)) p.set('day', v); else if (v !== 'today') p.set('period', v);
    if (lineFilter) p.set('line', lineFilter);
    history.replaceState(null, '', `#/service${p.toString() ? `?${p}` : ''}`);
    draw();
  };

  let drawing = 0;
  const draw = async () => {
    const my = ++drawing;
    const idxs = dayIndexes();
    const date = singleDate();
    const pickable = days.filter(d => d.final || d.date === today).map(d => d.date).reverse();
    filters.replaceChildren(
      segmented(SVC_PERIODS, period, setPeriod, 'Period'),
      h('label', { class: 'field inline' }, 'Day ',
        h('select', { onchange: ev => setPeriod(ev.target.value || 'today') },
          h('option', { value: '' }, 'Pick a day'),
          pickable.map(d => { const o = h('option', { value: d }, F.dateUTC.format(dateFromKey(d))); if (d === period) o.selected = true; return o; }))));
    const { K, lines, all } = serviceTotals(idxs);
    const dayRec = idxs.length === 1 ? days[idxs[0]] : null;
    const counted = all[K.counted];
    const lost = all[K.cancelled] + all[K.missing];
    const when = period === 'today' ? 'Today so far' : period === 'yesterday' ? 'Yesterday'
      : period === '7d' ? 'Over the last 7 days' : period === '30d' ? 'Over the last 30 days' : `On ${F.dateUTC.format(dateFromKey(period))}`;
    if (!counted) {
      headline.replaceChildren(h('h2', {}, `${when}: not enough live trip data yet.`),
        h('p', {}, days.length ? `Recording started on ${F.dateUTC.format(dateFromKey(days[0].date))}. Trips are judged once they are due to have finished.` : 'Recording has not started yet.'));
    } else {
      const asOf = dayRec && !dayRec.final && dayRec.asOf ? ` Counting trips due to finish by ${time(new Date(ms(dayRec.asOf) - 10 * 60000).toISOString())}.` : '';
      const n = v => v.toLocaleString('en-AU');
      const can = all[K.cancelled], mis = all[K.missing];
      const canText = can === 1 ? 'one was cancelled' : `${n(can)} were cancelled`;
      const misText = `${mis === 1 ? 'one' : n(mis)} never appeared in the live data`;
      const lostText = can && mis ? `${canText} and ${misText}` : can ? canText : mis ? misText : 'none were cancelled or missing';
      const unclear = all[K.unclear] ? ` (${n(all[K.unclear])} of them listed in the live data but not seen moving)` : '';
      headline.replaceChildren(
        h('h2', {}, `${when}, ${pctLabel((100 * (counted - lost)) / counted)} of timetabled trips ran.`),
        h('p', {}, `${n(counted - lost)} of ${plural(counted, 'judged trip')} ran${unclear}; ${lostText}.${asOf}`));
    }
    kpis.replaceChildren(
      kpi('Trips that ran', counted ? pctLabel((100 * (counted - lost)) / counted) : '–', counted ? `${(counted - lost).toLocaleString('en-AU')} of ${counted.toLocaleString('en-AU')} judged` : 'No trips judged yet'),
      kpi('Cancelled', all[K.cancelled].toLocaleString('en-AU'), 'Marked cancelled in the live data'),
      kpi('Never seen', all[K.missing].toLocaleString('en-AU'), 'Timetabled, but not in the live data'),
      kpi('Late at the end of the line', all[K.ran] ? pctLabel((100 * all[K.late]) / all[K.ran]) : '–', `${plural(all[K.late], 'trip')} 5+ minutes late`),
      kpi('People on lost trips', all[K.paxLost] ? `~${compact(all[K.paxLost])}` : '0', 'Rough estimate, Sydney Trains and Intercity only'));

    // By line
    const order = id => D.meta.lines.findIndex(l => l.id === id);
    const judged = Object.entries(lines).filter(([, c]) => c[K.counted] > 0);
    const notJudged = Object.entries(lines).filter(([, c]) => c[K.counted] === 0 && c[K.due] > 0).map(([id]) => id).sort((a, b) => order(a) - order(b));
    nLines.replaceChildren(`Share of judged trips that were cancelled or never seen.`,
      notJudged.length ? ` Not judged: ${notJudged.join(', ')} (not enough live data for ${notJudged.length === 1 ? 'this line' : 'these lines'}).` : '');
    const items = judged.map(([id, c]) => {
      const l = lineInfo(id);
      const pc = (100 * c[K.cancelled]) / c[K.counted], pm = (100 * c[K.missing]) / c[K.counted];
      return { id, label: l.name, short: id, color: l.color, href: `#/line/${id}`, value: pc + pm, valueLabel: pctLabel(pc + pm),
        segments: [{ value: pc, fillClass: 'mark-cancel' }, { value: pm, fillClass: 'mark-missing' }],
        tip: [{ value: `${pctLabel(pc + pm)} of trips lost` }, { label: fullName(l) }, { label: `${c[K.cancelled]} cancelled, ${c[K.missing]} never seen, of ${c[K.counted].toLocaleString('en-AU')}`, muted: true }] };
    }).sort((x, y) => y.value - x.value || order(x.id) - order(y.id));
    const lateItems = judged.filter(([, c]) => c[K.ran] > 0).map(([id, c]) => {
      const l = lineInfo(id);
      const v = (100 * c[K.late]) / c[K.ran];
      return { id, label: l.name, short: id, color: l.color, href: `#/line/${id}`, value: v, valueLabel: pctLabel(v),
        tip: [{ value: `${pctLabel(v)} late` }, { label: fullName(l) }, { label: `${c[K.late]} of ${plural(c[K.ran], 'trip')} that ran`, muted: true }] };
    }).sort((x, y) => y.value - x.value || order(x.id) - order(y.id));
    if (items.length) hbars(cLines, { items, badges: true, ariaLabel: 'Share of trips lost by line' });
    else cLines.replaceChildren(h('p', { class: 'empty-chart' }, 'No trips judged in this period yet.'));
    if (lateItems.length) hbars(cLate, { items: lateItems, badges: true, ariaLabel: 'Share of trips late at the end of the line' });
    else cLate.replaceChildren(h('p', { class: 'empty-chart' }, 'No trips judged in this period yet.'));

    // By hour (from the day file for one day, or the 7 and 30 day totals)
    let hours = null;
    if (date) {
      try { hours = (await loadServiceDay(date)).hours; } catch { hours = null; }
      if (my !== drawing) return;
    } else hours = D.service.hours?.[period] || null;
    const hourTotals = Array.from({ length: 24 }, () => [0, 0]);
    for (const [id, hrs] of Object.entries(hours || {})) if (trackedLine(id)) hrs.forEach(([c, l], i) => { hourTotals[i][0] += c; hourTotals[i][1] += l; });
    const hourLabel = i => (i === 0 ? '12 am' : i < 12 ? `${i} am` : i === 12 ? '12 pm' : `${i - 12} pm`);
    nHour.textContent = 'Trips cancelled or never seen, by the hour they were due to start (all lines).';
    if (hourTotals.some(([, l]) => l > 0)) {
      columns(cHour, { items: hourTotals.map(([c, l], i) => ({ value: l, tip: [{ value: plural(l, 'trip') + ' lost' }, { label: `Due to start ${hourLabel(i)} to ${hourLabel((i + 1) % 24)}` }, { label: `${c.toLocaleString('en-AU')} judged`, muted: true }] })),
        ticks: [0, 6, 12, 18].map(i => ({ i, label: hourLabel(i) })), ariaLabel: 'Trips lost by hour of day' });
    } else cHour.replaceChildren(h('p', { class: 'empty-chart' }, hourTotals.some(([c]) => c > 0) ? 'No judged trip was lost in this period.' : 'No trips judged in this period yet.'));

    // Day by day (periods only)
    const dayCols = idxs.length > 1 ? idxs.map(j => {
      let c = 0, l = 0;
      for (const [id, perDay] of Object.entries(D.service.lines)) {
        if (!trackedLine(id) || !perDay[j]) continue;
        c += perDay[j][K.counted]; l += perDay[j][K.cancelled] + perDay[j][K.missing];
      }
      return { date: days[j].date, c, l };
    }) : [];
    daysBlock.hidden = dayCols.length < 2;
    if (dayCols.length >= 2) {
      columns(cDays, { items: dayCols.map(d => ({ value: d.c ? (100 * d.l) / d.c : 0, tip: [{ value: d.c ? `${pctLabel((100 * d.l) / d.c)} lost` : 'No trips judged' }, { label: F.dateUTC.format(dateFromKey(d.date)) }, { label: `${d.l} of ${d.c.toLocaleString('en-AU')} trips`, muted: true }] })),
        ticks: dayCols.map((d, i) => ({ i, label: F.dateUTCShort.format(dateFromKey(d.date)) })).filter((t, i) => i % Math.max(1, Math.ceil(dayCols.length / 6)) === 0), yUnit: '%', ariaLabel: 'Share of trips lost per day' });
    }

    drawClock(idxs, date);

    // Table
    toggle.textContent = showTable ? 'Hide the table' : 'Show all lines as a table';
    tableHolder.replaceChildren(showTable ? serviceTable(lines, K) : '');

    // Trips that did not run (one day at a time)
    if (!date) {
      listSection.hidden = false;
      listHead.replaceChildren();
      listHolder.replaceChildren(h('p', { class: 'section-intro' }, 'Choose Today, Yesterday or a single day to list the trips.'));
      return;
    }
    let detail = null;
    try { detail = await loadServiceDay(date); } catch { detail = null; }
    if (my !== drawing || main.dataset.routeId !== requestRoute) return;
    const lineIds = Object.keys(detail?.trips || {}).filter(trackedLine).sort((a, b) => order(a) - order(b));
    listHead.replaceChildren(
      h('label', { class: 'field inline' }, 'Line ',
        h('select', { onchange: ev => { lineFilter = ev.target.value; setPeriod(period); } },
          h('option', { value: '' }, 'All lines'),
          lineIds.map(id => { const o = h('option', { value: id }, `${id} ${lineInfo(id).name}`); if (id === lineFilter) o.selected = true; return o; }))),
      h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: showAll || null, onchange: ev => { showAll = ev.target.checked; draw(); } }), 'Also show late trips and trips that skipped stops'));
    listHolder.replaceChildren(tripList(detail, lineIds.filter(id => !lineFilter || id === lineFilter), showAll));
  };
  // Delay clock for the same period.
  const drawClock = (idxs, date) => {
    const c = D.clock;
    clockSection.hidden = !c || !c.days.length;
    if (clockSection.hidden) return;
    const dates = idxs.map(j => days[j].date);
    const perDate = dates.map(d => [d, clockDay(d)]).filter(([, x]) => x.found);
    const tot = { late: 0, wait: 0 }, byLine = {};
    for (const [, x] of perDate) {
      tot.late += x.late; tot.wait += x.wait;
      for (const [id, [l, w]] of Object.entries(x.byLine)) { const b = (byLine[id] ||= [0, 0]); b[0] += l; b[1] += w; }
    }
    const when = period === 'today' ? 'Today so far' : period === 'yesterday' ? 'Yesterday' : period === '7d' ? 'Over the last 7 days' : period === '30d' ? 'Over the last 30 days' : `On ${F.dateUTC.format(dateFromKey(period))}`;
    if (!(tot.late + tot.wait > 0)) {
      clockHead.replaceChildren(h('p', {}, 'No delay clock figures for this period yet.'));
      cClockLines.replaceChildren(); cClockTime.replaceChildren(); hClockTime.textContent = ''; nClockTime.textContent = '';
      return;
    }
    clockHead.replaceChildren(h('h2', {}, `${when}, about ${hoursLabel(tot.late + tot.wait)} passenger-hours were lost.`),
      h('p', {}, `${hoursLabel(tot.late)} hours arriving late and ${hoursLabel(tot.wait)} hours waiting after cancelled or missing trains.`));
    const order = id => D.meta.lines.findIndex(l => l.id === id);
    const items = Object.entries(byLine).filter(([, [l, w]]) => l + w >= 30).map(([id, [l, w]]) => {
      const li = lineInfo(id);
      return { id, label: li.name, short: id, color: li.color, href: `#/line/${id}`, value: (l + w) / 60, valueLabel: `${hoursLabel(l + w)} h`,
        segments: [{ value: l / 60, fillClass: 'mark-late' }, { value: w / 60, fillClass: 'mark-wait' }],
        tip: [{ value: `${hoursLabel(l + w)} passenger-hours` }, { label: fullName(li) }, { label: `${hoursLabel(l)} h late, ${hoursLabel(w)} h waiting`, muted: true }] };
    }).sort((x, y) => y.value - x.value || order(x.id) - order(y.id));
    if (items.length) hbars(cClockLines, { items, badges: true, ariaLabel: 'Passenger-hours lost by line' });
    else cClockLines.replaceChildren(h('p', { class: 'empty-chart' }, 'Less than an hour lost on every line.'));
    const hourLabel = i => (i === 0 ? '12 am' : i < 12 ? `${i} am` : i === 12 ? '12 pm' : `${i - 12} pm`);
    if (date) {
      hClockTime.textContent = 'Lateness through the day';
      nClockTime.textContent = 'Passenger-hours lost arriving late, by hour (waiting after lost trips is not included here).';
      const hrs = c.hours?.[date];
      if (hrs?.some(v => v > 0)) {
        columns(cClockTime, { items: hrs.map((v, i) => ({ value: v / 60, tip: [{ value: `${hoursLabel(v)} passenger-hours` }, { label: `${hourLabel(i)} to ${hourLabel((i + 1) % 24)}` }] })),
          ticks: [0, 6, 12, 18].map(i => ({ i, label: hourLabel(i) })), yUnit: ' h', ariaLabel: 'Passenger-hours lost by hour' });
      } else cClockTime.replaceChildren(h('p', { class: 'empty-chart' }, 'No hourly figures for this day.'));
    } else {
      hClockTime.textContent = 'Each day';
      nClockTime.textContent = 'Passenger-hours lost per day, all lines.';
      if (perDate.length >= 2) {
        columns(cClockTime, { items: perDate.map(([d, x]) => ({ value: (x.late + x.wait) / 60, tip: [{ value: `${hoursLabel(x.late + x.wait)} passenger-hours` }, { label: F.dateUTC.format(dateFromKey(d)) }] })),
          ticks: perDate.map(([d], i) => ({ i, label: F.dateUTCShort.format(dateFromKey(d)) })).filter((t, i) => i % Math.max(1, Math.ceil(perDate.length / 6)) === 0), yUnit: ' h', ariaLabel: 'Passenger-hours lost per day' });
      } else cClockTime.replaceChildren(h('p', { class: 'empty-chart' }, 'Not enough days recorded yet.'));
    }
  };
  pageRefresh = async () => { D.service = null; D.serviceDay = {}; await loadService(); draw(); };
  draw();
  onResize(draw);
}

// Line page: the last 30 days of timetabled trips against what ran.
async function lineService(holder, id) {
  try { await loadService(); } catch { holder.replaceChildren(h('p', { class: 'section-intro' }, 'Not available yet.')); return; }
  const days = D.service.days;
  const today = sydKey(Date.now());
  const idxs = days.map((d, j) => ((dateFromKey(today) - dateFromKey(d.date)) / 864e5 < 30 ? j : -1)).filter(j => j >= 0);
  const { K, lines } = serviceTotals(idxs);
  const c = lines[id];
  const link = h('a', { href: `#/service?line=${id}` }, 'Today’s cancelled and missing trips on this line');
  if (!c || !c[K.counted]) {
    holder.replaceChildren(h('p', { class: 'section-intro' },
      c && c[K.untracked] ? 'This line’s trains do not appear in the live trip data often enough to tell which trips ran.'
        : days.length ? `Recording started on ${F.dateUTC.format(dateFromKey(days[0].date))}. Figures appear once trips have been judged.` : 'Recording has not started yet.'));
    return;
  }
  const lost = c[K.cancelled] + c[K.missing];
  const chart = h('div', { class: 'chart' });
  const perDay = idxs.map(j => ({ date: days[j].date, c: D.service.lines[id]?.[j] }));
  holder.replaceChildren(
    h('p', { class: 'section-intro' }, `Last 30 days, from the live trip data (recording started ${F.dateUTC.format(dateFromKey(days[0].date))}). `, link, '.'),
    h('div', { class: 'kpis' },
      kpi('Trips that ran', pctLabel((100 * (c[K.counted] - lost)) / c[K.counted]), `${(c[K.counted] - lost).toLocaleString('en-AU')} of ${c[K.counted].toLocaleString('en-AU')} judged`),
      kpi('Cancelled', c[K.cancelled].toLocaleString('en-AU'), 'Marked cancelled in the live data'),
      kpi('Never seen', c[K.missing].toLocaleString('en-AU'), 'Timetabled, but not in the live data'),
      kpi('Late at the end of the line', c[K.ran] ? pctLabel((100 * c[K.late]) / c[K.ran]) : '–', `${plural(c[K.late], 'trip')} ${lineInfo(id).mode === 'intercity' ? 6 : 5}+ minutes late`)),
    ...(perDay.length >= 2 ? [h('div', { class: 'chart-block' }, h('h3', {}, 'Trips lost each day'), h('p', { class: 'chart-note' }, 'Share of judged trips that were cancelled or never seen.'), chart)] : []));
  if (perDay.length >= 2) {
    requestAnimationFrame(() => columns(chart, {
      items: perDay.map(({ date, c: x }) => {
        const n = x?.[K.counted] || 0, l = n ? x[K.cancelled] + x[K.missing] : 0;
        return { value: n ? (100 * l) / n : 0, tip: [{ value: n ? `${pctLabel((100 * l) / n)} lost` : 'No trips judged' }, { label: F.dateUTC.format(dateFromKey(date)) }, { label: `${l} of ${n.toLocaleString('en-AU')} trips`, muted: true }] };
      }),
      ticks: perDay.map((d, i) => ({ i, label: F.dateUTCShort.format(dateFromKey(d.date)) })).filter((t, i) => i % Math.max(1, Math.ceil(perDay.length / 6)) === 0),
      yUnit: '%', ariaLabel: 'Share of trips lost per day' }));
  }
}

const OUTCOME_LABEL = { cancelled: 'Cancelled', missing: 'Never seen', unclear: 'Not seen running', late: 'Late', part: 'Skipped stops' };
function tripList(detail, lineIds, showAll) {
  const keep = t => showAll || t[3] === 'cancelled' || t[3] === 'missing';
  const groups = lineIds.map(id => [id, (detail?.trips?.[id] || []).filter(keep)]).filter(([, list]) => list.length);
  if (!groups.length) return h('p', { class: 'empty-chart' }, showAll ? 'Every judged trip ran on time.' : 'No judged trip was cancelled or missing.');
  return h('div', { class: 'svc-trips' }, groups.map(([id, list]) => h('section', { class: 'svc-group', 'aria-label': fullName(lineInfo(id)) },
    h('h3', {}, badge(id), ' ', lineInfo(id).name, h('span', { class: 'muted' }, ` ${plural(list.length, 'trip')}`)),
    h('ul', { class: 'svc-list' }, list.map(([start, headsign, origin, outcome, delay]) => h('li', {},
      h('span', { class: 'svc-time' }, svcTime(start)),
      h('span', { class: 'svc-trip' }, headsign ? `to ${headsign.replace(/\s+Station$/i, '')}` : 'Trip', origin ? h('span', { class: 'muted' }, ` from ${origin}`) : null),
      h('span', { class: `svc-out ${outcome}` }, OUTCOME_LABEL[outcome] || outcome, (outcome === 'late' || outcome === 'part') && delay != null && delay >= 60 ? ` ${Math.round(delay / 60)} min` : '')))))));
}

function serviceTable(lines, K) {
  const ids = Object.keys(lines).sort((a, b) => D.meta.lines.findIndex(l => l.id === a) - D.meta.lines.findIndex(l => l.id === b));
  const n = v => v.toLocaleString('en-AU');
  return h('div', { class: 'table-wrap' }, h('table', {},
    h('thead', {}, h('tr', {}, ['Line', 'Due', 'Judged', 'Ran', 'Late', 'Skipped stops', 'Cancelled', 'Never seen', 'Not seen running', 'Not judged', 'Extra trips']
      .map((t, i) => h('th', { class: i ? 'num' : null }, t)))),
    h('tbody', {}, ids.map(id => {
      const c = lines[id];
      return h('tr', {}, h('td', {}, badge(id), ' ', lineInfo(id).name),
        [c[K.due], c[K.counted], c[K.ran], c[K.late], c[K.part], c[K.cancelled], c[K.missing], c[K.unclear], c[K.due] - c[K.counted], c[K.added]].map(v => h('td', { class: 'num' }, n(v))));
    }))));
}

// ---------- trackwork ahead ----------
// Planned work from the published trackwork alerts: a timeline with one track per line and a block
// wherever work is planned, then the details week by week.
async function loadTrackwork() {
  if (!D.trackwork) D.trackwork = await getJson(`data/trackwork.json?t=${Date.now()}`);
  return D.trackwork;
}
const TW_SEV = [
  { cls: 'tw-s0', label: 'Extra services' },
  { cls: 'tw-s1', label: 'Changed timetable or stops' },
  { cls: 'tw-s2', label: 'Some trains replaced, or trains cut short' },
  { cls: 'tw-s3', label: 'Part of the line closed, buses replace trains' },
];
const hourOf = t => Number(F.hour.format(new Date(t)));
// "Sat 17 Oct"
const dayLabel = t => {
  const p = Object.fromEntries(F.dayNoYear.formatToParts(new Date(t)).map(x => [x.type, x.value]));
  return `${p.weekday} ${p.day} ${p.month}`;
};

// Plain-language "when" for a list of [from, to] windows.
function twWhen(w) {
  const ws = w.map(([f, t]) => [ms(f), ms(t)]);
  const one = ([f, t]) => {
    if (hourOf(f) <= 5 && hourOf(t) <= 5 && t - f >= 20 * 3600e3) {
      const d1 = f, d2 = t - 6 * 3600e3;
      return sydKey(d1) === sydKey(d2) ? `All day ${dayLabel(d1)}` : `All day ${dayLabel(d1)} to ${dayLabel(d2)}`;
    }
    const svc = x => sydKey(x - 4 * 3600e3);
    if (svc(f) === svc(t - 1) || sydKey(f) === sydKey(t - 1)) return `${dayLabel(f)}, ${F.time.format(new Date(f))} to ${F.time.format(new Date(t))}`;
    return `${dayLabel(f)} ${F.time.format(new Date(f))} to ${dayLabel(t)} ${F.time.format(new Date(t))}`;
  };
  if (ws.length > 1) {
    const st = new Set(ws.map(([f]) => F.time.format(new Date(f)))), en = new Set(ws.map(([, t]) => F.time.format(new Date(t))));
    if (st.size === 1 && en.size === 1) {
      const h0 = hourOf(ws[0][0]);
      const word = h0 >= 18 || h0 < 4 ? 'Nightly' : 'Daily';
      return `${word} ${[...st][0]} to ${[...en][0]}, ${dayLabel(ws[0][0])} to ${dayLabel(ws[ws.length - 1][0])}`;
    }
    return ws.slice(0, 3).map(one).join('; ') + (ws.length > 3 ? `; and ${ws.length - 3} more` : '');
  }
  return one(ws[0]);
}

// The coming weekend (or this one, on a Saturday or Sunday): [Saturday 00:00, Monday 04:00] in ms.
function weekendRange(days) {
  const i = days.findIndex(([d]) => dateFromKey(d).getUTCDay() === 6);
  const today = days[0][0];
  const sunToday = dateFromKey(today).getUTCDay() === 0;
  if (sunToday) return [ms(days[0][1]) - 864e5, ms(days[1]?.[1] ?? days[0][1]) + 4 * 3600e3];
  if (i < 0 || !days[i + 2]) return null;
  return [ms(days[i][1]), ms(days[i + 2][1]) + 4 * 3600e3];
}
const overlaps = (w, a, b) => w.some(([f, t]) => ms(f) < b && ms(t) > a);
const orderOf = id => D.meta.lines.findIndex(l => l.id === id);

function badgeList(ids) {
  const out = [];
  ids.forEach((id, i) => {
    out.push(h('span', { class: 'nowrap' }, badge(id), i < ids.length - 2 ? ',' : ''));
    if (i < ids.length - 1) out.push(i === ids.length - 2 ? ' and ' : ' ');
  });
  return out;
}

async function viewTrackwork(main) {
  const requestRoute = main.dataset.routeId;
  document.title = 'Trackwork ahead | NSW Rail Disruptions';
  main.replaceChildren(h('p', { class:'loading', role:'status' }, 'Loading planned trackwork…'));
  const tw = await loadTrackwork();
  if (main.dataset.routeId !== requestRoute) return;
  const q = new URLSearchParams(location.hash.split('?')[1] || '');
  const items = tw.items.filter(it => it.l.some(trackedLine));
  const lines = [...new Set(items.flatMap(it => it.l))].filter(trackedLine)
    .sort((a, b) => orderOf(a) - orderOf(b));
  let lineFilter = lines.includes(q.get('line')) ? q.get('line') : '';
  const now = Date.now();
  const wk = weekendRange(tw.days);
  const todayEnd = tw.days[1] ? ms(tw.days[1][1]) + 4 * 3600e3 : now + 24 * 3600e3;
  const last = tw.days[tw.days.length - 1][0];

  // Begin with useful decisions rather than a full-width technical timeline.
  // All labels describe *published* works, not the definitive absence of work.
  const summary = h('section', {
    class: 'tw-summary', 'aria-label': 'Published trackwork at a glance'
  });
  const summaryCard = (label, title, description, badges = []) =>
    h('article', { class: 'tw-summary-card' },
      h('p', { class: 'tw-summary-kicker' }, label),
      h('h2', { class: 'tw-summary-title' }, title),
      h('p', { class: 'tw-summary-description' }, description),
      badges.length ? h('div', { class: 'tw-summary-lines' }, ...badgeList(badges)) : null);
  const visibleItems = () => items.filter(it => !lineFilter || it.l.includes(lineFilter));
  const updateSummary = () => {
    const scoped = visibleItems();
    const today = scoped.filter(it => it.sev >= 2 && overlaps(it.w, now, todayEnd));
    const affectedNow = [...new Set(today.flatMap(it => it.l))].filter(id =>
      trackedLine(id) && (!lineFilter || id === lineFilter))
      .sort((a, b) => orderOf(a) - orderOf(b));
    const weekend = wk ? scoped.filter(it => it.sev >= 3 &&
      overlaps(it.w, wk[0], wk[1])) : [];
    const affectedWeekend = [...new Set(weekend.flatMap(it => it.l))].filter(id =>
      trackedLine(id) && (!lineFilter || id === lineFilter))
      .sort((a, b) => orderOf(a) - orderOf(b));
    summary.replaceChildren(
      summaryCard('Today and tonight',
        affectedNow.length ? plural(affectedNow.length, 'line') + ' affected' : 'No major work listed',
        affectedNow.length ? 'Published replacement or significant service changes remaining today.'
          : 'No major planned changes in the published alerts for this period.',
        affectedNow),
      summaryCard('This weekend',
        !wk ? 'Outside published range' :
          affectedWeekend.length ? plural(affectedWeekend.length, 'line') + ' with closures'
          : 'No closures listed',
        wk ? dayLabel(wk[0]) + ' – ' + dayLabel(wk[1] - 6 * 3600e3) +
          '. Based on published closure notices.'
          : 'The current feed does not include the next complete weekend.',
        affectedWeekend),
      summaryCard('Published schedule',
        plural(scoped.length, 'notice'),
        'Published works available through ' +
          F.dateUTC.format(dateFromKey(addDays(last, -1))) + '.')
    );
  };

  const chart = h('div', { class: 'tw-chart' });
  const list = h('div', { class: 'tw-list' });
  const filterContext = h('p', { class: 'tw-filter-context', role: 'status' });
  const lineSelect = h('select', {
    onchange: ev => setLine(ev.target.value),
    'aria-label': 'Show planned trackwork for rail line'
  }, h('option', { value: '' }, 'All rail lines'),
    lines.map(id => {
      const option = h('option', { value: id }, id + ' ' + lineInfo(id).name);
      if (id === lineFilter) option.selected = true;
      return option;
    }));
  const filterBar = h('div', { class: 'tw-filter-bar' },
    h('label', { class: 'field tw-line-field' }, 'Show planned work for', lineSelect),
    filterContext);
  // Render the detailed SVG only when the timeline is visible. Measuring a
  // collapsed chart returns 0px on Safari and yields broken column widths.
  const timeline = h('details', { class: 'tw-timeline-disclosure' },
    h('summary', {},
      h('span', { class: 'tw-timeline-name' }, 'Explore the line-by-line timeline'),
      h('span', { class: 'tw-timeline-hint' }, 'View dates and select affected lines')),
    h('div', { class: 'tw-timeline-content' },
      h('p', { class: 'chart-note' },
        'Each rail line is a row and each block is published planned work. ' +
        'Weekends are shaded. Select a block to read its notice below.'),
      chart,
      h('div', { class: 'key tw-key' },
        [3, 2, 1].map(n => h('span', {},
          h('i', { class: 'tw-sw ' + TW_SEV[n].cls }), TW_SEV[n].label)))));
  const drawChart = () => {
    if (!timeline.open || !timeline.isConnected) return;
    trackworkChart(chart, { items, lines, days: tw.days, selected: lineFilter,
      onLine: id => {
        setLine(id === lineFilter ? '' : id);
        document.getElementById('tw-list-h')?.scrollIntoView({ behavior: 'smooth' });
      }
    });
  };
  timeline.addEventListener('toggle', () => {
    if (timeline.open) requestAnimationFrame(drawChart);
  });
  const drawList = () => {
    const shown = visibleItems();
    filterContext.textContent = lineFilter
      ? plural(shown.length, 'published notice') + ' for ' + lineFilter + '.'
      : plural(shown.length, 'published notice') + ' across listed rail lines.';
    list.replaceChildren(...trackworkGroups(shown, tw.days));
  };
  const setLine = value => {
    lineFilter = value;
    lineSelect.value = value;
    history.replaceState(null, '', '#/trackwork' +
      (value ? '?line=' + encodeURIComponent(value) : ''));
    updateSummary();
    drawList();
    drawChart();
  };

  mount(main,
    h('div', { class: 'line-head tw-page-heading' },
      h('div', {},
        h('p', { class: 'page-eyebrow' }, 'Plan ahead · Trackwork'),
        h('h1', {}, 'Trackwork ahead'))),
    h('p', { class: 'section-intro tw-source-intro' },
      'Planned trackwork published by TfNSW, usually about three weeks ahead. ' +
      'Notices can change. Check the official alerts before travelling.'),
    summary,
    h('section', { class: 'section tw-list-section',
      'aria-labelledby': 'tw-list-h' },
      h('div', { class: 'section-head' },
        h('h2', { id: 'tw-list-h' }, 'Upcoming changes')),
      filterBar, list),
    timeline,
    h('p', { class: 'chart-note tw-data-note' },
      'This page only shows planned notices in the available TfNSW data. ' +
      'Select a notice for full details on transportnsw.info.'));

  updateSummary();
  drawList();
  onResize(drawChart);
  pageRefresh = async () => {
    D.trackwork = null;
    await loadTrackwork();
    if (main.dataset.routeId !== requestRoute) return;
    viewTrackwork(main);
  };
}

// Line page: this line's planned trackwork.
async function lineTrackwork(holder, id) {
  let tw;
  try { tw = await loadTrackwork(); } catch { holder.replaceChildren(h('p', { class: 'section-intro' }, 'Not available right now.')); return; }
  const mine = tw.items.filter(it => it.l.includes(id));
  holder.replaceChildren(
    h('p', { class: 'section-intro' }, mine.length ? `${plural(mine.length, 'piece')} of planned work published so far. ` : 'No planned work has been published for this line yet. ',
      h('a', { href: `#/trackwork${mine.length ? `?line=${id}` : ''}` }, 'See trackwork on all lines')),
    ...(mine.length ? trackworkGroups(mine, tw.days) : []));
}

// Items grouped as "On now", "This week", "Next week", "Week of …".
function trackworkGroups(items, days) {
  if (!items.length) return [h('p', { class: 'empty-chart' }, 'No planned trackwork has been published for this line yet.')];
  const now = Date.now();
  const today = days[0][0];
  const monday = k => addDays(k, -((dateFromKey(k).getUTCDay() + 6) % 7));
  const thisMon = monday(today);
  const groups = new Map();
  for (const it of items) {
    const live = it.w.some(([f, t]) => ms(f) <= now && ms(t) > now);
    const next = it.w.find(([, t]) => ms(t) > now);
    const startKey = sydKey(Math.max(ms(next[0]), now) + (hourOf(ms(next[0])) < 4 ? -4 * 3600e3 : 0));
    const mon = monday(startKey);
    const key = live ? '0' : mon;
    const label = live ? 'On now' : mon === thisMon ? 'This week' : mon === addDays(thisMon, 7) ? 'Next week' : `Week of ${F.dateUTCShort.format(dateFromKey(mon))}`;
    if (!groups.has(key)) groups.set(key, { label, items: [] });
    groups.get(key).items.push(it);
  }
  return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([, g]) =>
    h('section', { class: 'tw-group' }, h('h3', {}, g.label), h('ul', { class: 'tw-items' }, g.items.map(trackworkItem))));
}

const TW_BOILERPLATE = /^(plan your trip|bus routes|replacement buses|most replacement buses|bikes aren|services may be delay|allow extra travel time\.?$)/i;
function trackworkItem(it) {
  // The first bullet worth showing: skip ones that only repeat the title with times.
  const core = it.title.toLowerCase().replace(/\.$/, '').split('. ')[0];
  const useful = it.bullets.filter(b => !TW_BOILERPLATE.test(b) && !b.toLowerCase().includes(core) && b.length > 20 && !b.endsWith(':'));
  const first = useful[0];
  const rest = it.bullets.filter(b => b !== first);
  return h('li', { class: `tw-item ${TW_SEV[it.sev].cls}`, id: `tw-${it.id}` },
    h('div', { class: 'tw-item-lines' }, it.l.filter(trackedLine).map(id => badge(id)), it.branch ? h('span', { class: 'muted' }, it.branch) : null),
    h('p', { class: 'tw-item-title' }, it.title),
    h('p', { class: 'tw-item-when' }, twWhen(it.w)),
    first ? h('p', { class: 'tw-item-text' }, first) : null,
    h('div', { class: 'tw-item-foot' },
      rest.length ? h('details', {}, h('summary', {}, 'More details'), h('ul', {}, rest.map(b => h('li', {}, b)))) : null,
      h('a', { href: `https://transportnsw.info/alerts/details#/${encodeURIComponent(it.id)}`, rel: 'noopener' }, 'Full alert on transportnsw.info')));
}

// The timeline: one row per line, a block for each window of planned work.
function trackworkChart(container, { items, lines, days, selected, onLine }) {
  const NS = 'http://www.w3.org/2000/svg';
  const S = (tag, attrs = {}) => { const n = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v); return n; };
  const W = Math.max(300, container.clientWidth);
  const narrow = W < 640;
  const labelW = 54, padR = 6, headH = narrow ? 40 : 52, rowH = narrow ? 30 : 34;
  const t0 = ms(days[0][1]), t1 = ms(days[days.length - 1][1]);
  const plotW = W - labelW - padR;
  const x = t => labelW + ((Math.min(Math.max(t, t0), t1) - t0) / (t1 - t0)) * plotW;
  const H = headH + lines.length * rowH + 6;
  const svg = S('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'group', 'aria-label': 'Planned trackwork by line and day' });
  const dayW = plotW / (days.length - 1);
  // Days: weekend shading and labels.
  for (let i = 0; i < days.length - 1; i++) {
    const [key, start] = days[i];
    const a = x(ms(start)), b = x(ms(days[i + 1][1]));
    const dow = dateFromKey(key).getUTCDay();
    if (dow === 0 || dow === 6) svg.append(S('rect', { x: a, y: headH - 6, width: b - a, height: H - headH + 6, class: 'tw-weekend' }));
    const d = dateFromKey(key).getUTCDate();
    const showNum = dayW >= 18 || dow === 1 || i === 0;
    if (showNum) {
      const tx = S('text', { x: (a + b) / 2, y: headH - 10, 'text-anchor': 'middle', class: dow === 0 || dow === 6 ? 'tw-day tw-day-we' : 'tw-day' });
      tx.textContent = String(d);
      svg.append(tx);
    }
    if (dayW >= 18) {
      const wd = S('text', { x: (a + b) / 2, y: headH - 24, 'text-anchor': 'middle', class: 'tw-wd' });
      wd.textContent = 'SMTWTFS'[dow];
      svg.append(wd);
    }
    // Month names on their own row, at the first day shown and each 1st.
    if (i === 0 || d === 1) {
      const m = S('text', { x: a + (dayW >= 18 ? dayW / 2 : 0), y: 11, 'text-anchor': dayW >= 18 ? 'middle' : 'start', class: 'tw-month' });
      m.textContent = F.monthShort.format(dateFromKey(key));
      svg.append(m);
    }
  }
  // Rows.
  lines.forEach((id, r) => {
    const y = headH + r * rowH;
    const cy = y + rowH / 2;
    const l = lineInfo(id);
    const g = S('g', { class: `tw-row${selected && selected !== id ? ' tw-dim' : ''}` });
    g.append(S('line', { x1: labelW, x2: W - padR, y1: cy, y2: cy, class: 'tw-rail' }));
    const a = S('a', { href: `#/trackwork?line=${id}`, 'aria-label': `Show trackwork on ${fullName(l)}` });
    a.addEventListener('click', ev => { ev.preventDefault(); onLine(id); });
    a.append(S('rect', { x: 2, y: cy - 10, width: 44, height: 20, rx: 5, fill: l.color }));
    const tx = S('text', { x: 24, y: cy + 4.5, 'text-anchor': 'middle', class: 'cal-label', style: `fill:${onColor(l.color)};font-weight:700;font-family:var(--font-narrow)` });
    tx.textContent = id;
    a.append(tx);
    g.append(a);
    const mine = items.filter(it => it.l.includes(id)).sort((p, q) => p.sev - q.sev);
    for (const it of mine) {
      for (const [f, t] of it.w) {
        const bx = x(ms(f)), bw = Math.max(3, x(ms(t)) - bx);
        if (ms(t) <= t0 || ms(f) >= t1) continue;
        const blk = S('rect', { x: bx, y: cy - 8, width: bw, height: 16, rx: Math.min(3, bw / 2), class: `tw-block ${TW_SEV[it.sev].cls}`, tabindex: 0, role: 'button',
          'aria-label': `${id}: ${it.title}. ${twWhen([[f, t]])}` });
        const tip = [{ value: it.title }, { label: `${id}${it.branch ? ` ${it.branch}` : ''}` }, { label: twWhen(it.w), muted: true }];
        blk.addEventListener('pointermove', ev => showTip(tip, ev.clientX, ev.clientY));
        blk.addEventListener('pointerleave', hideTip);
        blk.addEventListener('focus', () => { const r2 = blk.getBoundingClientRect(); showTip(tip, r2.left + r2.width / 2, r2.top); });
        blk.addEventListener('blur', hideTip);
        const go = () => {
          hideTip();
          const card = document.getElementById(`tw-${it.id}`);
          if (!card) { onLine(''); requestAnimationFrame(() => document.getElementById(`tw-${it.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })); return; }
          card.scrollIntoView({ behavior: 'smooth', block: 'center' });
          card.classList.remove('tw-flash'); void card.offsetWidth; card.classList.add('tw-flash');
        };
        blk.addEventListener('click', go);
        blk.addEventListener('keydown', ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); go(); } });
        g.append(blk);
      }
    }
    svg.append(g);
  });
  // Now marker.
  const now = Date.now();
  if (now > t0 && now < t1) {
    const nx = x(now);
    svg.append(S('line', { x1: nx, x2: nx, y1: headH - 4, y2: H - 2, class: 'tw-now' }));
    const nl = S('text', { x: nx - 4, y: H - 4, 'text-anchor': 'end', class: 'tw-now-label' });
    nl.textContent = 'Now';
    if (!narrow) svg.append(nl);
  }
  container.replaceChildren(svg);
}

// ---------- live map ----------
// Every train where it is now, on the network's real track: warmer dots are later, bigger dots fuller.
async function loadMap(force = false, kind = 'track') {
  // The internal schematic provides verified official-PDF route matching and
  // station patronage sequences; it is not a selectable hand-drawn map.
  if (kind === 'official' && !D.schematic)
    D.schematic = await getJson('data/schematic.json');
  if ((kind === 'track' || kind === 'official') && !D.network)
    D.network = await getJson('data/network.json');
  if (!D.live || force) D.live = await getJson(`data/live.json?t=${Date.now()}`);
}
const decode = flat => { const pts = [[flat[0], flat[1]]]; for (let i = 2; i < flat.length; i += 2) { const [x, y] = pts[pts.length - 1]; pts.push([x + flat[i], y + flat[i + 1]]); } return pts; };
const MAP_DELAY = [
  { max: 120, cls: 'mt-ok', label: 'On time or under 2 min late' },
  { max: 300, cls: 'mt-2', label: '2 to 5 min late' },
  { max: 600, cls: 'mt-5', label: '5 to 10 min late' },
  { max: Infinity, cls: 'mt-10', label: '10 min or more late' },
];
const MAP_SIZE = [[200, 4, 'Under 200 people'], [600, 5.5, '200 to 600'], [1000, 7, '600 to 1,000'], [Infinity, 8.5, 'Over 1,000']];
const LEVEL_WORDS = ['empty', 'many seats free', 'few seats free', 'standing room only', 'crowded', 'full'];
const delayClass = d => (d == null ? 'mt-none' : MAP_DELAY.find(b => d < b.max).cls);
const sizeOf = pax => (pax == null ? 4 : MAP_SIZE.find(([m]) => pax < m)[1]);

async function viewMap(main) {
  const requestRoute = main.dataset.routeId;
  document.title = 'Live map | NSW Rail Disruptions';
  main.replaceChildren(h('p', { class:'loading', role:'status' }, 'Loading the rail network map…'));
  const q = new URLSearchParams(location.hash.split('?')[1] || '');
  // Only two public presentations remain: the published TfNSW schematic and
  // the TfNSW GTFS-derived geographic view. Historical ?map=legacy/diagram
  // links safely redirect to the verified official artwork.
  const requested=q.get('map');
  const saved=prefs.get('mapKind','official');
  let kind=['official','track'].includes(requested)?requested:
    requested==='legacy'||requested==='diagram'?'official':
    saved==='track'?'track':'official';
  let officialAvailable = null;
  let officialImageUrl = OFFICIAL_MAP.image;
  await loadMap(true, kind);
  if (main.dataset.routeId !== requestRoute) return;
  // The geographic view uses TfNSW coordinates and a street basemap. An offline/CDN
  // failure preserves the existing vector track view as a usable fallback.
  let geographicReady = false;
  if (kind === 'track') {
    try { await loadLeaflet(); geographicReady = true; } catch (e) { console.warn('Using offline track drawing:', e.message); }
  }
  // Test actual image decoding. Missing artwork must never produce floating
  // train markers, but must not silently change the user's map selection either.
  async function checkOfficialMap(force = false) {
    if (!force && officialAvailable === true) return true;
    officialImageUrl = force
      ? OFFICIAL_MAP.image + '&retry=' + Date.now()
      : OFFICIAL_MAP.image;
    const loaded = await loadOfficialMapImage(officialImageUrl);
    officialAvailable = loaded ? true : null;
    return loaded;
  }
  if (kind === 'official') await checkOfficialMap();
  if (main.dataset.routeId !== requestRoute) return;
  let view = ['city', 'sydney', 'all'].includes(q.get('view')) ? q.get('view') : prefs.get('mapView', 'sydney');
  if (!['city', 'sydney', 'all'].includes(view)) view = 'sydney';
  // The historical whole-network option belongs to the geographic renderer.
  if (kind === 'official' && view === 'all') view = 'sydney';
  let railFocus = prefs.get('mapRailFocus','rail') === 'streets'?'streets':'rail';
  let officialContrast = prefs.get('officialMapContrast','enhanced') === 'original'?'original':'enhanced';
  let lineFilter = q.get('line') || '';
  if (kind === 'official' && lineFilter && !/^T[1-9]$|^M1$/.test(lineFilter))
    lineFilter = '';
  const metroOpeningPanel=h('section',{class:'metro-opening-note',hidden:true,'aria-label':'Southwest Metro opening and live M1 positions'});
  const head = h('div', { class: 'map-head' });
  const filters = h('div', { class: 'filters map-controls',
    'aria-label':'Map view and line filters' });
  const holder = h('div', { class: 'map-holder' });
  let displayOptionsOpen=false;
  // Zoom and pan: vb is the visible area in map units (null = the whole chosen view).
  let vb = null;
  let redrawTimer = null;
  const zoomBtns = h('div', { class: 'map-zoom' },
    h('button', { type: 'button', 'aria-label': 'Zoom in', onclick: () => zoomBy(2) }, '+'),
    h('button', { type: 'button', 'aria-label': 'Zoom out', onclick: () => zoomBy(0.5) }, '−'),
    h('button', { type: 'button', class: 'map-reset', onclick: () => {
      if (geographic) geographic.reset();
      else { vb = null; drawMapOnly(); }
    } }, 'Reset'));
  const mapLabel = h('div', { class: 'map-corner-label', 'aria-hidden': 'true' });
  const frame = h('div', { class: 'map-frame' }, holder, mapLabel, zoomBtns);
  let geo = null; // { svg, base, W, H } from the last SVG drawing
  let geographic = null; // Leaflet instance for the real-world map
  // A sibling context panel avoids obscuring map symbols and does not change
  // any station/vehicle calibration. On iPhone it becomes a dismissible small
  // bottom sheet, visible even when the user taps high on the tall source map.
  const selectedTrain = h('div', { class:'map-selected-train',
    role:'status','aria-live':'polite','aria-atomic':'true' });
  const detailPanel = h('aside', { class:'map-details-panel',hidden:true,
    'aria-label':'Selected map item' },selectedTrain);
  const mapWorkspace=h('div', { class:'map-workspace' },frame,detailPanel);
  const clearSelectedMapItem=() => {
    selectedTrain.replaceChildren();
    detailPanel.hidden=true;
    mapWorkspace.classList.remove('has-selection');
    if(geographic)requestAnimationFrame(()=>geographic?.resize());
  };
  const showSelectedMapItem = (title, message) => {
    selectedTrain.replaceChildren(
      h('div', { class:'map-detail-content' },
        h('p', { class:'map-detail-kicker' }, 'Selected on map'),
        h('h2', { class:'map-detail-title' }, title),
        h('p', { class:'map-detail-description' }, message)),
      h('button', { type:'button',class:'map-selection-close',
        'aria-label':'Close selected map item details',
        onclick:clearSelectedMapItem }, '×'));
    detailPanel.hidden=false;
    mapWorkspace.classList.add('has-selection');
    if(geographic)requestAnimationFrame(()=>geographic?.resize());
  };
  const showSelectedTrain = label => showSelectedMapItem('Moving train / metro', label);
  const showSelectedStation = (name, lines, distant = []) => showSelectedMapItem(name,
    distant.length
      ? 'Station / stop · Close to displayed GTFS routes: ' + (lines.join(', ') || 'none confirmed')
        + '. Other GTFS stop-time associations, outside mapped line paths: ' + distant.join(', ')
      : 'Station / stop · Served by '+lines.join(', '));
  const svgPoint = (clientX, clientY) => {
    const r = geo.svg.getBoundingClientRect();
    const cur = vb || geo.base;
    const k = Math.min(r.width / cur[2], r.height / cur[3]);
    const ox = (r.width - cur[2] * k) / 2, oy = (r.height - cur[3] * k) / 2;
    return [cur[0] + (clientX - r.left - ox) / k, cur[1] + (clientY - r.top - oy) / k, k];
  };
  const setVB = next => {
    const base = geo.base;
    const w = Math.min(base[2], Math.max(base[2] / 24, next[2]));
    const hgt = (w * base[3]) / base[2];
    let [x, y] = next;
    x = Math.min(Math.max(x, base[0] - w * 0.25), base[0] + base[2] - w * 0.75);
    y = Math.min(Math.max(y, base[1] - hgt * 0.25), base[1] + base[3] - hgt * 0.75);
    vb = w >= base[2] - 1e-6 ? null : [x, y, w, hgt];
    geo.svg.setAttribute('viewBox', (vb || base).join(' '));
    geo.svg.classList.toggle('zoomed', !!vb);
    clearTimeout(redrawTimer);
    redrawTimer = setTimeout(drawMapOnly, 180); // redraw so dots and labels keep their size
  };
  const zoomAt = (factor, cx, cy) => {
    const cur = vb || geo.base;
    const w = cur[2] / factor, hh = cur[3] / factor;
    setVB([cx - (cx - cur[0]) / factor, cy - (cy - cur[1]) / factor, w, hh]);
  };
  const zoomBy = f => {
    if (geographic) { geographic.zoomBy(f); return; }
    if (!geo) return; // official image is unavailable, no map surface to zoom
    const cur = vb || geo.base;
    zoomAt(f, cur[0] + cur[2] / 2, cur[1] + cur[3] / 2);
  };
  const attach = svg => {
    const pts = new Map();
    let last = null, pinch = null;
    svg.addEventListener('dblclick', ev => { const [x, y] = svgPoint(ev.clientX, ev.clientY); zoomAt(2, x, y); });
    svg.addEventListener('wheel', ev => {
      if (!ev.ctrlKey && !ev.metaKey) return; // plain scrolling scrolls the page; pinch on a trackpad zooms
      ev.preventDefault();
      const [x, y] = svgPoint(ev.clientX, ev.clientY);
      zoomAt(Math.exp(-ev.deltaY / 200), x, y);
    }, { passive: false });
    svg.addEventListener('pointerdown', ev => {
      if (ev.pointerType === 'touch' && !vb && pts.size === 0) { pts.set(ev.pointerId, [ev.clientX, ev.clientY]); return; }
      pts.set(ev.pointerId, [ev.clientX, ev.clientY]);
      if (pts.size === 1 && vb) { last = [ev.clientX, ev.clientY]; svg.setPointerCapture(ev.pointerId); }
    });
    svg.addEventListener('pointermove', ev => {
      if (!pts.has(ev.pointerId)) return;
      pts.set(ev.pointerId, [ev.clientX, ev.clientY]);
      if (pts.size === 2) {
        const [[ax, ay], [bx, by]] = [...pts.values()];
        const d = Math.hypot(ax - bx, ay - by), mx = (ax + bx) / 2, my = (ay + by) / 2;
        if (pinch) {
          const [x, y] = svgPoint(mx, my);
          zoomAt(d / pinch, x, y);
        }
        pinch = d;
        ev.preventDefault();
      } else if (last && vb) {
        const [, , k] = svgPoint(ev.clientX, ev.clientY);
        const cur = vb;
        setVB([cur[0] - (ev.clientX - last[0]) / k, cur[1] - (ev.clientY - last[1]) / k, cur[2], cur[3]]);
        last = [ev.clientX, ev.clientY];
      }
    });
    const end = ev => { pts.delete(ev.pointerId); if (pts.size < 2) pinch = null; if (!pts.size) last = null; };
    svg.addEventListener('pointerup', end);
    svg.addEventListener('pointercancel', end);
  };
  const drawMapOnly = () => {
    const liveTrains = D.live?.trains || [];
    const cols = D.live?.cols || [];
    const plotCount = liveTrains.filter(t => !lineFilter || t[0] === lineFilter).length;
    frame.classList.toggle('map-frame-diagram', kind === 'official');
    frame.classList.toggle('map-frame-city', kind === 'official' && view === 'city');
    frame.classList.toggle('map-geographic-focus', kind === 'track' && railFocus === 'rail');
    mapLabel.replaceChildren(
      h('strong', {}, kind === 'official' ? 'PUBLISHED TfNSW NETWORK DIAGRAM' : 'GEOGRAPHIC RAIL NETWORK'),
      h('span', {}, kind === 'official' ? '2024 SOURCE ARTWORK · MATCHED LIVE OVERLAYS'
        : 'GTFS ROUTE SHAPES + REPORTED VEHICLE POSITIONS'),
      h('small', {}, plotCount
        ? `${plotCount.toLocaleString('en-AU')} reported vehicles ${kind === 'official' ? 'assessed for placement' : 'with mapped coordinates'}`
        : 'No live vehicle positions reported'));
    if (kind === 'official') {
      if (geographic) { geographic.destroy(); geographic=null; }
      if (!officialAvailable) {
        geo = null;
        // A mounted HTML image is a second way to load the authentic background.
        // On devices where detached Image() preflight fails but normal <img> works,
        // promote that success to the full live overlay automatically.
        const visiblePreview = h('img', {
          class: 'official-map-load-preview',
          alt: 'Original Transport for NSW rail map, attempting to load',
          onload: () => {
            if (kind === 'official' && holder.isConnected &&
                location.hash.startsWith('#/map') && officialAvailable !== true) {
              officialAvailable = true;
              draw();
            }
          },
          onerror: ev => { ev.currentTarget.hidden = true; },
          src: officialImageUrl,
        });
        holder.replaceChildren(visiblePreview, h('section', { class: 'official-map-error', role: 'alert' },
          h('h2', {}, 'Official TfNSW map image unavailable'),
          h('p', {}, 'The network diagram remains selected. The published source image did not load in this browser, so live train icons have been withheld rather than displayed over an incorrect map.'),
          h('p', {}, 'Try reloading the source image. If it opens directly but this view still fails, the image rendering inside the web app needs further investigation.'),
          h('div', { class: 'official-map-error-actions' },
            h('button', { type: 'button', onclick: async ev => {
              ev.currentTarget.disabled = true;
              ev.currentTarget.textContent = 'Checking map image…';
              await checkOfficialMap(true);
              draw();
            } }, 'Retry official image'),
            h('a', { href: OFFICIAL_MAP.image, target: '_blank', rel: 'noopener noreferrer' },
              'Open the source image directly'))));
        return;
      }
      geo = drawOfficialOverlay(holder, { network:D.network, live:D.live,
        view:view === 'all'?'sydney':view,lineFilter,vb,imageUrl:officialImageUrl,
        onTrainSelect:showSelectedTrain,onStationSelect:showSelectedStation,
        onTrainHover:showTip,onHoverEnd:hideTip });
      geo.svg.classList.toggle('official-enhanced-contrast',officialContrast==='enhanced');
      attach(geo.svg);
      return;
    }
    if (kind === 'track' && geographicReady && window.L?.map) {
      const colors = Object.fromEntries(D.meta.lines.map(l => [l.id, l.color]));
      if (!geographic) geographic = createGeographicMap(holder, {
        net: D.network, live: D.live, view, lineFilter, colors,
        onTrainSelect: showSelectedTrain, onStationSelect: showSelectedStation,
        railFocus,
      });
      else geographic.update({ live: D.live, view, lineFilter });
      geo = null;
      return;
    }
    if (geographic) { geographic.destroy(); geographic = null; }
    // Offline fallback stays geographic: no locally invented route geometry.
    geo = networkMap(holder, { net: D.network, live: D.live, view, lineFilter, vb,
      onTrainSelect: showSelectedTrain, onStationSelect: showSelectedStation });
    attach(geo.svg);
  };
  const legend = h('div', { class: 'map-legend' });
  const notes = h('div');
  const sourceCredit = h('p', { class:'map-source-credit' });
  const mapMethodDetails=h('div', { class:'map-methodology-body' });
  const mapMethod=h('details', { class:'map-methodology' },
    h('summary', {}, 'Map sources, accuracy and symbols'),mapMethodDetails);
  mount(main,
    h('div', { class: 'line-head map-page-heading' },
      h('div', {},
        h('p', { class:'page-eyebrow' }, 'Network · Live positions'),
        h('h1', {}, 'Network map'),
        h('p', { class:'map-page-subtitle' },
          'Choose a map and tap a station or service for details.'))),
    head,metroOpeningPanel,filters,mapWorkspace,legend,
    h('section', { class: 'section map-current-notes',
      'aria-labelledby': 'map-notes-h' },
      h('h2', { id: 'map-notes-h' }, 'Current incidents and closures'), notes),
    sourceCredit,
    mapMethod);

  const setState = () => {
    const p = new URLSearchParams();
    p.set('map',kind);
    if (view !== 'sydney') p.set('view', view);
    if (lineFilter) p.set('line', lineFilter);
    history.replaceState(null, '', `#/map${p.toString() ? `?${p}` : ''}`);
  };
  const draw = () => {
    const live = D.live, net = D.network;
    const southwest=southwestMetroMapSummary(net,live);
    metroOpeningPanel.hidden=!southwest.officiallyOpened;
    if(southwest.officiallyOpened){
      const focusSouthwest=async()=>{
        if(kind!=='track'){
          kind='track';vb=null;clearSelectedMapItem();
          if(!geographicReady){
            try{await loadLeaflet();geographicReady=true;}
            catch(e){console.warn('Using offline geographic fallback:',e.message);}
          }
          await loadMap(false,kind);
          if(main.dataset.routeId!==requestRoute)return;
        }
        view='sydney';lineFilter='M1';vb=null;clearSelectedMapItem();
        prefs.set('mapKind','track');prefs.set('mapView','sydney');
        setState();draw();
      };
      const observations=southwest.positionsFresh
        ? southwest.m1Positions+' TfNSW-reported M1 vehicles · '+
          southwest.southwestReportedPositions+' in a Southwest geographic review area · '+
          southwest.bankstownHeadsignPositions+' showing Bankstown as their destination. '+
          'Position feed at '+time(southwest.positionTimestamp)+'.'
        : 'M1 positions are unavailable or over 15 minutes old; current vehicle counts are withheld.';
      const stationStatus=southwest.sourceHasMetroLine
        ? southwest.newStationsInSource+'/'+southwest.expectedNewStations+
          ' new Southwest Metro stops represented in collected GTFS.'
        : 'M1 GTFS line geometry not available; map coverage cannot be confirmed.';
      metroOpeningPanel.replaceChildren(
        h('div',{class:'metro-opening-copy'},
          h('strong',{},'M1 Southwest Metro · Bankstown extension now open'),
          h('p',{},'Opened Friday 30 October 2026 at 4:31am AEDT; through services connect Bankstown, the City and Tallawong.'),
          h('p',{class:'metro-opening-data'},stationStatus+' '+observations),
          ...(kind==='official'
            ? [h('p',{class:'metro-opening-warning'},
                'The original TfNSW network diagram is dated September 2024 and ends M1 at Sydenham. '+
                'It cannot display Southwest Metro trains on the extension. Use the Geographic Map for live data.')]
            : [h('p',{class:'metro-opening-method'},
                'Feed-reported positions are not exact GPS or confirmed station calls; the Southwest review area is approximate.')])
        ),
        h('div',{class:'metro-opening-actions'},
          h('button',{type:'button',class:'metro-map-shortcut',onclick:focusSouthwest},
            'Show M1 to Bankstown on Geographic Map'),
          h('a',{href:METRO_SOUTHWEST_OFFICIAL_URL,target:'_blank',rel:'noopener noreferrer'},
            'TfNSW opening information')
        )
      );
    }

    const c = live.counts || {};
    const top = Object.entries(c.byLine || {}).sort((a, b) => b[1] - a[1]).filter(([, n]) => n >= 2).slice(0, 3).map(([id]) => id);
    head.replaceChildren(
      h('p', { class: 'tw-headline' }, c.trains ? [`${c.trains.toLocaleString('en-AU')} trains, metros and trams are running. `,
        c.late5 ? `${c.late5.toLocaleString('en-AU')} are 5 or more minutes late${top.length ? ', most on ' : '.'}` : 'Almost all are on time.',
        ...(c.late5 && top.length ? [...badgeList(top), '.'] : [])] : 'No live positions right now.'),
      h('p', { class: 'tw-sub' }, live.at ? `Positions at ${time(live.at)}. Train-shaped icons are moving services; open circles are stations. Tap to inspect.` : ''));
    const lineIds = Object.keys((kind === 'track' ? net : D.schematic).lines)
      .filter(id => trackedLine(id) && (kind !== 'official' || /^T[1-9]$|^M1$/.test(id)))
      .sort((a, b) => orderOf(a) - orderOf(b));
    const mapKindControl=segmented([
      ['official','Network diagram · TfNSW'],
      ['track','Geographic map · GTFS']
    ],kind,async v=>{
      if(kind===v)return;
      kind=v;vb=null;clearSelectedMapItem();
      if (kind === 'official' && view === 'all') view = 'sydney';
      if (kind === 'official' && lineFilter && !/^T[1-9]$|^M1$/.test(lineFilter))
        lineFilter = '';
      if(kind==='official')await checkOfficialMap();
      if(kind==='track'&&!geographicReady){
        try{await loadLeaflet();geographicReady=true;}
        catch(e){console.warn('Using offline track drawing:',e.message);}
      }
      await loadMap(false,kind);
      if (main.dataset.routeId !== requestRoute) return;
      prefs.set('mapKind',kind);
      setState();draw();
    },'Map type');
    const areaControl=segmented(kind==='official'
      ? [['sydney','Published map'],['city','City centre']]
      : [['sydney','Sydney'],['city','City centre'],['all','Whole network']],
    view,v=>{
      view=v;vb=null;clearSelectedMapItem();
      prefs.set('mapView',v);setState();draw();
    },'Map area');
    const lineControl=h('label', { class:'field map-line-filter' },
      'Rail line',
      h('select', { onchange:ev=>{
        lineFilter=ev.target.value;
        clearSelectedMapItem();setState();draw();
      }},
        h('option', { value:'' }, 'All lines'),
        lineIds.map(id=>{
          const o=h('option', { value:id }, `${id} ${lineInfo(id).name}`);
          if(id===lineFilter)o.selected=true;
          return o;
        })));
    const extraDisplay=h('details',{class:'map-display-options',
      ...(displayOptionsOpen?{open:true}:{})},
      h('summary', {}, 'Display options'),
      h('div', { class:'map-display-option-content' },
        areaControl,
        ...(kind==='track'
          ? [segmented([['rail','Rail focus'],['streets','Street detail']],railFocus,v=>{
              railFocus=v;prefs.set('mapRailFocus',v);
              geographic?.setRailFocus(v);
              frame.classList.toggle('map-geographic-focus',v==='rail');
            },'Geographic basemap emphasis')]
          : []),
        ...(kind==='official'
          ? [segmented([['enhanced','Enhanced contrast'],['original','Original colours']],
              officialContrast,v=>{
                officialContrast=v;prefs.set('officialMapContrast',v);
                if(geo?.svg)geo.svg.classList.toggle('official-enhanced-contrast',v==='enhanced');
              },'TfNSW source map contrast')]
          : [])));
    extraDisplay.addEventListener('toggle',()=>{
      // Ignore a delayed toggle event from controls that have been replaced
      // by a later map redraw.
      if(extraDisplay.isConnected)displayOptionsOpen=extraDisplay.open;
    });
    filters.replaceChildren(
      h('div',{class:'map-primary-controls'},mapKindControl,lineControl),
      extraDisplay);
    drawMapOnly();
    if (kind === 'official' && geo?.positioned != null) {
      mapLabel.append(h('small', {}, geo.namedStations+' confirmed station locations · '
        +geo.positioned+' positioned trains · '+geo.unmatched+' unpositioned (no trusted match)'));
    }
    legend.replaceChildren(
      h('div', { class: 'key map-symbol-key' },
        h('span', {}, h('i', { class: 'map-key-vehicle' }, '▰'), ' Moving train / metro'),
        h('span', {}, h('i', { class: 'map-key-station' }), ' Station / stop')),
      h('div', { class: 'key' }, MAP_DELAY.map(b => h('span', {}, h('i', { class: `map-dot ${b.cls}` }), b.label)), h('span', {}, h('i', { class: 'map-dot mt-none' }), 'No delay figure')),
      h('div', { class:'key' },
        h('span', {}, h('i', { class:'map-sec incident' }), 'Incident'),
        h('span', {}, h('i', { class:'map-sec closed' }), 'Closed for trackwork now')));
    const modeSource=kind==='official'
      ? 'The 2024 TfNSW published network diagram is schematic, not geographically to scale. '+
        'The map labels and background reflect that edition, while stations are individually '+
        'verified against source vector stop symbols. Only matched services are positioned; '+
        'unmatched trains are omitted rather than placed speculatively.'
      :geographic
        ? 'TfNSW GTFS shapes.txt supplies service route paths and GTFS stops supply geographic station positions. '+
          'Live markers use coordinates reported by TfNSW, which may not represent an exact position.'
        : 'Offline geographic fallback draws TfNSW GTFS stop and route geometry without street tiles.';
    sourceCredit.replaceChildren(kind==='official'
      ? 'Published 2024 network artwork: © Transport for NSW (CC BY 4.0). '
      : 'Geographic rail shapes and station positions: Transport for NSW GTFS. ',
      h('a', { href: kind==='official'
        ? 'https://transportnsw.info/sydney-trains-network-map'
        : 'https://opendata.transport.nsw.gov.au/data/dataset/sydney-train-routes',
        target:'_blank',rel:'noopener noreferrer' },
        kind==='official' ? 'Original map and attribution' : 'TfNSW Sydney Train Routes dataset'),
      '. Reported live vehicle positions are approximate.');
    mapMethodDetails.replaceChildren(
      h('p', {}, modeSource),
      h('p', {}, 'An open circle represents a station; a solid vehicle symbol represents a service. '+
        'Map delay colours and closure markers are explained in the legend above. Tap or focus a symbol '+
        'to inspect its details. Where there is no live position or reliable match, no position is invented.'),
      h('p', {}, '© 2024 Transport for NSW, Sydney network map under CC BY 4.0. '+
        'The printed routes may differ from current services. The source artwork is not changed by this website.'),
      h('p', {}, 'Live overlay data uses TfNSW GTFS feeds. Geographic view maps use TfNSW stop locations '+
        'and OpenStreetMap streets/coastline subject to map tile availability.'));
    const ov = (live.overlays || []).filter(o => !lineFilter || o.lines.includes(lineFilter));
    notes.replaceChildren(ov.length
      ? h('ul', { class: 'map-notes' }, ov.map(o => h('li', { class: o.kind },
        h('span', { class: `map-sec ${o.kind}` }), h('span', {}, o.lines.filter(trackedLine).map(id => badge(id)), ' ', o.title,
          !(o.paths.length || o.pins.length) ? h('span', { class: 'muted' }, ' (no place named, so not marked)') : null))))
      : h('p', { class: 'empty-chart' }, 'No incidents or trackwork closures right now.'));
  };
  draw();
  // A saved/bookmarked legacy URL is served by the verified official diagram.
  // Canonicalise it without a second navigation or losing valid line filters.
  if (requested === 'legacy' || requested === 'diagram') setState();
  // Tear down Leaflet's global handlers on navigation, including repeated Home Screen visits.
  mapViewCleanup = () => {
    clearTimeout(redrawTimer);
    if (geographic) { geographic.destroy(); geographic = null; }
  };
  onResize(() => { if (geographic) geographic.resize(); else draw(); });
  pageRefresh = async () => {
    await loadMap(true,kind);
    if (main.dataset.routeId === requestRoute) draw();
  };
}

// Shared hover treatment for both SVG maps. Hover is transient; click/tap remains
// the persistent selection panel. Keyboard focus gets the same information.
// Pointerenter makes the preview appear without requiring the mouse to move
// again after entering a small train or station symbol.
function bindSvgMapHover(node, rows) {
  const show = event => {
    if (event.pointerType === 'touch' || event.buttons) return;
    showTip(rows, event.clientX, event.clientY);
  };
  node.addEventListener('pointerenter', show);
  node.addEventListener('pointermove', show);
  node.addEventListener('pointerleave', hideTip);
  node.addEventListener('focus', () => {
    const rect = node.getBoundingClientRect();
    showTip(rows, rect.left + rect.width / 2, rect.top);
  });
  node.addEventListener('blur', hideTip);
}

function svgTrainMarker(S, { x, y, line, delay, pax, headsign, fullest, units, compact, dim, select }) {
  const a = units;
  const w = a(compact ? 15 : 23), hgt = a(compact ? 14 : 21);
  const group = S('g', { transform: 'translate(' + x + ' ' + y + ')',
    class: 'map-vehicle ' + delayClass(delay) + (dim ? ' dim' : ''),
    tabindex: '0', role: 'button',
    'aria-label': 'Moving service: ' + trainDescription({ line, destination: headsign, delay, passengers: pax, fullness: fullest }) });
  group.append(S('rect', { x: -w / 2, y: -hgt / 2, width: w, height: hgt,
    rx: a(3.5), class: 'map-vehicle-shell', 'stroke-width': a(1.5) }));
  group.append(S('rect', { x: -w * .34, y: -hgt * .37, width: w * .68, height: hgt * .30,
    rx: a(1), class: 'map-vehicle-windshield' }));
  group.append(S('circle', { cx: -w * .27, cy: hgt * .19, r: a(1.2), class: 'map-vehicle-light' }));
  group.append(S('circle', { cx: w * .27, cy: hgt * .19, r: a(1.2), class: 'map-vehicle-light' }));
  if (!compact) {
    const text = S('text', { x: 0, y: hgt * .31, 'text-anchor': 'middle',
      'font-size': a(line.length > 2 ? 7 : 9), class: 'map-vehicle-code' });
    text.textContent = line;
    group.append(text);
  }
  const summary = trainDescription({ line, destination: headsign, delay, passengers: pax, fullness: fullest });
  const tip = mapTrainHoverRows({line,headsign,delay,pax});
  bindSvgMapHover(group, tip);
  group.addEventListener('click', () => { hideTip(); select?.(summary); });
  group.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); select?.(summary); }
  });
  return group;
}

function networkMap(container, { net, live, view, lineFilter, vb: zoom, onTrainSelect, onStationSelect }) {
  const NS = 'http://www.w3.org/2000/svg';
  const S = (tag, attrs = {}) => { const n = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) if (v != null) n.setAttribute(k, v); return n; };
  const [vx0, vy0, vx1, vy1] = net.views[view];
  const pad = (vx1 - vx0) * 0.03;
  const W = Math.max(300, container.clientWidth);
  // The frame keeps the chosen view's shape (within the window's height); zooming changes what fits in it.
  let base = [vx0 - pad, vy0 - pad, vx1 - vx0 + 2 * pad, vy1 - vy0 + 2 * pad];
  const H = Math.min(Math.round((W * base[3]) / base[2]), Math.round(window.innerHeight * 0.85), 1100);
  if (base[2] / base[3] < W / H) { const w = (base[3] * W) / H; base = [base[0] - (w - base[2]) / 2, base[1], w, base[3]]; }
  else { const hh = (base[2] * H) / W; base = [base[0], base[1] - (hh - base[3]) / 2, base[2], hh]; }
  const vb = zoom || base;
  const scale = W / vb[2]; // px per map unit
  const u = px => px / scale;
  const zoomed = scale / (W / base[2]);
  const svg = S('svg', { viewBox: vb.join(' '), width: W, height: H, class: `map-svg${zoom ? ' zoomed' : ''}`, role: 'img', 'aria-label': 'Map of the rail network with each running train' });
  const pathOf = chains => chains.map(c => { const p = decode(c); return `M${p.map(([x, y]) => `${x} ${y}`).join('L')}`; }).join('');
  // Track.
  const track = S('g', { class: 'map-track' });
  for (const [id, chains] of Object.entries(net.lines)) {
    if (!trackedLine(id)) continue;
    const lr = lineInfo(id).mode === 'lightrail';
    track.append(S('path', { d: pathOf(chains), 'stroke-width': u(lr ? 1.6 : 2.2) }));
  }
  svg.append(track);
  if (lineFilter && net.lines[lineFilter]) {
    svg.append(S('path', { d: pathOf(net.lines[lineFilter]), class: 'map-line-hi', stroke: lineInfo(lineFilter).color, 'stroke-width': u(4) }));
  }
  // Incidents and trackwork closures.
  for (const o of live.overlays || []) {
    if (lineFilter && !o.lines.includes(lineFilter)) continue;
    // A pale casing under each section keeps it readable on top of a highlighted line of the same colour.
    for (const p of o.paths) {
      const w = o.kind === 'incident' ? 9 : 7;
      svg.append(S('path', { d: pathOf([p]), class: 'map-ov-case', 'stroke-width': u(w + 4) }));
      svg.append(S('path', { d: pathOf([p]), class: `map-ov ${o.kind}`, 'stroke-width': u(w), 'stroke-dasharray': o.kind === 'closed' ? `${u(9)} ${u(5)}` : null }));
    }
  }
  // Stations.
  const st = S('g', { class: 'map-stations' });
  const lbl = S('g', { class: 'map-labels' });
  // More station names as you zoom in; fewer on small screens.
  const minLabel = zoomed >= 3 ? 0 : zoomed >= 1.6 ? 1 : view === 'all' || W < 640 ? 2 : 1;
  for (const [name, x, y, ls, label] of net.stations) {
    const { near, distant } = geographicStationLines(net, name, ls);
    if (lineFilter && !near.includes(lineFilter)) continue;
    const station = S('circle', { cx: x, cy: y, r: u(label ? 2.4 : 1.5),
      class: 'map-station-select', role: 'button', tabindex: label >= 1 || !!lineFilter ? '0' : '-1',
      'aria-label': 'Fixed station: ' + name + '. Nearby mapped lines ' + (near.join(', ') || 'not confirmed') +
        (distant.length ? '. Other recorded GTFS associations ' + distant.join(', ') : '') });
    station.addEventListener('click', () => onStationSelect?.(name, near, distant));
    station.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onStationSelect?.(name, near, distant); }
    });
    bindSvgMapHover(station, [
      { value: name + ' station' },
      { label: 'Mapped lines nearby: ' + (near.join(' · ') || 'not confirmed'), muted: true },
      ...(distant.length ? [{ label: 'Other GTFS associations: ' + distant.join(' · '), muted: true }] : []),
    ]);
    station.addEventListener('click', hideTip);
    st.append(station);
    // Light rail stops are close together: name them only when zoomed well in.
    const tramOnly = near.length && near.every(l => lineInfo(l).mode === 'lightrail');
    if (label >= minLabel && (label || !tramOnly || zoomed >= 6)) {
      const t = S('text', { x: x + u(5), y: y + u(4), 'font-size': u(11) });
      t.textContent = name;
      lbl.append(t);
    }
  }
  svg.append(st);
  // Places named in incidents.
  for (const o of live.overlays || []) {
    if (lineFilter && !o.lines.includes(lineFilter)) continue;
    for (const [x, y, name] of o.pins) {
      svg.append(S('circle', { cx: x, cy: y, r: u(12), class: `map-pin ${o.kind}`, 'stroke-width': u(3) }));
      const t = S('text', { x: x + u(12), y: y - u(8), 'font-size': u(12), class: 'map-pin-label' });
      t.textContent = name;
      lbl.append(t);
    }
  }
  // Trains: on time first, latest on top.
  const trains = (live.trains || []).filter(t => trackedLine(t[0])).slice().sort((a, b) => (a[3] ?? -1) - (b[3] ?? -1));
  const tg = S('g', { class: 'map-trains' });
  for (const [line, x, y, delay, pax, fullest, cars, headsign] of trains) {
    const dim = lineFilter && line !== lineFilter;
    const c = svgTrainMarker(S, { x, y, line, delay, pax, headsign, fullest,
      units: u, compact: W < 640 && zoomed < 2, dim, select: onTrainSelect });
    tg.append(c);
  }
  svg.append(lbl);
  svg.append(tg);
  container.replaceChildren(svg);
  return { svg, base, W, H };
}

// The original hand-drawn schematic renderer was retired. Internal GTFS-to-
// schematic data remains available to the verified TfNSW PDF overlay and the
// independent station-patronage corridor views.

// ---------- trip page ----------
// Pick two stations, see what is happening on the lines between them, then open the official
// transportnsw.info planner with the trip filled in (this site has no journey planner of its own).
let STATIONS = null;
let pageRefresh = null;
const shortStation = n => n.replace(/\s+Station$/i, '').trim();

async function loadStations() {
  if (STATIONS) return STATIONS;
  const raw = await getJson('data/stations.json');
  const list = raw.map(([id, n, l, some]) => ({ id, n, s: shortStation(n), l, some: new Set(some || []) }));
  const counts = new Map();
  for (const st of list) counts.set(st.s.toLowerCase(), (counts.get(st.s.toLowerCase()) || 0) + 1);
  for (const st of list) if (counts.get(st.s.toLowerCase()) > 1) st.s = st.n; // keep names unique
  STATIONS = list;
  return list;
}

function findStation(text) {
  const t = String(text || '').trim().toLowerCase();
  if (!t) return null;
  const exact = STATIONS.find(st => st.s.toLowerCase() === t || st.n.toLowerCase() === t);
  if (exact) return exact;
  const starts = STATIONS.filter(st => st.s.toLowerCase().startsWith(t));
  return starts.length === 1 ? starts[0] : null;
}

function sydNowInput() {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date()).map(x => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

const PLANNER = 'https://transportnsw.info/trip-planner/plan';
// TfNSW mode numbers: 5 bus, 7 coach, 9 ferry, 11 school bus.
const NON_RAIL_MODES = '5,7,9,11';

function plannerUrl(from, to, when, t, railOnly) {
  const u = new URL(PLANNER);
  u.searchParams.set('from', from.id);
  u.searchParams.set('to', to.id);
  if (when !== 'now' && t) u.searchParams.set(when === 'arr' ? 'arrivalDateTime' : 'departureDateTime', t.replace(/[-T:]/g, ''));
  if (railOnly) u.searchParams.set('excludedModes', NON_RAIL_MODES);
  return u.toString();
}

function last30(id) {
  const L = D.daily.lines[id];
  if (!L) return null;
  const b = D.daily.days - 1, a = Math.max(0, b - 29);
  return { minutes: sum(L.inc, a, b), incidents: sum(L.n, a, b) };
}

function tripLineRow(id, someOnly = false) {
  const l = lineInfo(id);
  const st = lineStatus(id);
  const live = liveText(D.status.lines[id]?.live, id);
  const r = last30(id);
  const history = r ? `Last 30 days: ${hours(r.minutes)} of unplanned disruption, ${plural(r.incidents, 'incident')}` : null;
  return h('a', { class: 'board-row', href: `#/line/${id}` },
    badge(id, { link: false }),
    h('span', { class: 'board-name' }, l.name,
      someOnly ? h('span', { class: 'board-detail' }, 'Only some trains stop at both stations') : null,
      st.detail ? h('span', { class: 'board-detail' }, st.detail) : null,
      history ? h('span', { class: 'board-detail muted' }, history) : null),
    h('span', {}, stateEl(st.kind, st.label), live ? h('span', { class: 'live' }, live) : null));
}

function tripResults(from, to, when, t) {
  const order = id => D.meta.lines.findIndex(l => l.id === id);
  // Lines stopping at both ends; those that only do so with some of their trains go last.
  const someOnly = l => from.some.has(l) || to.some.has(l);
  const direct = from.l.filter(l => to.l.includes(l)).sort((a, b) => someOnly(a) - someOnly(b) || order(a) - order(b));
  const relevant = direct.length ? direct : [...new Set([...from.l, ...to.l])].sort((a, b) => order(a) - order(b));
  const out = h('section', { class: 'trip-results', 'aria-labelledby': 'trip-h' },
    h('h2', { id: 'trip-h' }, `${from.s} to ${to.s}`));

  const allSome = direct.length && direct.every(someOnly);
  out.append(direct.length
    ? h('div', { class: 'trip-summary' },
      h('p', {}, direct.length === 1 ? 'One line stops at both stations: ' : 'Lines that stop at both stations: ', joinBadges(direct, someOnly), '.'),
      allSome ? h('p', { class: 'muted' }, 'Only some trains run between these stations without a change, so check the planner for times.') : null)
    : h('div', { class: 'trip-summary' },
      h('p', {}, 'No single line runs between these stations, so you will need to change.'),
      h('p', { class: 'trip-ends' }, h('span', {}, `At ${from.s}: `, joinBadges(from.l)), h('span', {}, `At ${to.s}: `, joinBadges(to.l)))));

  const disruptions = currentDisruptions().filter(d => d.lines.some(l => relevant.includes(l)));
  const planned = new Map();
  for (const id of relevant) for (const p of D.status.lines[id]?.planned || []) {
    if (!planned.has(p.id)) planned.set(p.id, { ...p, lines: [] });
    planned.get(p.id).lines.push(id);
  }
  const todayKey = sydKey(Date.now());
  const sameDay = when === 'now' || (t || '').slice(0, 10) === todayKey;
  const railOnly = planned.size === 0 && sameDay;
  const url = plannerUrl(from, to, when, t, railOnly);
  const note = railOnly ? 'Shows trains, metro and light rail only.'
    : planned.size ? 'Buses are included because trackwork is replacing some services today.'
      : 'Buses are included in case trackwork replaces trains at that time.';

  out.append(h('div', { class: 'trip-cta' },
    h('a', { class: 'button', href: url, target: '_blank', rel: 'noopener' }, 'See journeys and times on transportnsw.info'),
    h('p', { class: 'muted' }, `Opens the official trip planner in a new tab with your stations filled in. ${note}`)));

  // With a change, the lines at a big station can be many; only list the ones with something to report.
  const rows = direct.length ? relevant : relevant.filter(id => lineStatus(id).kind !== 'good');
  out.append(h('h3', {}, direct.length ? (direct.length === 1 ? 'The line' : 'The lines') : 'Lines at either end with alerts'));
  out.append(rows.length ? h('div', { class: 'trip-lines' }, rows.map(id => tripLineRow(id, direct.length > 0 && someOnly(id))))
    : h('p', {}, stateEl('good', 'No alerts on any line at either station')));

  out.append(h('h3', {}, 'Unplanned disruptions'));
  out.append(disruptions.length
    ? h('ul', { class: 'now-alerts' }, disruptions.map(d => disruptionItem(d, { stations: [from, to] })))
    : h('p', {}, stateEl('good', 'None on these lines right now')));

  out.append(h('h3', {}, 'Trackwork and closures today'));
  out.append(planned.size
    ? h('ul', { class: 'now-list' }, [...planned.values()].map(p => h('li', {},
      h('div', { class: 'now-alert-meta' }, h('span', { class: 'now-alert-lines' }, p.lines.map(id => badge(id))), stateEl('planned', p.now ? 'On now' : 'Later today')),
      h('div', { class: 'alert-text', style: { marginTop: '4px' } }, p.t))))
    : h('p', {}, stateEl('good', 'None on these lines today')));
  if (!sameDay) out.append(h('p', { class: 'muted' }, 'Trackwork shown here is for today. Check transportnsw.info for the day you travel.'));
  return out;
}

function joinBadges(ids, someOnly = () => false) {
  const parts = [];
  ids.forEach((id, i) => {
    if (i > 0) parts.push(i === ids.length - 1 ? ' and ' : ', ');
    parts.push(badge(id));
    if (someOnly(id)) parts.push(h('span', { class: 'muted' }, ' (some services)'));
  });
  return parts;
}

async function viewTrip(main) {
  const requestRoute = main.dataset.routeId;
  document.title = 'Plan a trip | NSW Rail Disruptions';
  main.replaceChildren(h('p', { class:'loading', role:'status' }, 'Loading NSW stations…'));
  await loadStations();
  // The operator may switch tabs while the station catalogue is loading.
  // A deferred response must never replace a newer Map or Insights view.
  if (main.dataset.routeId !== requestRoute) return;
  const q = new URLSearchParams(location.hash.split('?')[1] || '');
  const saved = prefs.get('trip', {});
  const byId = id => STATIONS.find(st => st.id === id) || null;
  const state = {
    from: byId(q.get('from') || saved.from), to: byId(q.get('to') || saved.to),
    when: ['now', 'dep', 'arr'].includes(q.get('when')) ? q.get('when') : 'now',
    t: q.get('t') || '',
  };
  // An existing departure/arrival deep link without a time must still send
  // an explicit Sydney-local time to the official TfNSW journey planner.
  if (state.when !== 'now' && !state.t) state.t = sydNowInput();

  const list = h('datalist', { id: 'station-list' },
    STATIONS.map(st => h('option', { value: st.s, label: st.l.join(', ') })));
  const fromIn = h('input', {
    type: 'text', list: 'station-list', autocomplete: 'off', spellcheck: 'false',
    placeholder: 'e.g. Central', value: state.from?.s || '',
    id: 'trip-from', 'aria-describedby': 'trip-from-hint',
  });
  const toIn = h('input', {
    type: 'text', list: 'station-list', autocomplete: 'off', spellcheck: 'false',
    placeholder: 'e.g. Parramatta', value: state.to?.s || '',
    id: 'trip-to', 'aria-describedby': 'trip-to-hint',
  });
  const fromHint = h('span', { id: 'trip-from-hint', class: 'field-hint', 'aria-live': 'polite' });
  const toHint = h('span', { id: 'trip-to-hint', class: 'field-hint', 'aria-live': 'polite' });
  const timeIn = h('input', {
    type: 'datetime-local', value: state.t || sydNowInput(), required: true,
    'aria-label': 'Sydney local departure or arrival date and time',
    'aria-describedby': 'trip-time-hint',
  });
  const whenHolder = h('div', { class: 'trip-when' });
  const timeHint = h('span', {
    id:'trip-time-hint', class:'field-hint', 'aria-live':'polite'
  });
  const feedback = h('p', { class: 'trip-feedback', role: 'status', 'aria-live': 'polite' });
  const results = h('div', { class: 'trip-results-host' });

  const renderResults = () => {
    if (main.dataset.routeId !== requestRoute) return;
    if (!state.from || !state.to) {
      feedback.textContent = 'Select a departure and arrival station to see relevant line notices.';
      results.replaceChildren();
      return;
    }
    if (state.from.id === state.to.id) {
      feedback.textContent = 'Choose two different stations.';
      results.replaceChildren();
      return;
    }
    // datetime-local can be cleared while switching departure/arrival mode.
    // Do not generate a timeless TfNSW URL for a time-specific user request.
    if (state.when !== 'now' && (!state.t || !timeIn.validity.valid)) {
      timeIn.setAttribute('aria-invalid', 'true');
      timeHint.textContent = 'Select a valid Sydney date and time to view this journey.';
      feedback.textContent = 'Choose the departure or arrival date and time.';
      results.replaceChildren();
      return;
    }
    timeIn.removeAttribute('aria-invalid');
    timeHint.textContent = '';
    feedback.textContent = '';
    results.replaceChildren(tripResults(state.from, state.to, state.when, state.t));
  };
  const update = () => {
    if (main.dataset.routeId !== requestRoute) return;
    const p = new URLSearchParams();
    if (state.from) p.set('from', state.from.id);
    if (state.to) p.set('to', state.to.id);
    if (state.when !== 'now') {
      p.set('when', state.when);
      p.set('t', state.t);
    }
    history.replaceState(null, '', `#/trip${p.toString() ? `?${p}` : ''}`);
    if (state.from && state.to) prefs.set('trip', { from: state.from.id, to: state.to.id });
    renderResults();
  };
  const resolve = (input, hint, key) => {
    const st = findStation(input.value);
    state[key] = st;
    const invalid = Boolean(input.value.trim() && !st);
    if (invalid) input.setAttribute('aria-invalid', 'true');
    else input.removeAttribute('aria-invalid');
    hint.textContent = invalid ? 'Select a matching station from the suggestions.' : '';
    if (st && document.activeElement !== input) input.value = st.s;
    update();
  };
  for (const [input, hint, key] of [[fromIn, fromHint, 'from'], [toIn, toHint, 'to']]) {
    input.addEventListener('change', () => resolve(input, hint, key));
    input.addEventListener('input', () => {
      // Never retain a previous route when the user types a replacement.
      input.removeAttribute('aria-invalid');
      hint.textContent = '';
      const exact = STATIONS.find(st => st.s.toLowerCase() === input.value.trim().toLowerCase());
      if (exact) { resolve(input, hint, key); return; }
      if (state[key]) { state[key] = null; update(); }
    });
  }
  const swap = h('button', {
    type: 'button', class: 'swap', 'aria-label': 'Swap departure and arrival stations',
    title: 'Swap departure and arrival stations',
    onclick: () => {
      [state.from, state.to] = [state.to, state.from];
      [fromIn.value, toIn.value] = [toIn.value, fromIn.value];
      fromHint.textContent = toHint.textContent = '';
      fromIn.removeAttribute('aria-invalid');
      toIn.removeAttribute('aria-invalid');
      update();
    },
  });
  swap.innerHTML = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M6 3v13M6 16l-3-3M6 16l3-3M14 17V4M14 4l-3 3M14 4l3 3" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  timeIn.addEventListener('change', () => { state.t = timeIn.value; update(); });
  timeIn.addEventListener('input', () => {
    state.t = timeIn.value;
    update();
  });
  const drawWhen = () => {
    whenHolder.replaceChildren(
      segmented([['now', 'Leave now'], ['dep', 'Depart at'], ['arr', 'Arrive by']],
        state.when, v => {
          state.when = v;
          if (v !== 'now' && !state.t) state.t = timeIn.value || sydNowInput();
          drawWhen();
          update();
        }, 'Journey time'),
      ...(state.when === 'now' ? [] : [
        h('label', { class: 'field trip-time-input' },
          'Sydney date and time', timeIn, timeHint),
      ]));
  };
  drawWhen();

  const form = h('form', {
    class: 'trip-form trip-planner-card',
    onsubmit: ev => {
      ev.preventDefault();
      resolve(fromIn, fromHint, 'from');
      resolve(toIn, toHint, 'to');
    },
  },
    h('div', { class: 'trip-form-title' },
      h('h2', {}, 'Choose your journey'),
      h('p', {}, 'Enter two NSW stations or stops to check associated lines and alerts.')),
    h('div', { class: 'trip-stations' },
      h('label', { class: 'field trip-station-field', for: 'trip-from' },
        h('span', {}, 'Leaving from'), fromIn, fromHint),
      swap,
      h('label', { class: 'field trip-station-field', for: 'trip-to' },
        h('span', {}, 'Going to'), toIn, toHint)),
    h('div', { class: 'trip-time-row' },
      h('p', { class: 'trip-time-heading' }, 'When would you like to travel?'),
      whenHolder),
    h('p', { class: 'trip-form-footnote' },
      'Station suggestions are from TfNSW. Journey routes and departure times are provided by the official TfNSW Trip Planner.'));

  main.replaceChildren(
    h('div', { class: 'line-head trip-page-heading' },
      h('div', {},
        h('p', { class: 'page-eyebrow' }, 'Your journey · NSW rail'),
        h('h1', {}, 'Plan a trip'))),
    h('p', { class: 'section-intro trip-page-intro' },
      'Check disruptions on lines near your journey, then open the official planner for complete routes, changes and departure times.'),
    list, form,
    h('section', { class: 'trip-outcome', 'aria-label': 'Journey and disruption information' },
      feedback, results));
  renderResults();

  pageRefresh = () => {
    if (main.dataset.routeId !== requestRoute) return;
    if (userIsInteracting() && results.contains(document.activeElement)) {
      redrawPending = true; return;
    }
    if (!document.getElementById('tooltip').hidden) {
      redrawPending = true; return;
    }
    redrawPending = false;
    renderResults();
  };
}

function notFound(main, msg) {
  main.replaceChildren(h('div', { class: 'error-box' }, h('h1', {}, 'Page not found'), h('p', {}, msg), h('p', {}, h('a', { href: '#/' }, 'Go to the overview'))));
}

// ---------- router ----------
let mapViewCleanup = null;
function resetView() {
  if (mapViewCleanup) { mapViewCleanup(); mapViewCleanup = null; }
  hideTip();
  clearInterval(clockTimer);
  resizeHandlers = [];
  viewAbort.abort();
  viewAbort = new AbortController();
  pageRefresh = null;
}

// Insights is one navigation destination with four distinct data models.
 // Keep all historical deep links intact: /service, /crowding, /stations and
 // /log continue to resolve to their original renderers and existing data.
const INSIGHT_SECTIONS=Object.freeze([
  ['service','Reliability','#/service'],
  ['crowding','Crowding','#/crowding'],
  ['stations','Stations','#/stations'],
  ['log','History','#/log'],
]);
// The data boundaries are important: rail service completions, carriage
// occupancy, station Opal taps and archived alerts are not interchangeable.
const INSIGHT_DESCRIPTIONS=Object.freeze({
  service:['Observed trips and delay estimates',
    'Timetabled trips compared with TfNSW live observations. Passenger-hours lost are modelled estimates, not an official punctuality measure.'],
  crowding:['Reported carriage occupancy',
    'A relative 0–5 carriage occupancy scale by line and Sydney-local hour. Some observations are predicted, not measured passenger totals.'],
  stations:['Published Opal entries and exits',
    'Station tap counts by month, year and corridor. Entries + exits are tap events, not unique journeys or onboard passenger counts.'],
  log:['Recorded alerts and disruption history',
    'TfNSW alert records and derived disruption comparisons. Dates refer to recorded alerts; historical charts do not describe current service.'],
});
function addInsightsNavigation(main,hash) {
  const active=hash.startsWith('#/crowding')?'crowding'
    :hash.startsWith('#/stations')?'stations'
    :hash.startsWith('#/log')?'log':'service';
  const [label,description]=INSIGHT_DESCRIPTIONS[active];
  const kicker=h('p',{class:'insights-eyebrow'},'Insights · '+active.replace('service','reliability').replace('log','history'));
  const tabs=h('nav', { class:'insights-tabs',
    'aria-label':'Insights sections' },
    ...INSIGHT_SECTIONS.map(([key,text,url])=>
      h('a', { href:url,
        ...(key===active?{'aria-current':'page'}:{}),
      }, text)));
  const guide=h('div',{class:'insights-measure-guide'},
    h('div',{class:'insights-measure-main'},
      h('strong',{},label),
      h('p',{},description)),
    h('details',{class:'insights-compare'},
      h('summary',{},'Compare these measures'),
      h('dl',{},INSIGHT_SECTIONS.map(([key,name,url])=>
        h('div',{class:'insights-compare-item'},
          h('dt',{},h('a',{href:url},name)),
          h('dd',{},INSIGHT_DESCRIPTIONS[key][0]))))));
  // The child view still owns the only page H1, detailed controls and data.
  // Shared navigation is inserted only after the renderer has completed,
  // including async station and crowding loaders.
  main.prepend(kicker,tabs,guide);
}
let routeSequence = 0;
async function route() {
  resetView();
  const main = document.getElementById('main');
  const routeId = String(++routeSequence);
  main.dataset.routeId = routeId;
  const hash = location.hash || '#/';
  const insightRoute=hash.startsWith('#/service')||hash.startsWith('#/crowding')||
    hash.startsWith('#/stations')||hash.startsWith('#/log')||hash.startsWith('#/insights');
  const navKey = insightRoute?'insights':hash.startsWith('#/about')?''
    :hash.startsWith('#/trip')?'trip':hash.startsWith('#/trackwork')?'trackwork'
    :hash.startsWith('#/map')?'map':hash.startsWith('#/line')?'':'overview';
  main.classList.toggle('insights-page', insightRoute);
  document.querySelectorAll('[data-nav]').forEach(a => { if (a.dataset.nav === navKey) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  try {
    let m;
    if ((m = hash.match(/^#\/line\/([A-Za-z0-9]+)/))) await viewLine(main, m[1]);
    else if (hash.startsWith('#/log')) await viewLog(main);
    else if (hash.startsWith('#/about')) viewAbout(main);
    else if (hash.startsWith('#/trip')) await viewTrip(main);
    else if (hash.startsWith('#/service')||hash.startsWith('#/insights')) await viewService(main);
    else if (hash.startsWith('#/crowding')) await viewPatronage(main, D.meta);
    else if (hash.startsWith('#/stations')) await viewStationPatronage(main, D.meta);
    else if (hash.startsWith('#/trackwork')) await viewTrackwork(main);
    else if (hash.startsWith('#/map')) await viewMap(main);
    else { document.title = 'NSW Rail Disruptions'; viewOverview(main); }
    if (main.dataset.routeId !== routeId) return false;
    if(insightRoute)addInsightsNavigation(main,hash);
    return true;
  } catch (e) {
    // An older route must not overwrite a newer screen with a stale error.
    if (main.dataset.routeId !== routeId) return false;
    console.error(e);
    main.replaceChildren(h('div', { class: 'error-box' }, h('h1', {}, 'Something went wrong'), h('p', {}, e.message), h('p', {}, 'Reload the page to try again.')));
    return false;
  }
}

let lastHashPath = null;
window.addEventListener('hashchange', () => {
  const pathOnly = location.hash.split('?')[0];
  const sameView = lastHashPath === pathOnly;
  lastHashPath = pathOnly;
  // Every real hashchange, including query-only changes and browser Back,
  // must apply its route parameters. In-page filter controls use
  // history.replaceState(), which does NOT dispatch a hashchange event.
  route().then(rendered => {
    if (!rendered) return;
    // Preserve the reader's position for query-only updates; a change of
    // destination should still begin at the top and focus the new page.
    if (!sameView) {
      if (!location.hash.startsWith('#/log')) window.scrollTo(0, 0);
      document.getElementById('main').focus({ preventScroll: true });
    }
  });
});

// ---------- Home Screen app release updates ----------
// Site code is versioned separately from the live timetable and alert data. We never
// reload in the middle of a user's interaction; instead offer an explicit update action.
const SITE_RELEASE_CHECK_MS = 5 * 60_000;
let checkingSiteRelease = false;
let announcedSiteRelease = null;

function showSiteRelease(release) {
  if (announcedSiteRelease === release) return;
  announcedSiteRelease = release;
  const previous = document.getElementById('site-update-notice');
  if (previous) previous.remove();
  const update = h('button', {
    type: 'button', class: 'site-update-button', onclick: () => {
      // A new document URL forces an HTML request outside the old Home Screen
      // app cache. The HTML then loads content-hashed JS and CSS filenames.
      const target = new URL(window.location.href);
      target.searchParams.set('release', release);
      window.location.replace(target.href);
    },
  }, 'Update app');
  const notice = h('aside', { id: 'site-update-notice', class: 'site-update-notice', role: 'status' },
    h('span', {},
      h('strong', {}, 'A newer version of NSW Rail Disruptions is available.'),
      ' Update the app to see the latest features.'),
    update);
  document.querySelector('.site-header')?.after(notice);
}

async function checkSiteRelease() {
  if (document.hidden || checkingSiteRelease) return;
  checkingSiteRelease = true;
  try {
    const response = await fetch('data/site-version.json?check=' + Date.now(), { cache: 'no-store' });
    if (!response.ok) return;
    const manifest = await response.json();
    // Validate the manifest before using its release in a navigation URL.
    if (/^[0-9a-f]{16}$/.test(manifest.release) && manifest.release !== SITE_RELEASE) {
      showSiteRelease(manifest.release);
    }
  } catch {
    // Offline or a deployment in progress: retry later without blocking the site.
  } finally {
    checkingSiteRelease = false;
  }
}

// ---------- live updates ----------
// New data is published about every five minutes. While the page is open and visible, check once a
// minute and redraw the overview (or the trip page results) in place when a newer build is available. Other pages pick up the
// new data the next time they are opened, so a reading position is never lost.
const CHECK_EVERY_MS = 60_000;
let checking = false;
let redrawPending = false;

function isStale() {
  return !!D.status?.alertsAt && Date.now() - ms(D.status.alertsAt) > 45 * 60000;
}
function onOverview() {
  const hash = location.hash || '#/';
  // #/insights is a supported alias of #/service and must never redraw Today
  // when the five-minute collector reports a newer dataset.
  return hash === '#/' || hash === '#' || !/^#\/(line|log|about|trip|service|insights|trackwork|map|crowding|stations)(?:[/?]|$)/.test(hash);
}
function userIsInteracting() {
  const main = document.getElementById('main');
  const active = document.activeElement;
  const tooltipOpen = !document.getElementById('tooltip').hidden;
  return tooltipOpen || (active && active !== main && main.contains(active));
}

function redrawOverview() {
  if (!onOverview()) { redrawPending = false; return; }
  if (userIsInteracting()) { redrawPending = true; return; }
  redrawPending = false;
  const main = document.getElementById('main');
  const y = window.scrollY;
  // Hold the page height while charts redraw so the scroll position doesn't jump.
  main.style.minHeight = `${main.offsetHeight}px`;
  resetView();
  viewOverview(main);
  requestAnimationFrame(() => requestAnimationFrame(() => {
    window.scrollTo(0, y);
    main.style.minHeight = '';
  }));
}

// The trip page refreshes its results; the overview redraws in full; other pages wait.
function liveRedraw() {
  if (pageRefresh) pageRefresh();
  else redrawOverview();
}

async function checkForUpdates() {
  if (checking || document.hidden) return;
  checking = true;
  try {
    const meta = await getJson(`data/meta.json?t=${Date.now()}`);
    if (meta.generatedAt !== D.meta.generatedAt) {
      const [daily, status, delays] = await Promise.all(['daily', 'status', 'delays'].map(n => getJson(`data/${n}.json?t=${Date.now()}`)));
      const clock = await getJson(`data/clock.json?t=${Date.now()}`).catch(() => null);
      attachService(daily);
      Object.assign(D, { meta, daily, status, delays, clock, line: {}, log: {}, service: null, serviceDay: {}, trackwork: null, live: null });
      liveRedraw();
    } else if (redrawPending || (onOverview() && !!document.querySelector('.stale-note') !== isStale())) {
      liveRedraw();
    }
  } catch {
    // Offline or a deploy in progress: try again at the next check.
  } finally {
    checking = false;
  }
}

(async function init() {
  try {
    [D.meta, D.daily, D.status, D.delays] = await Promise.all(['meta', 'daily', 'status', 'delays'].map(n => getJson(`data/${n}.json`)));
    attachService(D.daily);
    D.clock = await getJson('data/clock.json').catch(() => null);
  } catch (e) {
    document.getElementById('main').replaceChildren(h('div', { class: 'error-box' }, h('h1', {}, 'The data could not be loaded'), h('p', {}, e.message),
      h('p', {}, 'If this site was just set up, the first collection run may not have finished yet. Try again in a few minutes.')));
    return;
  }
  lastHashPath = location.hash.split('?')[0];
  route();
  setInterval(checkForUpdates, CHECK_EVERY_MS);
  // Initial visit, resume from Home Screen, and infrequent foreground checks.
  // Routine five-minute data publishes do not trigger an app update prompt.
  checkSiteRelease();
  setInterval(checkSiteRelease, SITE_RELEASE_CHECK_MS);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) { checkForUpdates(); checkSiteRelease(); }
  });
  window.addEventListener('pageshow', () => { if (!document.hidden) checkSiteRelease(); });
})();
