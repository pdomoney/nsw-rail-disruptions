// Interactive comparison of observed carriage occupancy across rail lines and Sydney-local hours.
// No passenger-count claims: GTFS vehicle occupancy is not Opal entry/exit patronage.

function addDays(date, n) {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

// Pure presentation rollup, also covered by node tests. A snapshot is one equal-weight observation
// of the distribution of reported carriages on a line. Missing reports stay null, not zero.
export function summariseHotspots(data, { days = 7, dayType = 'weekday' } = {}) {
  const result = {};
  if (!data?.end || !data?.lines) return result;
  const start = addDays(data.end, 1 - days);
  for (const [id, dates] of Object.entries(data.lines)) {
    const bins = Array.from({ length: 24 }, () => [0, 0, 0, 0, 0, 0, new Set()]);
    for (const [date, slots] of Object.entries(dates)) {
      if (date < start || date > data.end) continue;
      const day = new Date(date + 'T12:00:00Z').getUTCDay();
      const weekend = day === 0 || day === 6;
      if (dayType === 'weekday' && weekend || dayType === 'weekend' && !weekend) continue;
      for (const [key, record] of Object.entries(slots)) {
        const hour = Number(key);
        if (!Number.isInteger(hour) || hour < 0 || hour > 23 || !Array.isArray(record)) continue;
        const b = bins[hour];
        for (let i = 0; i < 6; i++) b[i] += Number(record[i]) || 0;
        if (record[0] > 0) b[6].add(date);
      }
    }
    result[id] = bins.map(([n, level, standing, cars, running, withOcc, dates]) => n > 0 ? ({
      snapshots: n,
      index: level / (1000 * n), standing: standing / (1000 * n),
      carriages: cars, running, withOcc, days: dates.size,
    }) : null);
  }
  return result;
}

const fmt = v => Number(v).toLocaleString('en-AU');
const ratio = v => Math.round(v * 100) + '%';
const indexLabel = v => v.toFixed(1);
const hourLabel = i => String(i).padStart(2, '0') + ':00';
const lineName = line => /^[TM]\d/.test(line.id) ? line.id + ' ' + line.name : line.name;

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null) continue;
    if (key === 'class') node.className = value;
    else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, String(value));
  }
  for (const child of children.flat(Infinity)) {
    if (child == null) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

function control(label, values, selected, update) {
  const input = el('select', { 'aria-label': label });
  values.forEach(([key, title]) => input.append(el('option', { value: key }, title)));
  input.value = selected;
  input.addEventListener('change', () => update(input.value));
  return el('label', { class: 'pat-control' }, el('span', {}, label), input);
}

function resultValue(cell, metric) {
  if (!cell) return null;
  return metric === 'standing' ? cell.standing : cell.index;
}

export async function viewPatronage(main, meta) {
  document.title = 'Crowding hotspots · NSW Rail Disruptions';
  main.replaceChildren(el('p', { class: 'loading', role: 'status' }, 'Loading crowding observations…'));
  let data;
  try {
    const response = await fetch('data/crowding.json', { cache: 'no-cache' });
    if (!response.ok) throw new Error('Crowding data is not published yet');
    data = await response.json();
  } catch {
    main.replaceChildren(el('section', { class: 'pat-empty' }, el('h1', {}, 'Crowding hotspots'),
      el('p', {}, 'No occupancy summary is published yet. It will appear after the next successful collection and build.'),
      el('a', { href: '#/' }, 'Return to overview')));
    return;
  }

  const modes = new Set(['train', 'metro', 'intercity']);
  const rail = meta.lines.filter(l => modes.has(l.mode));
  const byId = new Map(rail.map(l => [l.id, l]));
  const filters = { period: '7', type: 'weekday', metric: 'index', mode: 'all', line: null, hour: null };
  const header = el('header', { class: 'pat-head' },
    el('p', { class: 'pat-eyebrow' }, 'Rail network / occupancy patterns'),
    el('h1', {}, 'Crowding hotspots'),
    el('p', { class: 'pat-intro' },
      'See which train and metro lines report the busiest carriages, and when. Each cell is the average of available occupancy observations for that hour in Sydney time.'),
    el('p', { class: 'pat-caution' },
      el('strong', {}, 'Not station patronage. '),
      'These are carriage occupancy levels (0 empty to 5 full), not Opal tap counts, station entries, or passenger totals. Sydney Trains data can be predicted while Metro can be measured.'));
  const controls = el('div', { class: 'pat-controls' });
  const output = el('div', { class: 'pat-output' });
  const source = el('section', { class: 'pat-method' },
    el('h2', {}, 'What this measures'),
    el('p', {}, 'The transport feed reports carriages as empty, many seats available, few seats available, standing room, crowded or full. The occupancy index averages these levels (0–5) across reporting carriages at each snapshot, then averages snapshots within the chosen hour. The standing-or-higher percentage represents carriages at levels 3–5. Each snapshot has equal weight.'),
    el('p', {}, 'A blank cell means there were no valid carriage-level observations, not that no passengers were travelling. Only reporting carriages are counted; train-only measurements are excluded so the units are consistent. Coverage varies by line, time and feed. Occupancy may be forecast rather than measured.'),
    el('p', {}, 'A true station hotspot view will require historical or new Opal entries and exits, with station and time-of-day detail. See ',
      el('a', { href: 'https://opendata.transport.nsw.gov.au/data/dataset/train-station-entries-and-exits-data', target: '_blank', rel: 'noopener noreferrer' }, 'station entries and exits'),
      ' and ',
      el('a', { href: 'https://opendata.transport.nsw.gov.au/dataset/opal-patronage', target: '_blank', rel: 'noopener noreferrer' }, 'Opal Tap Data'),
      ' from Transport for NSW.'));
  main.replaceChildren(header, controls, output, source);

  function selectLine(id, hour) {
    filters.line = id;
    filters.hour = hour;
    paint();
  }

  function makeControls() {
    controls.replaceChildren(
      control('Period', [['7', 'Last 7 days'], ['30', 'Last 30 days']], filters.period, v => { filters.period = v; paint(); }),
      control('Days', [['weekday', 'Weekdays'], ['weekend', 'Weekends'], ['all', 'All days']], filters.type, v => { filters.type = v; paint(); }),
      control('Mode', [['all', 'Trains + Metro + Intercity'], ['train', 'Sydney Trains'], ['metro', 'Sydney Metro'], ['intercity', 'Intercity']], filters.mode, v => { filters.mode = v; paint(); }),
      control('Measure', [['index', 'Occupancy index (0–5)'], ['standing', 'Standing or fuller (%)']], filters.metric, v => { filters.metric = v; paint(); }));
  }
  makeControls();

  function paint() {
    const results = summariseHotspots(data, { days: Number(filters.period), dayType: filters.type });
    const visible = rail.filter(l => (filters.mode === 'all' || l.mode === filters.mode));
    const cells = visible.map(l => ({
      line: l,
      values: results[l.id] || Array(24).fill(null),
    }));
    const score = c => resultValue(c, filters.metric);
    const ranked = cells.map(row => ({
      ...row,
      peak: row.values.map((cell, hour) => ({ cell, hour }))
        .filter(p => p.cell?.snapshots >= 3)
        .sort((a, b) => score(b.cell) - score(a.cell))[0] || null,
    })).sort((a, b) => (score(b.peak?.cell) ?? -1) - (score(a.peak?.cell) ?? -1));
    const hotspots = ranked.flatMap(row => row.values.map((cell, hour) => ({ line: row.line, cell, hour })))
      .filter(p => p.cell?.snapshots >= 3)
      .sort((a, b) => score(b.cell) - score(a.cell));
    const count = hotspots.reduce((s, x) => s + x.cell.snapshots, 0);
    const daysName = filters.type === 'weekday' ? 'weekdays' : filters.type === 'weekend' ? 'weekends' : 'all days';
    const metricName = filters.metric === 'standing' ? 'carriages standing or fuller' : 'average carriage occupancy index';
    const shortValue = c => filters.metric === 'standing' ? ratio(c.standing) : indexLabel(c.index);
    const from = addDays(data.end, 1 - Number(filters.period));

    const summary = el('div', { class: 'pat-summary' },
      el('div', { class: 'pat-stat' }, el('span', {}, 'Period'), el('strong', {}, from + ' to ' + data.end)),
      el('div', { class: 'pat-stat' }, el('span', {}, 'Observed line/hour cells'), el('strong', {}, fmt(hotspots.length))),
      el('div', { class: 'pat-stat' }, el('span', {}, 'Leading hour'), el('strong', {},
        hotspots.length ? hotspots[0].line.id + ' · ' + hourLabel(hotspots[0].hour) : 'No supported observations')),
      el('div', { class: 'pat-stat' }, el('span', {}, 'Data rebuilt'), el('strong', {},
        data.generatedAt ? new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Sydney', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(data.generatedAt)) : 'Unknown')));

    const title = el('div', { class: 'pat-titlebar' },
      el('div', {}, el('h2', {}, 'Line × hour'), el('p', { class: 'muted' },
        metricName + ', ' + daysName + '. Busiest hourly readings first. Cells with fewer than three observations are marked as limited.')),
      el('div', { class: 'pat-legend', 'aria-label': 'Heat increases with reported carriage occupancy' },
        el('span', {}, 'Lower'), ...[12, 24, 36, 48, 60].map(v => el('span', { class: 'pat-swatch', style: '--hotpct:' + v + '%' })), el('span', {}, 'Higher')));

    const table = el('table', { class: 'pat-table' });
    const heading = el('tr', {}, el('th', { scope: 'col', class: 'pat-line-col' }, 'Line'));
    for (let hour = 0; hour < 24; hour++) heading.append(el('th', { scope: 'col' }, String(hour).padStart(2, '0')));
    table.append(el('thead', {}, heading));
    const body = el('tbody');
    for (const row of ranked) {
      const tr = el('tr', { class: row.line.id === filters.line ? 'pat-row-selected' : '' });
      tr.append(el('th', { scope: 'row', class: 'pat-line-col' },
        el('a', { href: '#/line/' + row.line.id },
          el('span', { class: 'pat-line-mark', style: 'background:' + row.line.color, 'aria-hidden': 'true' }),
          row.line.id + ' ' + row.line.name)));
      for (let hour = 0; hour < 24; hour++) {
        const cell = row.values[hour];
        if (!cell) { tr.append(el('td', { class: 'pat-missing', title: 'No carriage-level occupancy observations' }, '·')); continue; }
        const val = score(cell);
        const fraction = filters.metric === 'standing' ? val : val / 5;
        const shade = Math.round(Math.max(0, Math.min(0.65, fraction * 0.65)) * 100);
        const detail = lineName(row.line) + ', ' + hourLabel(hour) + ' Sydney time: ' +
          indexLabel(cell.index) + '/5 occupancy; ' + ratio(cell.standing) + ' standing or fuller; ' +
          fmt(cell.snapshots) + ' snapshots, ' + fmt(cell.carriages) + ' reporting carriage observations over ' +
          fmt(cell.days) + ' days.';
        tr.append(el('td', {}, el('button', {
          type: 'button', class: 'pat-cell' + (cell.snapshots < 3 ? ' pat-limited' : ''),
          style: '--hotpct:' + shade + '%',
          title: detail, 'aria-label': detail, 'aria-pressed': String(filters.line === row.line.id && filters.hour === hour),
          onclick: () => selectLine(row.line.id, hour),
        }, shortValue(cell))));
      }
      body.append(tr);
    }
    table.append(body);
    const matrix = el('section', { class: 'pat-matrix', 'aria-label': 'Hourly crowding comparison' },
      title, el('div', { class: 'pat-table-scroll', tabindex: '0', 'aria-label': 'Scroll to see all 24 hours' }, table));

    const top = el('section', { class: 'pat-top' }, el('h2', {}, 'Busiest observed windows'),
      el('p', { class: 'muted' }, 'Highest recorded average occupancy among hours with at least three snapshots. Not a station ranking.'));
    if (!hotspots.length) top.append(el('p', {}, 'Not enough carriage-level observations for this period and day type.'));
    else {
      const list = el('ol', { class: 'pat-top-list' });
      hotspots.slice(0, 8).forEach(p => list.append(el('li', {},
        el('button', { type: 'button', onclick: () => selectLine(p.line.id, p.hour) },
          el('span', { class: 'pat-top-line' }, p.line.id + ' ' + p.line.name),
          el('span', {}, hourLabel(p.hour)),
          el('strong', {}, shortValue(p.cell)),
          el('small', {}, fmt(p.cell.snapshots) + ' snapshots')))));
      top.append(list);
    }

    const chosen = (filters.line && byId.has(filters.line) && (!filters.mode || filters.mode === 'all' || byId.get(filters.line).mode === filters.mode))
      ? filters.line : hotspots[0]?.line.id;
    const detail = el('section', { class: 'pat-detail' }, el('h2', {}, chosen ? lineName(byId.get(chosen)) + ' hourly profile' : 'Line profile'));
    if (chosen) {
      const values = results[chosen] || Array(24).fill(null);
      const active = filters.hour == null ? (hotspots.find(p => p.line.id === chosen)?.hour ?? 8) : filters.hour;
      const c = values[active];
      detail.append(el('p', { class: 'muted' },
        'Selected hour: ' + hourLabel(active) + '–' + String(active).padStart(2, '0') + ':59 Sydney time. ' +
        (c ? indexLabel(c.index) + '/5 average, ' + ratio(c.standing) + ' standing or fuller, ' +
          fmt(c.snapshots) + ' snapshots from ' + fmt(c.days) + ' days.' : 'No reported carriage-level data.')));
      const bars = el('div', { class: 'pat-bars', 'aria-label': '24 hour occupancy profile' });
      values.forEach((point, hour) => {
        const v = score(point);
        const frac = v == null ? 0 : filters.metric === 'standing' ? v : v / 5;
        const value = point ? shortValue(point) : 'No data';
        bars.append(el('button', { type: 'button',
          class: 'pat-bar-item' + (hour === active ? ' active' : ''),
          title: hourLabel(hour) + ': ' + value + (point ? ', ' + fmt(point.snapshots) + ' snapshots' : ''),
          'aria-label': hourLabel(hour) + ' ' + value, 'aria-pressed': String(hour === active),
          onclick: () => selectLine(chosen, hour) },
          el('span', { class: 'pat-bar-fill', style: '--barheight:' + Math.round(frac * 100) + '%' }),
          el('span', { class: 'pat-bar-hour' }, String(hour).padStart(2, '0'))));
      });
      detail.append(bars);
    } else detail.append(el('p', {}, 'No data for the selected rail services.'));

    output.replaceChildren(summary, matrix, el('div', { class: 'pat-lower' }, top, detail));
  }
  paint();
}
