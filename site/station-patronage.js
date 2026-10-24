// Station-level Opal entry and exit comparisons.
// Historical sampled typical-day hourly data and recent monthly totals are separate datasets.
// A station served by several lines is filtered into those views but never counted once per line.
const integerFormat = new Intl.NumberFormat('en-AU', { maximumFractionDigits: 0 });
const number = n => integerFormat.format(n);
const sourceData = 'https://opendata.transport.nsw.gov.au/dataset/train-station-entries-and-exits-data';
const railMode = new Set(['train', 'metro', 'intercity']);

// The source record's latest month is the only supported freshness claim.
// CKAN's catalogue 'last updated' date is not a passenger-count month.
export function recentMonthlyStatus(data) {
  const months = [...(data?.coverage?.months || [])].sort();
  const latestMonth = months.at(-1) || null;
  if (!latestMonth) {
    return {
      hasRecent: false,
      latestMonth: null,
      title: 'Recent monthly station patronage not connected',
      details: 'Historical Opal station data ends in October 2024. TfNSW monthly entries and exits from November 2024 onward require the separate authenticated CKAN refresh.',
    };
  }
  const imported = data?.recentImportAt && !Number.isNaN(Date.parse(data.recentImportAt))
    ? new Date(data.recentImportAt).toLocaleString('en-AU', {
      timeZone: 'Australia/Sydney', year: 'numeric', month: 'short',
      day: 'numeric', hour: 'numeric', minute: '2-digit',
    }) : null;
  return {
    hasRecent: true,
    latestMonth,
    title: 'Latest published Opal month: ' + latestMonth,
    details: imported ? 'Last successful import: ' + imported + ' Sydney time. Monthly station counts are historical, not live.'
      : 'Monthly station counts are historical, not live.',
  };
}

export function patronageRows(data, stations, {
  period = 'typical', year = '2023', day = 'weekday', hour = '8',
  month = '', sample = '2023', window = '06-10', metric = 'entries', line = 'all', search = '',
} = {}) {
  const rows = [];
  const hourly = period === 'typical', sampled = period === 'windows';
  const source = hourly ? (data?.typical?.[year]?.[day] || {})
    : sampled ? (data?.periods?.[sample] || {})
    : period === 'historical' ? (data?.legacyMonthly?.[month] || {}) : (data?.monthly?.[month] || {});
  const term = search.trim().toLowerCase();
  for (const [id, name, allLines] of stations || []) {
    if (!Array.isArray(allLines)) continue;
    if (line !== 'all' && !allLines.includes(line)) continue;
    if (term && !name.toLowerCase().includes(term)) continue;
    const values = source[id];
    if (!values) continue;
    let entries, exits, hours = null;
    if (hourly) {
      const slots = Object.entries(values)
        .filter(([h]) => hour === 'all' || String(Number(h)) === String(Number(hour)));
      if (!slots.length) continue;
      hours = slots.length;
      entries = slots.reduce((a, [, v]) => a + v[0], 0);
      exits = slots.reduce((a, [, v]) => a + v[1], 0);
    } else if (sampled) {
      const available = values[window === 'all' ? '24h' : window];
      if(!available)continue;
      [entries,exits]=available;hours=1;
    } else {
      [entries, exits] = values;
    }
    if (!Number.isFinite(entries) || !Number.isFinite(exits)) continue;
    rows.push({ id, name, lines: allLines, entries, exits, hours,
      value: metric === 'exits' ? exits : metric === 'total' ? entries + exits : entries });
  }
  return rows.sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
}

const node = (tag, attrs = {}, ...children) => {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null) continue;
    if (key === 'class') el.className = value;
    else if (key.startsWith('on')) el.addEventListener(key.slice(2), value);
    else el.setAttribute(key, String(value));
  }
  for (const c of children.flat(Infinity)) {
    if (c == null) continue;
    el.append(c instanceof Node ? c : String(c));
  }
  return el;
};

function field(label, options, value, onChange) {
  const sel = node('select', { 'aria-label': label });
  for (const [id, text] of options) sel.append(node('option', { value: id }, text));
  sel.value = value;
  sel.addEventListener('change', () => onChange(sel.value));
  return node('label', { class: 'sp-field' }, node('span', {}, label), sel);
}

function cardValue(label, value, desc) {
  return node('div', { class: 'sp-kpi' },
    node('span', {}, label), node('strong', {}, value), desc ? node('small', {}, desc) : null);
}

export async function viewStationPatronage(main, meta, { refresh = false } = {}) {
  document.title = 'Station patronage · NSW Rail Disruptions';
  main.replaceChildren(node('p', { class: 'loading', role: 'status' }, 'Loading station catalogue and Opal data…'));
  let data, stations;
  try {
    // A source import can deploy while this view remains open. A manual
    // refresh adds a unique query string to escape intermediary 404/no-data
    // caching, including some installed Safari Home Screen sessions.
    const suffix = refresh ? '?refresh=' + Date.now() : '';
    const [a, b] = await Promise.all([
      fetch('data/station-patronage.json' + suffix, { cache: refresh ? 'no-store' : 'no-cache' }),
      fetch('data/stations.json' + suffix, { cache: refresh ? 'no-store' : 'no-cache' }),
    ]);
    if (!a.ok || !b.ok) throw new Error('Data files are not available yet');
    [data, stations] = await Promise.all([a.json(), b.json()]);
  } catch (e) {
    main.replaceChildren(node('section', { class: 'sp-no-data' },
      node('h1', {}, 'Station patronage'), node('p', {}, 'The station view could not load. ' + e.message),
      node('a', { href: '#/' }, 'Return to overview')));
    return;
  }
  const lineItems = meta.lines.filter(l => railMode.has(l.mode));
  const allowed = new Set(lineItems.map(l => l.id));
  stations = stations.filter(st => st[2]?.some(id => allowed.has(id)))
    .map(st => [st[0], st[1].replace(/\s+Station$/i, ''), st[2].filter(id => allowed.has(id)), st[3]]);
  const years = data.coverage?.years || [], months = data.coverage?.months || [];
  const samples = data.coverage?.samples || [], legacyMonths = data.coverage?.legacyMonths || [];
  const f = { period: months.length ? 'monthly' : samples.length ? 'windows' : years.length ? 'typical' : 'historical',
    year: years.at(-1) || '2023',sample:samples.at(-1)||'2023',
    day: 'weekday', hour: '8', window:'06-10', month:months.at(-1)||legacyMonths.at(-1)||'',
    metric: 'entries', line: 'all', search: '', station: null };
  const heading = node('header', { class: 'sp-heading' },
    node('p', { class: 'sp-eyebrow' }, 'Opal network / historical station usage'),
    node('h1', {}, 'Station patronage hotspots'),
    node('p', { class: 'sp-intro' }, 'Explore which stations recorded the most entries and exits and how historical travel patterns changed through the day. Filter by a rail line or individual station.'),
    node('p', { class: 'sp-warning' },
      node('strong', {}, 'Not live crowding. '),
      'Historical workbook observations are sampled typical-day counts in broad time windows, not individual hours. Newer records are monthly totals. A station used by several lines is counted once, not assigned to each train line.'));
  const recent = recentMonthlyStatus(data);
  heading.append(node('section', {
    class: 'sp-source-status' + (recent.hasRecent ? ' sp-source-status-current' : ' sp-source-status-missing'),
    role: 'status', 'aria-label': 'Latest monthly station data status',
  },
    node('strong', {}, recent.title),
    node('p', {}, recent.details),
    !recent.hasRecent ? node('a', {
      href: sourceData, target: '_blank', rel: 'noopener noreferrer',
    }, 'View TfNSW monthly station dataset') : null,
  ));
  const form = node('div', { class: 'sp-controls' });
  const content = node('div', { class: 'sp-content' });
  const notes = node('section', { class: 'sp-notes' },
    node('h2', {}, 'Source and limitations'),
    node('p', {}, 'Source: Transport for NSW Opal-derived station entries and exits. Historical typical-day figures average three sampled weekdays, including three distinct 2020 periods. Source windows are 06–10, 10–15, 15–19, 19–06 and published 24-hour totals, not hourly counts. Historical and newer monthly totals use different methods. Suppressed counts below 50 remain missing, not zero.'),
    node('p', {}, 'At an interchange, entries and exits belong to the station. Filtering by T1, T9 or M1 shows stations served by each line, not passengers assigned to that train line. Never sum those line-filter totals together. Station-to-line membership comes from the current timetable and can differ from the historical network.'),
    node('p', {}, 'Dataset: ', node('a', { href: sourceData, target: '_blank', rel: 'noopener noreferrer' }, 'TfNSW Station Entries and Exits'),
      '. For current onboard crowding, use ', node('a', { href: '#/crowding' }, 'Crowding hotspots'), '.'));
  main.replaceChildren(heading, form, content, notes);

  if (!data.available) {
    const info = node('section', { class: 'sp-no-data' },
      node('h2', {}, 'Station figures are not available in this published dataset'),
      node('p', {}, data.reason || 'This deployment has not published verified station patronage figures.'),
      node('p', {}, 'The historical TfNSW source snapshots are bundled with the application. If you still see the station directory after a recent deployment, refresh the station data rather than uploading the files again.'),
      node('button', { type: 'button', class: 'sp-retry', onclick: () => viewStationPatronage(main, meta, { refresh: true }) },
        'Refresh published patronage data'),
      node('a', { href: sourceData, target: '_blank', rel: 'noopener noreferrer' }, 'View official TfNSW station dataset'));
    const catalogue = node('section', { class: 'sp-catalogue' },
      node('h2', {}, 'Stations in the current rail network'));
    const search = node('input', { type: 'search', placeholder: 'Find a station', 'aria-label': 'Search stations' });
    const results = node('div', { class: 'sp-catalogue-list' });
    const render = () => {
      const q = search.value.trim().toLowerCase();
      const matches = stations.filter(st => st[1].toLowerCase().includes(q)).slice(0, 35);
      results.replaceChildren(...matches.map(st => node('div', { class: 'sp-catalogue-row' },
        node('strong', {}, st[1]), node('span', {}, st[2].join(', ')))));
      if (!matches.length) results.append(node('p', {}, 'No matching stations.'));
    };
    search.addEventListener('input', render);
    catalogue.append(search, results); render();
    content.replaceChildren(info, catalogue);
    return;
  }

  if (data.coverage?.unmatchedCount) {
    heading.append(node('p', { class: 'sp-warning' },
      node('strong', {}, 'Incomplete station matching: '),
      number(data.coverage.unmatchedCount) + ' source station names could not be uniquely matched and were excluded. The data importer must reconcile these names before figures are accepted.'));
  }

  function renderControls() {
    const allMonthly = f.period === 'historical' ? legacyMonths : months;
    if(allMonthly.length && !allMonthly.includes(f.month))f.month=allMonthly.at(-1);
    form.replaceChildren(
      field('Dataset', [
        ...(samples.length ? [['windows','Historic sampled day (time windows)']] : []),
        ...(years.length ? [['typical', 'Historical hourly sample (separate source)']] : []),
        ...(legacyMonths.length ? [['historical','Monthly history 2016–2024']] : []),
        ...(months.length ? [['monthly', 'Recent monthly totals']] : []),
      ], f.period, v => { f.period = v; f.station = null; render(); }),
      f.period === 'windows'
        ? field('Historical sample', samples.map(x => [x, x]), f.sample, v => {f.sample=v;f.station=null;render();})
        : f.period === 'typical'
          ? field('Historical year', years.map(x => [x, x]), f.year, v => { f.year = v; f.station = null; render(); })
          : field('Month', allMonthly.map(x => [x, x]), f.month, v => { f.month = v; f.station = null; render(); }),
      f.period === 'typical' ? field('Typical day', [['weekday','Weekday'],['weekend','Weekend']],f.day,v=>{f.day=v;f.station=null;render();}):null,
      f.period === 'typical' ? field('Hour (Sydney)', [['all','All available hours'],
        ...Array.from({length:24},(_,h)=>[String(h),String(h).padStart(2,'0')+':00'])],
        f.hour,v=>{f.hour=v;render();}):null,
      f.period === 'windows' ? field('Time window (Sydney)',[
        ['06-10','06:00–10:00'],['10-15','10:00–15:00'],['15-19','15:00–19:00'],
        ['19-06','19:00–06:00 (overnight)'],['24h','Published 24-hour total']
      ],f.window,v=>{f.window=v;render();}):null,
      field('Rail line', [['all', 'All rail stations'], ...lineItems.map(l => [l.id, l.id + ' ' + l.name])],
        f.line, v => { f.line = v; f.station = null; render(); }),
      field('Measure', [['entries', 'Entries'], ['exits', 'Exits'], ['total', 'Entries + exits']], f.metric, v => { f.metric = v; render(); }));
  }

  function render() {
    renderControls();
    const rows = patronageRows(data, stations, f);
    const metric = f.metric === 'total' ? 'entries plus exits' : f.metric;
    const sample = f.period === 'typical', broadSample=f.period==='windows';
    const periodDescription = broadSample
      ? f.sample + ' sampled typical weekday, ' + ({
          '06-10':'06:00–10:00','10-15':'10:00–15:00','15-19':'15:00–19:00',
          '19-06':'19:00–06:00','24h':'published 24-hour total'
        }[f.window]||f.window)
      : sample ? f.year + ' sampled typical ' + f.day + ', ' + (f.hour === 'all' ? 'all recorded hours' : String(f.hour).padStart(2, '0') + ':00–' + String(f.hour).padStart(2, '0') + ':59')
      : f.month + ' whole-month totals';
    const totals = rows.reduce((a, r) => a + r.value, 0);
    const headline = node('section', { class: 'sp-overview' },
      cardValue('Data period', periodDescription, sample||broadSample ? 'Historical typical-day average' : 'Monthly Opal totals'),
      cardValue('Stations with records', number(rows.length), 'Within the selected rail-line filter'),
      cardValue('Reported ' + metric, number(totals), f.metric === 'total'
        ? 'Entries + exits counts tap events, not unique people'
        : 'One count per station; not passengers assigned to each line'));
    const search = node('input', { type: 'search', placeholder: 'Filter station names…',
      'aria-label': 'Filter station names', value: f.search,
      oninput: e => { f.search = e.target.value; /* retain keyboard focus below */ updateResults(); } });
    const ranking = node('section', { class: 'sp-ranking' },
      node('h2', {}, 'Busiest stations'), node('p', { class: 'muted' }, periodDescription + ' · ' + metric));
    const list = node('div', { class: 'sp-rank-list' });
    ranking.append(search, list);
    const detail = node('section', { class: 'sp-station-profile' });
    const lower = node('div', { class: 'sp-lower' }, ranking, detail);
    content.replaceChildren(headline, lower);

    function updateResults() {
      const visible = patronageRows(data, stations, f);
      const maximum = Math.max(1, ...visible.map(r => r.value));
      list.replaceChildren();
      for (const r of visible.slice(0, 30)) {
        const button = node('button', { type: 'button', class: 'sp-station-button',
          'aria-pressed': String(r.id === f.station), onclick: () => { f.station = r.id; updateResults(); } },
          node('span', { class: 'sp-station-name' }, r.name),
          node('span', { class: 'sp-station-bar-track' },
            node('span', { class: 'sp-station-bar', style: '--width:' + (100 * r.value / maximum).toFixed(1) + '%' })),
          node('strong', {}, number(r.value)));
        list.append(button);
      }
      if (visible.length > 30) list.append(node('p', { class: 'muted' }, 'Showing the top 30 matching stations.'));
      if (!visible.length) list.append(node('p', {}, 'No published records match these filters. This does not mean zero passengers.'));
      paintDetail(visible.find(x => x.id === f.station) || visible[0] || null);
    }

    function paintDetail(selected) {
      detail.replaceChildren(node('h2', {}, selected ? selected.name : 'Station profile'));
      if (!selected) {
        detail.append(node('p', {}, 'Choose a different month, year, rail line or station.'));
        return;
      }
      detail.append(node('p', { class: 'muted' }, selected.lines.join(' · ') + ' · ' + number(selected.entries) + ' entries · ' +
        number(selected.exits) + ' exits. Counts are station-level, not assigned to the listed lines.'));
      if (broadSample) {
        const values=data.periods?.[f.sample]?.[selected.id]||{};
        const labels={'06-10':'06–10','10-15':'10–15','15-19':'15–19','19-06':'19–06','24h':'24h'};
        const max=Math.max(1,...Object.values(values).map(v=>
          f.metric==='exits'?v[1]:f.metric==='total'?v[0]+v[1]:v[0]));
        const profile=node('div',{class:'sp-hourly',role:'group','aria-label':'Historical sampled time windows'});
        for(const period of ['06-10','10-15','15-19','19-06','24h']){
          const v=values[period],n=v?(f.metric==='exits'?v[1]:f.metric==='total'?v[0]+v[1]:v[0]):null;
          profile.append(node('button',{type:'button',class:'sp-hour-button',
            'aria-pressed':String(f.window===period),
            'aria-label':labels[period]+' '+(n==null?'not published':number(n)+' '+metric),
            title:labels[period]+': '+(n==null?'Unavailable':number(n)),
            onclick:()=>{f.window=period;render();}},
            n==null?node('span',{class:'sp-hour-missing'},'·')
              :node('span',{class:'sp-hour-fill',style:'--height:'+Math.round(100*n/max)+'%'}),
            node('small',{},labels[period])));
        }
        detail.append(profile,node('p',{class:'muted sp-footnote'},
          'Published typical day, based on a three-day sample. These are broad reporting windows, not individual hours. The 24h value is the original published total and must not be added to the four periods. Missing bins were not released.'));
      } else if (sample) {
        const hours = data.typical?.[f.year]?.[f.day]?.[selected.id] || {};
        const profile = node('div', { class: 'sp-hourly', role: 'group', 'aria-label': 'Historical hourly entries and exits' });
        const max = Math.max(1, ...Object.values(hours).map(v =>
          f.metric === 'exits' ? v[1] : f.metric === 'total' ? v[0] + v[1] : v[0]));
        for (let h = 0; h < 24; h++) {
          const counts = hours[h];
          const n = counts ? (f.metric === 'exits' ? counts[1] : f.metric === 'total' ? counts[0] + counts[1] : counts[0]) : null;
          profile.append(node('button', { type: 'button', class: 'sp-hour-button',
            title: (String(h).padStart(2, '0')) + ':00 · ' + (n === null ? 'No data' : number(n) + ' ' + metric),
            'aria-label': (String(h).padStart(2, '0')) + ':00 ' + (n === null ? 'No data' : number(n) + ' ' + metric),
            'aria-pressed': String(f.hour === String(h)), onclick: () => { f.hour = String(h); render(); } },
            n == null ? node('span', { class: 'sp-hour-missing' }, '·')
              : node('span', { class: 'sp-hour-fill', style: '--height:' + Math.round((100 * n) / max) + '%' }),
            node('small', {}, String(h).padStart(2, '0'))));
        }
        detail.append(profile, node('p', { class: 'muted sp-footnote' },
          '24-hour station profile, sampled typical ' + f.day + ' in ' + f.year + '. Blank columns mean unavailable observations.'));
      } else {
        const history = (f.period==='historical'?legacyMonths:months).map(m=>({month:m,
          value:(f.period==='historical'?data.legacyMonthly:data.monthly)?.[m]?.[selected.id]}));
        const list = node('div', { class: 'sp-month-list' });
        for (const point of history.filter(x => x.value).slice(-12)) {
          const value = point.value[f.metric === 'exits' ? 1 : 0] +
            (f.metric === 'total' ? point.value[1] : 0);
          list.append(node('div', {}, node('span', {}, point.month), node('strong', {}, number(value))));
        }
        detail.append(node('h3', {}, 'Recent recorded months'), list);
      }
    }
    updateResults();
  }
  render();
}
