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

// Normalise the station identifiers shared by the Opal importer and GTFS
// catalogue. A route is ordered by published station geography, not passenger
// count and not the order in which the live feed happened to list stops.
export const stopNameKey = name => String(name||'').toLowerCase()
  .replace(/\s+station$/i,'').replace(/\s*\(nowra\)/i,'')
  .replace(/[^a-z0-9]/g,'');

export function patronageRouteChoice(routes, line, routeId) {
  const item = line === 'T4_SCO'
    ? (routes?.corridors||[]).find(c=>c.id==='T4_SCO')
    : (routes?.lines?.[line] ? {id:line,routes:routes.lines[line]} : null);
  const choices=item?.routes||[];
  return {item,choices,route:choices.find(r=>r.id===routeId)||choices[0]||null};
}

// Count a single Opal station once even if it is shared by both SCO and T4.
// Null values are real "not published" cells, not zero-tap stations.
// A corridor's geographic order does NOT establish which way anyone rode.
export function stationRouteRows(data, stations, routes, opts={}) {
  const {line='all',route='',direction='forward',sort='stops',search=''}=opts;
  const selected=patronageRouteChoice(routes,line,route);
  if(!selected.route) return patronageRows(data,stations,{...opts,line:line==='T4_SCO'?'all':line});
  const keyed=new Map();
  for(const [id,name,lines] of stations||[]){
    const key=stopNameKey(name);
    if(!keyed.has(key))keyed.set(key,{id,name,lines});
  }
  const observations=new Map(patronageRows(data,stations,{...opts,line:'all',search:''}).map(r=>[r.id,r]));
  const visited=new Set(),items=[];
  const sequence=direction==='reverse'||direction==='city'
    ? [...selected.route.stations].reverse() : selected.route.stations;
  for(const [index,stop] of sequence.entries()){
    const st=keyed.get(stopNameKey(stop));
    if(!st||visited.has(st.id))continue;
    if(line!=='T4_SCO'&&!st.lines.includes(line))continue;
    visited.add(st.id);
    if(search&&!st.name.toLowerCase().includes(search.trim().toLowerCase()))continue;
    const record=observations.get(st.id);
    items.push(record?{...record,stopNumber:index+1,unreported:false}
      :{id:st.id,name:st.name,lines:st.lines,entries:null,exits:null,
        value:null,stopNumber:index+1,unreported:true});
  }
  if(sort==='patronage')return items.filter(r=>r.value!==null)
    .sort((a,b)=>b.value-a.value||a.name.localeCompare(b.name));
  return items;
}


// Colour published station activity using a continuous, perceptually ordered
// cool-to-warm ramp. Values are scaled against the displayed corridor only.
// A published zero has a pale filled marker; absent/suppressed data is hollow.
export function patronageHeatColour(intensity) {
  const value=Number.isFinite(intensity)?Math.max(0,Math.min(1,intensity)):0;
  const palette=[[226,242,247],[88,174,189],[233,153,75],[177,45,52]];
  const scaled=value*(palette.length-1);
  const index=Math.min(palette.length-2,Math.floor(scaled));
  const fraction=scaled-index;
  const rgb=palette[index].map((channel,i)=>
    Math.round(channel+(palette[index+1][i]-channel)*fraction));
  return '#'+rgb.map(v=>v.toString(16).padStart(2,'0')).join('');
}

// Build a railway diagram from the same ordered stops used by the published
// patronage view. This is a branching *station schematic*, not TfNSW map art,
// train movement, a stopping timetable, or inferred journey direction.
export function stationDiagramPlan(routes, line, routeId = '') {
  const selected = patronageRouteChoice(routes,line,routeId);
  if (!selected.route) return null;
  let trunk = selected.route.stations;
  let alternatives = [];
  if (line === 'T4') {
    const choices = routes?.lines?.T4 || [];
    const waterfall = choices.find(r=>stopNameKey(r.stations.at(-1))==='waterfall');
    const cronulla = choices.find(r=>stopNameKey(r.stations.at(-1))==='cronulla');
    if (waterfall && cronulla) { trunk=waterfall.stations; alternatives=[cronulla]; }
  } else if (line === 'T4_SCO') {
    const choices = selected.choices;
    trunk = (choices.find(r=>r.id==='south-coast')||selected.route).stations;
    alternatives = choices.filter(r=>r.id==='port-kembla'||r.id==='cronulla');
  }
  const branches=[];
  for (const route of alternatives) {
    let index=0;
    while(index<Math.min(trunk.length,route.stations.length) &&
      stopNameKey(trunk[index])===stopNameKey(route.stations[index]))index++;
    if(index && index<route.stations.length)
      branches.push({at:trunk[index-1],stations:route.stations.slice(index),name:route.name});
  }
  return {line,trunk:[...trunk],branches,
    name:line==='T4'?'T4 · Eastern Suburbs & Illawarra':
      line==='T4_SCO'?'T4 + SCO · Connected South Coast':selected.route.name};
}

export function stationDiagramModel(plan, stations, observations, { flip = false } = {}) {
  if(!plan)return null;
  const catalogue=new Map();
  for(const [id,name,lines] of stations||[]){
    const key=stopNameKey(name);
    if(!catalogue.has(key))catalogue.set(key,{id,name,lines});
  }
  const recorded=new Map((observations||[]).map(r=>[r.id,r]));
  // Scale visual markers relative to the plotted stops, not unrelated network stations.
  const plotted=[...plan.trunk,...plan.branches.flatMap(b=>b.stations)];
  const max=Math.max(1,...plotted.map(stop=>{
    const station=catalogue.get(stopNameKey(stop));
    return station?(recorded.get(station.id)?.value??0):0;
  }));
  const nodes=[],paths=[],shown=new Set(),mainX=58,branchX=412,top=68,step=47;
  function add(stop,x,y,service=plan.line) {
    const key=stopNameKey(stop);
    if(shown.has(key))return;
    shown.add(key);
    const station=catalogue.get(key);
    const record=station?recorded.get(station.id):null;
    nodes.push({
      id:station?.id??null, name:station?.name??stop, lines:station?.lines||[],
      entries:record?.entries??null, exits:record?.exits??null,
      value:record?.value??null, unreported:!record, unmatched:!station,
      x,y,service,intensity:record?Math.sqrt(Math.max(0,record.value)/max):0,
    });
  }
  const waterfall=plan.line==='T4_SCO'
    ? plan.trunk.findIndex(stop=>stopNameKey(stop)==='waterfall') : -1;
  plan.trunk.forEach((stop,i)=>add(stop,mainX,top+i*step,
    plan.line==='T4_SCO'?(waterfall>=0&&i>waterfall?'SCO':'T4'):plan.line));
  if(plan.trunk.length>1){
    if(waterfall>0&&waterfall<plan.trunk.length-1){
      paths.push({d:'M'+mainX+' '+top+' V'+(top+waterfall*step),
        branch:false,service:'T4'});
      paths.push({d:'M'+mainX+' '+(top+waterfall*step)+' V'+
        (top+(plan.trunk.length-1)*step),branch:false,service:'SCO'});
    }else paths.push({d:'M'+mainX+' '+top+' V'+
      (top+(plan.trunk.length-1)*step),branch:false,service:plan.line});
  }
  let highest=top+Math.max(0,plan.trunk.length-1)*step;
  for(const branch of plan.branches) {
    const anchorIndex=plan.trunk.findIndex(s=>stopNameKey(s)===stopNameKey(branch.at));
    if(anchorIndex<0 || !branch.stations.length)continue;
    const y=top+anchorIndex*step,firstY=y+step;
    const service=plan.line==='T4_SCO'
      ? (stopNameKey(branch.stations.at(-1))==='cronulla'?'T4':'SCO')
      : plan.line;
    // Exit below the junction station's label. A horizontal track directly
    // through Sutherland/Coniston obscured names on narrow iPhone screens.
    const gapY=y+Math.round(step/2),bend=12;
    paths.push({d:'M'+mainX+' '+y+' V'+(gapY-4)+
      ' Q'+mainX+' '+gapY+' '+(mainX+4)+' '+gapY+
      ' H'+(branchX-bend)+
      ' Q'+branchX+' '+gapY+' '+branchX+' '+(gapY+bend)+
      ' V'+(firstY+(branch.stations.length-1)*step),
      branch:true,service});
    branch.stations.forEach((stop,i)=>add(stop,branchX,firstY+i*step,service));
    highest=Math.max(highest,firstY+(branch.stations.length-1)*step);
  }
  // Mirror railway geometry vertically without rotating SVG labels.
  // Flipping affects only station placement and track paths; station records,
  // entry/exit figures, line memberships and selected profile IDs do not change.
  // Do not flip the whole SVG: that would render station names upside down.
  if (flip) {
    const axis=top+highest;
    for(const st of nodes)st.y=axis-st.y;
    for(const path of paths)path.transform='translate(0 '+axis+') scale(1 -1)';
  }
  return {nodes,paths,width:820,height:highest+72,maximum:max,flipped:!!flip,
    line:plan.line,first:plan.trunk[0],last:plan.trunk.at(-1)};
}

const svgNs='http://www.w3.org/2000/svg';
function svgNode(tag,attributes={},...children) {
  const el=document.createElementNS(svgNs,tag);
  for(const [key,value] of Object.entries(attributes))if(value!=null)el.setAttribute(key,String(value));
  for(const child of children.flat(Infinity))
    if(child!=null)el.append(child instanceof Node?child:document.createTextNode(String(child)));
  return el;
}

export function makeStationDiagram(model, {name,metric,search='',selectedId=null,onSelect,colors={}}) {
  // Use only hexadecimal line colours from the app's published line catalogue.
  const colour=line=>/^#[0-9a-f]{6}$/i.test(colors[line]||'')
    ? colors[line] : '#526777';
  const ink=line=>{
    const value=colour(line).slice(1),r=parseInt(value.slice(0,2),16),
      g=parseInt(value.slice(2,4),16),b=parseInt(value.slice(4,6),16);
    return (r*299+g*587+b*114)/1000>145?'#17202b':'#ffffff';
  };
  const svg=svgNode('svg',{
    class:'sp-diagram-svg',viewBox:'0 0 '+model.width+' '+model.height,
    width:model.width,height:model.height,role:'group',
    'aria-label':name+' station patronage schematic, '+metric+'; select a station for its profile',
  });
  // T4 + SCO is two distinct corridor labels; do not paint both as T4.
  const badgeLines=model.line==='T4_SCO'?['T4','SCO']:[model.line];
  let badgeRight=19;
  for(const line of badgeLines){
    const width=line.length>2?64:52;
    svg.append(
      svgNode('rect',{class:'sp-diagram-line-badge',x:badgeRight,y:13,
        width,height:33,rx:6,style:'--sp-badge-colour:'+colour(line)}),
      svgNode('text',{class:'sp-diagram-line-code',x:badgeRight+width/2,y:35,
        'text-anchor':'middle',style:'--sp-badge-ink:'+ink(line)},line),
    );
    badgeRight+=width+5;
  }
  svg.append(svgNode('text',{class:'sp-diagram-header-label',x:badgeRight+12,y:34},
    'Station-level '+metric+' · historical Opal counts'));
  for(const p of model.paths)svg.append(svgNode('path',{
    class:'sp-diagram-track'+(p.branch?' sp-diagram-branch':''),d:p.d,
    stroke:colour(p.service||model.line),transform:p.transform,
  }));
  const term=search.trim().toLowerCase(),groups=[];
  for(const st of model.nodes) {
    const label=st.value===null?(st.unmatched?'No catalogue match':'Not published'):number(st.value);
    const match=!term||st.name.toLowerCase().includes(term);
    const radius=st.value===null?9:7+9*st.intensity;
    const group=svgNode('g',{
      class:'sp-diagram-stop'+(st.value===null?' sp-diagram-missing':'')+
        (match?'':' sp-diagram-dim'),
      'data-station-id':st.id,
      'aria-label':st.name+', '+label+' '+metric+(st.id?', select station':''),
      'aria-pressed':String(st.id===selectedId),
      ...(st.id?{role:'button',tabindex:'0'}:{}),
    });
    group.append(
      svgNode('rect',{x:st.x-23,y:st.y-22,width:350,height:44,rx:5,
        class:'sp-diagram-hit'}),
      svgNode('circle',{cx:st.x,cy:st.y,r:radius,
        class:'sp-diagram-dot',
        style:'--sp-station-colour:'+colour(st.service||model.line)+
          ';--sp-heat-colour:'+patronageHeatColour(st.intensity)}),
      // A tspan is laid out immediately after its station name by the SVG
      // text engine; never pin the figure to an arbitrary distant x-coordinate.
      svgNode('text',{x:st.x+26,y:st.y+5,class:'sp-diagram-label'},
        svgNode('tspan',{class:'sp-diagram-name'},st.name),
        svgNode('tspan',{class:'sp-diagram-value',dx:12},label)),
    );
    if(st.id) {
      const activate=()=>{
        for(const g of groups)g.setAttribute('aria-pressed',String(g===group));
        onSelect(st);
      };
      group.addEventListener('click',activate);
      group.addEventListener('keydown',e=>{
        if(e.key==='Enter'||e.key===' '){e.preventDefault();activate();}
      });
    }
    groups.push(group);
    svg.append(group);
  }
  return svg;
}


// Mobile-first route renderer. One readable column is more useful than an
// oversized SVG viewport on Safari: station, colour and value belong together.
// Keep the separate SVG renderer for the earlier schematic regression fixtures.
export function stationRouteCardSections(plan, model) {
  if(!plan||!model)return [];
  const byName=new Map(model.nodes.map(st=>[stopNameKey(st.name),st]));
  const branches=new Map();
  for(const branch of plan.branches){
    const key=stopNameKey(branch.at);
    const label=branch.stations.at(-1);
    const rows=branch.stations.map(s=>byName.get(stopNameKey(s))).filter(Boolean);
    if(!rows.length)continue;
    const arr=branches.get(key)||[];
    arr.push({junction:branch.at,terminal:label,rows,
      service:rows[0].service});
    branches.set(key,arr);
  }
  const trunk=(model.flipped?[...plan.trunk].reverse():plan.trunk);
  return trunk.map(stop=>{
    const key=stopNameKey(stop);
    const station=byName.get(key);
    return station?{station,branches:branches.get(key)||[]}:null;
  }).filter(Boolean);
}

export function makeResponsiveStationDiagram(plan,model,{
  metric='entries',search='',selectedId=null,onSelect=()=>{},colors={},
}={}) {
  const colour=line=>/^#[0-9a-f]{6}$/i.test(colors[line]||'')
    ? colors[line] : '#526777';
  const term=search.trim().toLowerCase();
  const sections=stationRouteCardSections(plan,model);
  const root=node('div',{class:'sp-responsive-network',role:'group',
    'aria-label':plan.name+' route diagram with station-level '+metric});
  const trunk=node('ol',{class:'sp-route-stop-list', 'aria-label':'Main corridor stations'});
  root.append(trunk);

  function drawStation(st) {
    const missing=st.value==null;
    const fill=patronageHeatColour(st.intensity);
    const label=missing?(st.unmatched?'No catalogue match':'Not published'):number(st.value);
    const routeColour=colour(st.service==='T4_SCO'?'T4':st.service||plan.line);
    const muted=term&&!st.name.toLowerCase().includes(term);
    const item=node('li',{class:'sp-route-stop'+(muted?' sp-route-dim':''),
      style:'--sp-route-colour:'+routeColour});
    const body=node('button',{type:'button',class:'sp-route-stop-button',
      'aria-label':st.name+', '+label+' '+metric+(st.id?', show station details':''),
      'aria-pressed':String(st.id===selectedId),
      ...(st.id?{}:{disabled:'disabled'})},
      node('span',{class:'sp-route-dot'+(missing?' sp-route-dot-missing':''),
        style:missing?'border-color:'+routeColour:
          'border-color:'+routeColour+';background-color:'+fill,
        'aria-hidden':'true'}),
      node('span',{class:'sp-route-text'},
        node('span',{class:'sp-route-name'},st.name),
        node('span',{class:'sp-route-amount'+(missing?' sp-route-amount-missing':''),
          style:missing?'':('background-color:'+fill+';color:'+
            (st.intensity>=.70?'#ffffff':'#17202b'))},label)));
    const detail=node('div',{class:'sp-route-inline-detail',
      ...(st.id===selectedId?{}:{hidden:'hidden'})},
      missing
        ? 'No complete published entry/exit pair for this station and period. Missing is not zero.'
        : number(st.entries)+' entries · '+number(st.exits)+
          ' exits. These are station tap events, not passengers assigned to a train.');
    item.append(body,detail);
    if(st.id)body.addEventListener('click',()=>{
      for(const btn of root.querySelectorAll('.sp-route-stop-button'))
        btn.setAttribute('aria-pressed',String(btn===body));
      for(const el of root.querySelectorAll('.sp-route-inline-detail'))
        el.hidden=el!==detail;
      detail.hidden=false;
      onSelect(st);
    });
    return item;
  }

  function drawBranch(branch) {
    const branchColour=colour(branch.service==='T4_SCO'?'T4':branch.service);
    const label='From '+branch.junction+' to '+branch.terminal;
    const details=node('details',{class:'sp-route-branch',open:'',
      style:'--sp-route-colour:'+branchColour},
      node('summary',{class:'sp-route-branch-title'},
        node('span',{class:'sp-route-branch-icon','aria-hidden':'true'},'↳'),
        node('span',{},'Branch to '+branch.terminal),
        node('small',{},branch.rows.length+' stations')),
      node('p',{class:'sp-route-branch-context'},label+' · reference route order'),
      node('ol',{class:'sp-route-stop-list sp-route-branch-stops',
        'aria-label':label},...branch.rows.map(drawStation)));
    return node('li',{class:'sp-route-branch-wrapper'},details);
  }
  for(const row of sections){
    trunk.append(drawStation(row.station));
    for(const branch of row.branches)trunk.append(drawBranch(branch));
  }
  return root;
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
  let data, stations, routes;
  try {
    // A source import can deploy while this view remains open. A manual
    // refresh adds a unique query string to escape intermediary 404/no-data
    // caching, including some installed Safari Home Screen sessions.
    const suffix = refresh ? '?refresh=' + Date.now() : '';
    const [a, b, c] = await Promise.all([
      fetch('data/station-patronage.json' + suffix, { cache: refresh ? 'no-store' : 'no-cache' }),
      fetch('data/stations.json' + suffix, { cache: refresh ? 'no-store' : 'no-cache' }),
      fetch('data/station-routes.json' + suffix, { cache: refresh ? 'no-store' : 'no-cache' })
        .catch(() => null),
    ]);
    if (!a.ok || !b.ok) throw new Error('Station data files are not available yet');
    [data, stations] = await Promise.all([a.json(), b.json()]);
    // A previous deployment can retain the old dataset without corridor
    // metadata. Show existing patronage ranking rather than break the page.
    routes = c?.ok ? await c.json() : {lines:{},corridors:[]};
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
    metric: 'entries', line: 'all', route:'', direction:'forward',
    sort:'patronage', view:'list', diagramFlip:false, search:'', station: null };
  const heading = node('header', { class: 'sp-heading' },
    node('p', { class: 'sp-eyebrow' }, 'Opal network / historical station usage'),
    node('h1', {}, 'Station patronage hotspots'),
    node('p', { class: 'sp-intro' }, 'Explore which stations recorded the most entries and exits and how historical travel patterns changed through the day. Filter by a rail line or individual station.'),
    node('p', { class: 'sp-warning' },
      node('strong', {}, 'Not live crowding or directional ridership. '),
      'The connected-corridor view follows stations along T4 and SCO, including interchanges and branches. Inbound/outbound changes the DISPLAY ORDER only. Opal station entries and exits cannot determine which train or travel direction a passenger used. Station counts are never attributed to a particular line.'));
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
    node('p', {}, 'Connected T4/SCO and individual rail-line routes show reference station order, NOT exact train stopping patterns. On T4/SCO shared stations, an Opal entry or exit is counted once, never both on T4 and SCO. Station counts have no journey origin, destination or citybound/coastbound field: reverse ordering must never be presented as directional passenger volume. Train stopping patterns and interchange arrangements may change with the timetable.'),
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
      field('Rail line / connected corridor', [
        ['all','All rail stations'],
        ...(routes?.corridors||[]).map(c=>[c.id,c.name]),
        ...lineItems.map(l=>[l.id,l.id+' '+l.name]),
      ], f.line, v => {
        f.line=v;f.route='';f.direction=v==='T4_SCO'?'city':'forward';
        f.sort=v==='all'?'patronage':'stops';
        f.station=null;
        // Whole-network analysis remains a ranked list. Selecting a physical
        // railway line defaults to the diagram, with the List view one tap away.
        // Without ordered route metadata preserve the existing list fallback.
        f.view=v!=='all'&&patronageRouteChoice(routes,v,'').route?'diagram':'list';
        render();
      }),
      ...(f.line!=='all' && patronageRouteChoice(routes,f.line,f.route).route ? [
        ...(f.view==='diagram' && (f.line==='T4'||f.line==='T4_SCO') ? [] : [field('Route / branch',patronageRouteChoice(routes,f.line,f.route).choices.map(r=>[r.id,r.name]),
          patronageRouteChoice(routes,f.line,f.route).route.id,
          v=>{f.route=v;f.station=null;render();})]),
        ...(f.view==='diagram'?[]:[field('Stop direction', f.line==='T4_SCO'
          ? [['city','Towards Central (stop order)'],['away','Away from Central (stop order)']]
          : [['forward','First to last stop'],['reverse','Last to first stop']],
          f.direction,v=>{f.direction=v;f.station=null;render();}),
        field('Sort stations', [['stops','Route stop order'],['patronage','Highest patronage first']],
          f.sort,v=>{f.sort=v;f.station=null;render();})]),
      ]:[]),
      field('Measure', [['entries', 'Entries'], ['exits', 'Exits'], ['total', 'Entries + exits']], f.metric, v => { f.metric = v; render(); }));
  }

  function render() {
    renderControls();
    const selectedRoute=patronageRouteChoice(routes,f.line,f.route);
    const ordered=f.line!=='all' && selectedRoute.route;
    const listRows=ordered ? stationRouteRows(data,stations,routes,f) : patronageRows(data,stations,f);
    const plan=stationDiagramPlan(routes,f.line,f.route);
    const diagramColors=Object.fromEntries(lineItems.map(l=>[l.id,l.color]));
    const allObservations=plan ? patronageRows(data,stations,{...f,line:'all',search:''}) : [];
    const diagramModel=plan ? stationDiagramModel(plan,stations,allObservations,
      {flip:f.diagramFlip}) : null;
    // Summary cards use all unique plotted stations when both branches are shown;
    // the selected route/list subset would otherwise undercount the diagram.
    const rows=f.view==='diagram' && diagramModel ? diagramModel.nodes : listRows;
    const published=rows.filter(r=>r.value!==null);
    const metric = f.metric === 'total' ? 'entries plus exits' : f.metric;
    const sample = f.period === 'typical', broadSample=f.period==='windows';
    const periodDescription = broadSample
      ? f.sample + ' sampled typical weekday, ' + ({
          '06-10':'06:00–10:00','10-15':'10:00–15:00','15-19':'15:00–19:00',
          '19-06':'19:00–06:00','24h':'published 24-hour total'
        }[f.window]||f.window)
      : sample ? f.year + ' sampled typical ' + f.day + ', ' + (f.hour === 'all' ? 'all recorded hours' : String(f.hour).padStart(2, '0') + ':00–' + String(f.hour).padStart(2, '0') + ':59')
      : f.month + ' whole-month totals';
    const totals = published.reduce((a,r)=>a+r.value,0);
    const headline = node('section', { class: 'sp-overview' },
      cardValue('Data period', periodDescription, sample||broadSample ? 'Historical typical-day average' : 'Monthly Opal totals'),
      cardValue('Stations with records',number(published.length),ordered
        ? number(published.length)+' of '+number(rows.length)+' listed corridor stops with records'
        : 'Within the selected rail-line filter'),
      cardValue('Reported ' + metric, number(totals), f.metric === 'total'
        ? 'Entries + exits counts tap events, not unique people'
        : 'One count per station; not passengers assigned to each line'));
    const search = node('input', { type: 'search', placeholder: 'Filter station names…',
      'aria-label': 'Filter station names', value: f.search,
      oninput: e => { f.search = e.target.value; /* retain keyboard focus below */ updateResults(); } });
    const ranking = node('section', { class: 'sp-ranking' },
      node('h2', {}, ordered && f.sort==='stops'?'Stations in corridor stop order':'Busiest stations'),
      node('p', { class: 'muted' }, periodDescription+' · '+metric),
      ordered ? node('p',{class:'sp-corridor-note'},
        (selectedRoute.item?.note||'Reference geographic sequence, not a service timetable.')+
        ' Direction changes the order of stations only. Entries and exits are not proof of a passenger’s travel direction.')
        : null);
    const list = node('div', { class: 'sp-rank-list' });
    ranking.append(search, list);
    const detail = node('section', { class: 'sp-station-profile' });
    const diagram=node('section',{class:'sp-diagram-panel'});
    const toggle=node('div',{class:'sp-view-toggle',role:'group','aria-label':'Station patronage display mode'},
      node('button',{type:'button','aria-pressed':String(f.view==='list'),
        onclick:()=>{f.view='list';render();}},'List view'),
      node('button',{type:'button','aria-pressed':String(f.view==='diagram'),
        ...(plan?{}:{disabled:'disabled'}),
        onclick:()=>{if(plan){f.view='diagram';render();}}},'Diagram view'));
    const diagramActive=f.view==='diagram' && !!diagramModel;
    const lower = node('div', { class: 'sp-lower'+(diagramActive?' sp-lower-diagram':'') },
      diagramActive?diagram:ranking, detail);
    content.replaceChildren(headline,toggle,lower);
    if(diagramActive){
      // Branches may extend above the trunk's terminus after flipping, so
      // describe the main-corridor reading order rather than implying the
      // two labels are literally the highest/lowest markers in a branched map.
      const topStation=f.diagramFlip?diagramModel.last:diagramModel.first;
      const bottomStation=f.diagramFlip?diagramModel.first:diagramModel.last;
      diagram.append(
        node('div',{class:'sp-diagram-toolbar'},
          node('h2',{},plan.name+' · station diagram'),
          node('button',{
            type:'button',class:'sp-diagram-flip','aria-pressed':String(f.diagramFlip),
            'aria-label':'Flip diagram. Put '+bottomStation+' at the top.',
            onclick:()=>{
              f.diagramFlip=!f.diagramFlip;
              render();
              // Return keyboard focus to the replacement control after render.
              form.parentElement?.querySelector('.sp-diagram-flip')?.focus({preventScroll:true});
            },
          },'⇅ Flip diagram'),
        ),
        node('p',{class:'sp-diagram-orientation','aria-live':'polite'},
          'Main corridor, top to bottom: '+topStation+' → '+bottomStation+
          ' (diagram orientation only; branches may extend beyond the terminus)'),
        node('p',{class:'sp-corridor-note'},
          'Reference station order, not a timetable. Circle size represents the selected station-level '+
          metric+'. Branches remain connected at their junctions when the diagram is flipped. '+
          'Station entries and exits do not identify the direction or train service used by a passenger.'),
        node('div',{class:'sp-diagram-legend','aria-label':'Patronage diagram legend'},
          node('span',{},'● Larger, warmer circles: more published '+metric+' on this diagram'),
          node('span',{},'○ Hollow circle: missing or suppressed station figures'),
          node('span',{},'0 is a published zero, not missing data'),
          node('span',{},'Track colours indicate the route, not passenger travel direction'),
          node('div',{class:'sp-diagram-heat-legend','aria-label':'Station patronage colour gradient from low to high'},
            node('span',{},'Lower patronage'),
            node('span',{class:'sp-diagram-heat-ramp','aria-hidden':'true'}),
            node('span',{},'Higher patronage ('+number(diagramModel.maximum)+' '+metric+')'))),
        node('p',{class:'muted'},'Read the main route from top to bottom. Open a branch at its junction; tap a station to reveal its entry and exit counts beside the route.'),
        search,node('div',{class:'sp-diagram-scroll'}),
      );
    }

    function updateResults() {
      const visible = ordered ? stationRouteRows(data,stations,routes,f)
        : patronageRows(data,stations,f);
      const maximum = Math.max(1, ...visible.filter(r=>r.value!==null).map(r => r.value));
      if(diagramActive) {
        const host=diagram.querySelector('.sp-diagram-scroll');
        host.replaceChildren(makeResponsiveStationDiagram(plan,diagramModel,{
          metric,search:f.search,selectedId:f.station,
          colors:diagramColors,
          onSelect:st=>{f.station=st.id;paintDetail(st);},
        }));
      }
      list.replaceChildren();
      for (const r of (ordered&&f.sort==='stops'?visible:visible.slice(0,30))) {
        const button = node('button', { type: 'button', class: 'sp-station-button',
          'aria-pressed': String(r.id === f.station), onclick: () => { f.station = r.id; updateResults(); } },
          node('span', { class: 'sp-station-name' },
            ordered&&f.sort==='stops' ? String(r.stopNumber).padStart(2,'0')+' · '+r.name : r.name),
          node('span', { class: 'sp-station-bar-track' },
            r.value===null ? node('span',{class:'sp-no-record'},'Not published')
              : node('span', { class: 'sp-station-bar', style: '--width:' + (100 * r.value / maximum).toFixed(1) + '%' })),
          node('strong', {}, r.value===null?'—':number(r.value)));
        list.append(button);
      }
      if (visible.length > 30 && !(ordered&&f.sort==='stops'))
        list.append(node('p', { class: 'muted' }, 'Showing the top 30 matching stations.'));
      if (!visible.length) list.append(node('p', {}, 'No published records match these filters. This does not mean zero passengers.'));
      const chosen=diagramActive ? diagramModel.nodes.find(x=>x.id===f.station)
        : visible.find(x=>x.id===f.station);
      paintDetail(chosen || (diagramActive?diagramModel.nodes.find(x=>x.id):visible[0]) || null);
    }

    function paintDetail(selected) {
      detail.replaceChildren(node('h2', {}, selected ? selected.name : 'Station profile'));
      if (!selected) {
        detail.append(node('p', {}, 'Choose a different month, year, rail line or station.'));
        return;
      }
      if(selected.value===null){
        detail.append(node('p', {class:'muted'},
          'No published station entry/exit pair for this stop and period. This is unavailable data, not zero passengers.'));
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
