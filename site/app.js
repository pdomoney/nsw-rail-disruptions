import { heatmap, hbars, columns, line as lineChart, onColor, hideTip, compact } from './charts.js';

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
const D = { meta: null, daily: null, status: null, delays: null, line: {}, log: {} };
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
  cancelled: {
    label: 'Cancelled trips', ramp: HEAT, bins: [2, 5, 10, 20, 40], legend: 'Trip cancellation alerts per day',
    tickLabels: ['1', '2–4', '5–9', '10–19', '20–39', '40+'],
    day: (L, i) => L.can[i], total: (L, a, b) => sum(L.can, a, b), totalLabel: v => compact(v), from: () => D.daily.tripStart ?? 0,
    tip: (L, c) => [plural(sum(L.can, c.a, c.b), 'cancellation alert'), plural(sum(L.late, c.a, c.b), 'running-late alert')],
  },
};
function sum(arr, a, b) { let s = 0; for (let i = a; i <= b; i++) s += arr[i] || 0; return s; }
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

function disruptionItem({ inc, lines }) {
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
      cause ? h('span', { class: 'muted' }, `Cause: ${cause}`) : null),
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
    disrupted.forEach((l, i) => {
      if (i > 0) head.append(i === disrupted.length - 1 ? ' and ' : ', ');
      head.append(badge(l.id));
    });
    head.append(' right now.');
  }
  const checked = status.alertsAt
    ? `Alerts checked at ${time(status.alertsAt)} on ${F.dayShort.format(new Date(ms(status.alertsAt)))}. This page updates itself every few minutes.`
    : 'Alerts have not been checked yet.';
  const sub = h('p', { class: 'now-sub' },
    plannedToday.length ? `Planned trackwork or closures affect ${plural(plannedToday.length, 'line')} today. ` : 'No planned closures today. ',
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

  main.replaceChildren(
    h('section', { class: 'now', 'aria-labelledby': 'now-h' }, Object.assign(head, { id: 'now-h' }), sub, stale, nowAlerts()),
    board,
    calendarSection(),
    rankingSection(),
  );
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
        for (let i = Math.max(c.a, firstDay); i <= c.b; i++) if (D.daily.coverage[i] > 0) { s += m.day(L, i); n++; }
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
        if (row.values[i] == null) return [...head, { label: m.from && c.b < m.from() ? 'TfNSW did not publish trip alerts this early' : 'No data was collected for this period' }];
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
      (metric === 'planned' ? ' Days with at least one planned closure.' : metric === 'unplanned' ? ' Hours with at least one unplanned disruption alert.' : ' Alerts about individual cancelled trips.');
    const items = D.meta.lines.map(l => {
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
  const l = lineInfo(id);
  if (!D.meta.lines.some(x => x.id === id)) { notFound(main, `There is no line called “${id}”.`); return; }
  document.title = `${fullName(l)} | NSW Rail Disruptions`;
  const data = D.line[id] || (D.line[id] = await getJson(`data/line/${id}.json`));
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

  mount(main,
    h('div', { class: 'line-head' }, badge(id, { link: false, size: 'lg' }), h('div', {}, h('h1', {}, l.name), h('div', { class: 'line-mode' }, D.meta.modes[l.mode]?.label || ''))),
    l.note ? h('p', { class: 'line-note' }, l.note) : null,
    h('section', { 'aria-labelledby': 'ln-now' }, h('h2', { id: 'ln-now', style: { marginTop: '18px', fontSize: '1.25rem' } }, 'Right now'), nowList),
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
  document.title = 'Alert log | NSW Rail Disruptions';
  const years = [...D.meta.logYears].reverse();
  const q = new URLSearchParams(location.hash.split('?')[1] || '');
  const f = { line: q.get('line') || '', kind: q.get('kind') || 'incident', cause: q.get('cause') || '', year: q.get('year') || years[0] || '', text: q.get('q') || '' };
  const listHolder = h('div');
  const countLine = h('p', { class: 'count-line', role: 'status' });
  const sel = (label, key, options) => h('label', { class: 'field' }, label,
    h('select', { onchange: ev => { f[key] = ev.target.value; update(); } }, options.map(([v, t]) => { const o = h('option', { value: v }, t); if (v === f[key]) o.selected = true; return o; })));
  const search = h('input', { type: 'search', placeholder: 'Station, cause or any word', value: f.text, oninput: ev => { f.text = ev.target.value; clearTimeout(search._t); search._t = setTimeout(update, 200); } });
  main.replaceChildren(
    h('div', { class: 'line-head' }, h('h1', {}, 'Alert log')),
    h('p', { class: 'section-intro' }, 'Every train, metro and light rail alert recorded since July 2023, as published by Transport for NSW. Times are when the alert was first and last seen in the feed.'),
    h('div', { class: 'filters' },
      sel('Line', 'line', [['', 'All lines'], ...D.meta.lines.map(l => [l.id, fullName(l)])]),
      sel('Type', 'kind', [['incident', 'Unplanned'], ['planned', 'Planned'], ['advisory', 'Advisory'], ['', 'All types']]),
      sel('Cause', 'cause', [['', 'Any cause'], ...Object.entries(D.meta.causes)]),
      sel('Year', 'year', years.map(y => [y, y])),
      h('label', { class: 'field' }, 'Search', search)),
    countLine, listHolder);

  async function update() {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ line: f.line, kind: f.kind, cause: f.cause, year: f.year, q: f.text })) if (v) p.set(k, v);
    history.replaceState(null, '', `#/log?${p}`);
    if (!f.year) { countLine.textContent = 'No alerts have been recorded yet.'; return; }
    listHolder.style.opacity = '0.5';
    const list = D.log[f.year] || (D.log[f.year] = await getJson(`data/log/${f.year}.json`));
    const needle = f.text.trim().toLowerCase();
    const rows = list.filter(e => (!f.line || e.l.includes(f.line)) && (!f.kind || e.k === f.kind) && (!f.cause || e.c === f.cause) &&
      (!needle || `${e.t} ${e.x}`.toLowerCase().includes(needle)));
    countLine.textContent = `${plural(rows.length, 'alert')} in ${f.year}, newest first.`;
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
      h('li', {}, h('strong', {}, 'Delays. '), 'The job also reads the GTFS-realtime trip updates for Sydney Trains, Metro and the four light rail networks, works out how far behind the timetable each running service is, and stores an average per line. This only exists from the day collection started.')),
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

function notFound(main, msg) {
  main.replaceChildren(h('div', { class: 'error-box' }, h('h1', {}, 'Page not found'), h('p', {}, msg), h('p', {}, h('a', { href: '#/' }, 'Go to the overview'))));
}

// ---------- router ----------
function resetView() {
  hideTip();
  resizeHandlers = [];
  viewAbort.abort();
  viewAbort = new AbortController();
}

async function route() {
  resetView();
  const main = document.getElementById('main');
  const hash = location.hash || '#/';
  const navKey = hash.startsWith('#/log') ? 'log' : hash.startsWith('#/about') ? 'about' : hash.startsWith('#/line') ? '' : 'overview';
  document.querySelectorAll('[data-nav]').forEach(a => { if (a.dataset.nav === navKey) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  try {
    let m;
    if ((m = hash.match(/^#\/line\/([A-Za-z0-9]+)/))) await viewLine(main, m[1]);
    else if (hash.startsWith('#/log')) await viewLog(main);
    else if (hash.startsWith('#/about')) viewAbout(main);
    else { document.title = 'NSW Rail Disruptions'; viewOverview(main); }
  } catch (e) {
    console.error(e);
    main.replaceChildren(h('div', { class: 'error-box' }, h('h1', {}, 'Something went wrong'), h('p', {}, e.message), h('p', {}, 'Reload the page to try again.')));
  }
}

let lastHashPath = null;
window.addEventListener('hashchange', () => {
  const pathOnly = location.hash.split('?')[0];
  // Filter changes on the log page update the query string without re-rendering.
  if (pathOnly === '#/log' && lastHashPath === '#/log') return;
  lastHashPath = pathOnly;
  route().then(() => { if (!location.hash.startsWith('#/log')) window.scrollTo(0, 0); document.getElementById('main').focus({ preventScroll: true }); });
});

// ---------- live updates ----------
// New data is published about every five minutes. While the page is open and visible, check once a
// minute and redraw the overview in place when a newer build is available. Other pages pick up the
// new data the next time they are opened, so a reading position is never lost.
const CHECK_EVERY_MS = 60_000;
let checking = false;
let redrawPending = false;

function isStale() {
  return !!D.status?.alertsAt && Date.now() - ms(D.status.alertsAt) > 45 * 60000;
}
function onOverview() {
  const hash = location.hash || '#/';
  return hash === '#/' || hash === '#' || !/^#\/(line|log|about)/.test(hash);
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

async function checkForUpdates() {
  if (checking || document.hidden) return;
  checking = true;
  try {
    const meta = await getJson(`data/meta.json?t=${Date.now()}`);
    if (meta.generatedAt !== D.meta.generatedAt) {
      const [daily, status, delays] = await Promise.all(['daily', 'status', 'delays'].map(n => getJson(`data/${n}.json?t=${Date.now()}`)));
      Object.assign(D, { meta, daily, status, delays, line: {}, log: {} });
      redrawOverview();
    } else if (redrawPending || (onOverview() && !!document.querySelector('.stale-note') !== isStale())) {
      redrawOverview();
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
  } catch (e) {
    document.getElementById('main').replaceChildren(h('div', { class: 'error-box' }, h('h1', {}, 'The data could not be loaded'), h('p', {}, e.message),
      h('p', {}, 'If this site was just set up, the first collection run may not have finished yet. Try again in a few minutes.')));
    return;
  }
  lastHashPath = location.hash.split('?')[0];
  route();
  setInterval(checkForUpdates, CHECK_EVERY_MS);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) checkForUpdates(); });
})();
