// Small SVG chart kit: calendar heatmap, horizontal bars, columns, line. No dependencies.
const NS = 'http://www.w3.org/2000/svg';

export function el(tag, attrs = {}, children = []) {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) node.setAttribute(k, v);
  for (const c of [].concat(children)) if (c != null) node.append(c);
  return node;
}

export function text(x, y, str, attrs = {}) {
  const t = el('text', { x, y, ...attrs });
  t.textContent = str;
  return t;
}

// Readable text colour on top of a line colour.
export function onColor(hex) {
  const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(x => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
  const L = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  return (1.05) / (L + 0.05) >= 4.5 ? '#ffffff' : '#15202b';
}

// ---------- tooltip ----------
const tip = () => document.getElementById('tooltip');

// rows: [{ value?, label?, muted? }] — all text set with textContent.
export function showTip(rows, clientX, clientY) {
  const t = tip();
  t.replaceChildren();
  for (const r of rows) {
    const d = document.createElement('div');
    if (r.value != null) {
      d.className = 'tt-value';
      d.textContent = r.value;
    } else {
      d.className = r.muted ? 'tt-muted' : '';
      d.textContent = r.label;
    }
    t.append(d);
  }
  t.hidden = false;
  const pad = 14;
  const w = t.offsetWidth, h = t.offsetHeight;
  let x = clientX + pad, y = clientY + pad;
  if (x + w > window.innerWidth - 8) x = clientX - w - pad;
  if (y + h > window.innerHeight - 8) y = clientY - h - pad;
  t.style.left = Math.max(8, x) + 'px';
  t.style.top = Math.max(8, y) + 'px';
}

export function hideTip() {
  const t = tip();
  if (t) t.hidden = true;
}

function anchorTip(node, rows) {
  const r = node.getBoundingClientRect();
  showTip(rows, r.right, r.top);
}

// ---------- calendar heatmap ----------
// opts: { rows: [{ id, color, short, name, href, values: number|null[], total }], columns: [{ label, tip }],
//         ticks: [{ i, label }], fill(v) → css colour, cellTip(row, i) → rows, groups: [{ label, from }] }
export function heatmap(container, opts) {
  const W = Math.max(300, container.clientWidth);
  const narrow = W < 640;
  const labelW = narrow ? 52 : 236;
  const totalW = narrow ? 46 : 64;
  const plotW = W - labelW - totalW - 8;
  const nCol = opts.columns.length;
  const cw = plotW / nCol;
  const rowH = 20, gap = 3, groupGap = 22, top = 4;
  let y = top;
  const layout = [];
  for (let r = 0; r < opts.rows.length; r++) {
    const g = opts.groups.find(gr => gr.from === r);
    if (g) y += r === 0 ? 16 : groupGap;
    layout.push({ y, group: g });
    y += rowH + gap;
  }
  const H = y + 26;
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'img', tabindex: 0,
    'aria-label': opts.ariaLabel || 'Calendar of disruption by line and date' });
  const cellGap = cw >= 4 ? 1 : 0;
  const cells = el('g');
  for (let r = 0; r < opts.rows.length; r++) {
    const row = opts.rows[r], ly = layout[r].y;
    if (layout[r].group) svg.append(text(0, ly - 6, layout[r].group.label, { class: 'group-label' }));
    // Badge + name
    const a = el('a', { href: row.href });
    const bw = narrow ? 44 : 44;
    a.append(el('rect', { x: 0, y: ly, width: bw, height: rowH, rx: 5, fill: row.color }));
    a.append(text(bw / 2, ly + rowH / 2 + 4.5, row.short, { 'text-anchor': 'middle', class: 'cal-label', style: `fill:${onColor(row.color)};font-weight:700;font-family:var(--font-narrow)` }));
    if (!narrow) a.append(text(bw + 8, ly + rowH / 2 + 4.5, truncateText(row.name, 27), { class: 'cal-label cal-label-name' }));
    svg.append(a);
    for (let i = 0; i < nCol; i++) {
      const v = row.values[i];
      cells.append(el('rect', {
        class: 'cell', x: (labelW + i * cw).toFixed(2), y: ly, width: Math.max(0.5, cw - cellGap).toFixed(2), height: rowH,
        fill: opts.fill(v, i, row), 'data-r': r, 'data-i': i,
      }));
    }
    svg.append(text(W, ly + rowH / 2 + 4.5, row.total, { 'text-anchor': 'end', class: 'cal-total' }));
  }
  svg.append(cells);
  // x axis
  const axisY = y + 2;
  svg.append(el('line', { x1: labelW, x2: labelW + plotW, y1: axisY, y2: axisY, class: 'axis-line' }));
  placeTicks(svg, opts.ticks, t => labelW + t.i * cw, 46, (x, t) => el('g', {}, [
    el('line', { x1: x, x2: x, y1: axisY, y2: axisY + 4, class: 'axis-line' }),
    text(x + 2, axisY + 16, t.label, { class: 'axis-text' }),
  ]));
  const focusRect = el('rect', { class: 'cell-focus', width: Math.max(2, cw), height: rowH + 2, visibility: 'hidden', rx: 1 });
  svg.append(focusRect);

  let cur = null;
  const point = (r, i) => {
    cur = { r, i };
    focusRect.setAttribute('x', labelW + i * cw - 0.5);
    focusRect.setAttribute('y', layout[r].y - 1);
    focusRect.setAttribute('width', Math.max(2, cw - cellGap + 1));
    focusRect.setAttribute('visibility', 'visible');
  };
  svg.addEventListener('pointermove', ev => {
    const c = ev.target.closest?.('rect.cell');
    if (!c) { hideTip(); focusRect.setAttribute('visibility', 'hidden'); return; }
    const r = +c.dataset.r, i = +c.dataset.i;
    point(r, i);
    showTip(opts.cellTip(opts.rows[r], i), ev.clientX, ev.clientY);
  });
  svg.addEventListener('pointerleave', () => { hideTip(); focusRect.setAttribute('visibility', 'hidden'); });
  svg.addEventListener('click', ev => {
    const c = ev.target.closest?.('rect.cell');
    if (c && opts.onCell) opts.onCell(opts.rows[+c.dataset.r], +c.dataset.i);
  });
  svg.addEventListener('focus', () => { if (!cur) point(0, nCol - 1); tipAtCur(); });
  svg.addEventListener('blur', () => { hideTip(); focusRect.setAttribute('visibility', 'hidden'); });
  const tipAtCur = () => {
    const rect = cells.querySelector(`rect[data-r="${cur.r}"][data-i="${cur.i}"]`);
    if (rect) anchorTip(rect, opts.cellTip(opts.rows[cur.r], cur.i));
  };
  svg.addEventListener('keydown', ev => {
    if (!cur) return;
    const moves = { ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0], Home: [0, -1e9], End: [0, 1e9] };
    if (ev.key === 'Enter' && opts.onCell) { opts.onCell(opts.rows[cur.r], cur.i); return; }
    const m = moves[ev.key];
    if (!m) return;
    ev.preventDefault();
    point(Math.min(opts.rows.length - 1, Math.max(0, cur.r + m[0])), Math.min(nCol - 1, Math.max(0, cur.i + m[1])));
    tipAtCur();
  });
  container.replaceChildren(svg);
}

function truncateText(s, n) {
  return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s;
}

// ---------- horizontal bars (one series) ----------
// items: [{ label, color?, short?, href?, value, valueLabel, tip }]
export function hbars(container, { items, fillClass = 'mark-heat', badges = false, ariaLabel }) {
  const W = Math.max(280, container.clientWidth);
  const narrow = W < 520;
  const labelW = badges ? (narrow ? 52 : 236) : (narrow ? 150 : 210);
  const valueW = 64;
  const plotW = W - labelW - valueW;
  const barH = 16, rowH = 26;
  const H = items.length * rowH + 6;
  const max = Math.max(1e-9, ...items.map(d => d.value));
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'img', 'aria-label': ariaLabel || '' });
  svg.append(el('line', { x1: labelW, x2: labelW, y1: 0, y2: H - 4, class: 'axis-line' }));
  items.forEach((d, k) => {
    const y = k * rowH + 4;
    if (badges) {
      const a = el('a', { href: d.href });
      a.append(el('rect', { x: 0, y: y + (barH - 20) / 2, width: 44, height: 20, rx: 5, fill: d.color }));
      a.append(text(22, y + barH / 2 + 4.5, d.short, { 'text-anchor': 'middle', class: 'cal-label', style: `fill:${onColor(d.color)};font-weight:700;font-family:var(--font-narrow)` }));
      if (!narrow) a.append(text(52, y + barH / 2 + 4.5, truncateText(d.label, 27), { class: 'bar-label', style: 'fill:var(--ink-2)' }));
      svg.append(a);
    } else {
      svg.append(text(0, y + barH / 2 + 4.5, truncateText(d.label, narrow ? 20 : 30), { class: 'bar-label' }));
    }
    const w = d.value > 0 ? Math.max(2, (plotW - 4) * (d.value / max)) : 0;
    if (w > 0) svg.append(el('path', { d: roundedBarH(labelW, y, w, barH, 4), class: fillClass }));
    svg.append(text(labelW + w + 6, y + barH / 2 + 4.5, d.valueLabel, { class: 'bar-value' }));
    const hit = el('rect', { x: 0, y: y - 4, width: W, height: rowH, class: 'hit', tabindex: -1 });
    hit.addEventListener('pointermove', ev => showTip(d.tip, ev.clientX, ev.clientY));
    hit.addEventListener('pointerleave', hideTip);
    svg.append(hit);
  });
  container.replaceChildren(svg);
}

function roundedBarH(x, y, w, h, r) {
  r = Math.min(r, w, h / 2);
  return `M${x},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h - r}Q${x + w},${y + h} ${x + w - r},${y + h}H${x}Z`;
}

function roundedBarV(x, y, w, h, r, base) {
  r = Math.min(r, w / 2, h);
  return `M${x},${base}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${base}Z`;
}

function niceMax(v) {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 2, 2.5, 5, 10]) if (v <= m * p) return m * p;
  return 10 * p;
}

export function compact(v) {
  if (v >= 10000) return Math.round(v / 1000) + 'K';
  if (v >= 1000) return (v / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
  return String(Math.round(v * 10) / 10);
}

// ---------- columns (one series) ----------
// items: [{ label, value, tip }], ticks: [{ i, label }]
export function columns(container, { items, ticks, fillClass = 'mark-heat', yUnit = '', ariaLabel, height = 190 }) {
  const W = Math.max(280, container.clientWidth);
  const left = 40, bottom = 24, topPad = 8;
  const plotW = W - left - 4, plotH = height - bottom - topPad;
  const max = niceMax(Math.max(0, ...items.map(d => d.value || 0)));
  const svg = el('svg', { viewBox: `0 0 ${W} ${height}`, width: W, height, role: 'img', 'aria-label': ariaLabel || '' });
  for (const f of [0, 0.5, 1]) {
    const y = topPad + plotH * (1 - f);
    svg.append(el('line', { x1: left, x2: W, y1: y, y2: y, class: f === 0 ? 'axis-line' : 'grid-line' }));
    svg.append(text(left - 6, y + 4, compact(max * f) + (f === 1 ? yUnit : ''), { 'text-anchor': 'end', class: 'axis-text' }));
  }
  const n = items.length;
  const band = plotW / n;
  const bw = Math.min(24, Math.max(1, band - (band > 6 ? 2 : 0.5)));
  const base = topPad + plotH;
  const bars = el('g');
  items.forEach((d, i) => {
    const v = d.value || 0;
    const h = (plotH * v) / max;
    const x = left + i * band + (band - bw) / 2;
    if (h > 0) bars.append(el('path', { d: roundedBarV(x, base - Math.max(h, 1), bw, Math.max(h, 1), bw >= 8 ? 4 : 1, base), class: fillClass }));
    const hit = el('rect', { x: left + i * band, y: topPad, width: band, height: plotH, class: 'hit' });
    hit.addEventListener('pointermove', ev => showTip(d.tip, ev.clientX, ev.clientY));
    hit.addEventListener('pointerleave', hideTip);
    bars.append(hit);
  });
  svg.append(bars);
  placeTicks(svg, ticks || [], t => left + t.i * band + band / 2, 44, (x, t) => text(x, height - 6, t.label, { 'text-anchor': 'middle', class: 'axis-text' }));
  container.replaceChildren(svg);
}

// Axis labels: skip any that would crowd the previous one, but a year label (major) replaces a crowded month label.
function placeTicks(svg, ticks, xOf, minGap, draw) {
  let last = null;
  for (const t of ticks) {
    const x = xOf(t);
    if (last && x - last.x < minGap) {
      if (t.major && !last.major) { last.node.remove(); } else continue;
    }
    const node = draw(x, t);
    svg.append(node);
    last = { x, node, major: !!t.major };
  }
}

// ---------- line (one series, gaps where value is null) ----------
export function line(container, { points, ticks, yFormat = v => String(v), ariaLabel, height = 190, tipFor }) {
  const W = Math.max(280, container.clientWidth);
  const left = 44, bottom = 24, topPad = 10;
  const plotW = W - left - 8, plotH = height - bottom - topPad;
  const vals = points.map(p => p.y).filter(v => v != null);
  const max = niceMax(Math.max(0, ...vals));
  const svg = el('svg', { viewBox: `0 0 ${W} ${height}`, width: W, height, role: 'img', 'aria-label': ariaLabel || '' });
  for (const f of [0, 0.5, 1]) {
    const y = topPad + plotH * (1 - f);
    svg.append(el('line', { x1: left, x2: W, y1: y, y2: y, class: f === 0 ? 'axis-line' : 'grid-line' }));
    svg.append(text(left - 6, y + 4, yFormat(max * f), { 'text-anchor': 'end', class: 'axis-text' }));
  }
  const n = points.length;
  const xAt = i => left + (n === 1 ? plotW / 2 : (plotW * i) / (n - 1));
  const yAt = v => topPad + plotH * (1 - v / max);
  let d = '', pen = false;
  points.forEach((p, i) => {
    if (p.y == null) { pen = false; return; }
    d += `${pen ? 'L' : 'M'}${xAt(i).toFixed(1)},${yAt(p.y).toFixed(1)}`;
    pen = true;
  });
  svg.append(el('path', { d, class: 'mark-line' }));
  const lastI = points.map(p => p.y != null).lastIndexOf(true);
  if (lastI >= 0) svg.append(el('circle', { cx: xAt(lastI), cy: yAt(points[lastI].y), r: 4, class: 'mark-dot' }));
  let lastX = -999;
  for (const t of ticks || []) {
    const x = xAt(t.i);
    if (x - lastX < 50) continue;
    lastX = x;
    svg.append(text(x, height - 6, t.label, { 'text-anchor': 'middle', class: 'axis-text' }));
  }
  const cross = el('line', { y1: topPad, y2: topPad + plotH, class: 'crosshair', visibility: 'hidden' });
  const dot = el('circle', { r: 4, class: 'mark-dot', visibility: 'hidden' });
  svg.append(cross, dot);
  const overlay = el('rect', { x: left, y: topPad, width: plotW, height: plotH, class: 'hit' });
  overlay.addEventListener('pointermove', ev => {
    const box = svg.getBoundingClientRect();
    const sx = ((ev.clientX - box.left) / box.width) * W;
    const i = Math.max(0, Math.min(n - 1, Math.round(((sx - left) / plotW) * (n - 1))));
    cross.setAttribute('x1', xAt(i)); cross.setAttribute('x2', xAt(i)); cross.setAttribute('visibility', 'visible');
    if (points[i].y != null) { dot.setAttribute('cx', xAt(i)); dot.setAttribute('cy', yAt(points[i].y)); dot.setAttribute('visibility', 'visible'); }
    else dot.setAttribute('visibility', 'hidden');
    showTip(tipFor(points[i]), ev.clientX, ev.clientY);
  });
  overlay.addEventListener('pointerleave', () => { hideTip(); cross.setAttribute('visibility', 'hidden'); dot.setAttribute('visibility', 'hidden'); });
  svg.append(overlay);
  container.replaceChildren(svg);
}
