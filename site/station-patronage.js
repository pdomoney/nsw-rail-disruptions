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

// Sum published station-month pairs into a calendar-year view, without filling
// missing or suppressed months with zero. Historical and recent monthly series
// are never combined: their published reporting methods are different.
// Years with fewer than 12 published months are explicit partial-year totals.
export function annualStationPatronage(data, sourceKey='monthly') {
  if(sourceKey!=='monthly'&&sourceKey!=='legacyMonthly')
    throw new Error('Only verified historical or recent monthly station totals can be annualised');
  const source=data?.[sourceKey]||{};
  const monthKeys=Object.keys(source).filter(month=>
    /^\d{4}-(0[1-9]|1[0-2])$/.test(month)).sort();
  const years=[...new Set(monthKeys.map(month=>month.slice(0,4)))];
  const totals={},coverage={};
  for(const year of years){
    const months=monthKeys.filter(month=>month.startsWith(year+'-'));
    const ids=new Set(months.flatMap(month=>Object.keys(source[month]||{})));
    const stations={};
    let missingStationCount=0;
    for(const id of ids){
      const pairs=months.map(month=>source[month]?.[id]);
      // Missing individual months, partial entry/exit pairs or suppression
      // invalidate that station's annual total; never treat absence as zero.
      if(!pairs.every(pair=>Array.isArray(pair)&&pair.length>=2&&
        Number.isSafeInteger(pair[0])&&pair[0]>=0&&
        Number.isSafeInteger(pair[1])&&pair[1]>=0)){
        missingStationCount++;
        continue;
      }
      const entries=pairs.reduce((sum,pair)=>sum+pair[0],0);
      const exits=pairs.reduce((sum,pair)=>sum+pair[1],0);
      if(!Number.isSafeInteger(entries)||!Number.isSafeInteger(exits)){
        missingStationCount++;
        continue;
      }
      stations[id]=[entries,exits];
    }
    totals[year]=stations;
    coverage[year]={
      year,months,monthCount:months.length,
      completeYear:months.length===12&&months[0]===year+'-01'&&
        months[11]===year+'-12',
      publishedStations:Object.keys(stations).length,
      missingStationCount,
    };
  }
  return {years,totals,coverage};
}

export function patronageRows(data, stations, {
  period = 'typical', year = '2023', annualYear = '', day = 'weekday', hour = '8',
  month = '', sample = '2023', window = '06-10', metric = 'entries', line = 'all', search = '',
} = {}) {
  const rows = [];
  const hourly = period === 'typical', sampled = period === 'windows';
  const source = hourly ? (data?.typical?.[year]?.[day] || {})
    : sampled ? (data?.periods?.[sample] || {})
    : period === 'annual' ? (data?.annualMonthly?.[annualYear] || {})
    : period === 'historical-annual' ? (data?.annualLegacyMonthly?.[annualYear] || {})
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


// Viridis: perceptually ordered sequential colours sampled from Matplotlib.
// Brightness progresses smoothly from dark purple to clear yellow.
export const PATRONAGE_SEQUENTIAL_STOPS=Object.freeze([
  '#440154','#482475','#414487','#355f8d','#2a788e','#21918c',
  '#22a884','#44bf70','#7ad151','#bddf26','#fde725',
]);
// Compatibility name for older consumers; not a rainbow scale.
export const PATRONAGE_RAINBOW_STOPS=PATRONAGE_SEQUENTIAL_STOPS;

// Nine distinct volume shades, with a warmer orange-to-red high end.
// Values are compared against the highest included station using the same
// square-root scale as before; colour changes do not change source tap counts.
// A legend step represents a value band, not equal numbers of stations.
// Intentionally more saturated at the top than the older Viridis yellow end.
export const PATRONAGE_VISUAL_COLOURS=Object.freeze([
  '#440154','#482878','#3e4989','#31688e','#26828e',
  '#1f9e89','#73d055','#f8961e','#d62828',
]);
export function stationPatronageVolumeBands(values) {
  const ordered=[...new Set((values||[])
    .filter(n=>Number.isFinite(n)&&n>=0))].sort((a,b)=>a-b);
  const bands=new Map();
  if(!ordered.length)return bands;
  const last=PATRONAGE_VISUAL_COLOURS.length-1;
  const max=ordered.at(-1);
  // An all-equal dataset has no measured range. Display a neutral midpoint
  // for a single positive count, or the lowest band for published zero.
  if(ordered.length===1){
    bands.set(ordered[0],max===0?0:Math.floor(last/2));
    return bands;
  }
  for(const value of ordered){
    const scaled=Math.sqrt(Math.min(1,value/max));
    bands.set(value,Math.min(last,Math.floor(scaled*(last+1))));
  }
  return bands;
}
export function patronageHeatColour(intensity) {
  const value=Number.isFinite(intensity)?Math.max(0,Math.min(1,intensity)):0;
  const scaled=value*(PATRONAGE_SEQUENTIAL_STOPS.length-1);
  const index=Math.min(PATRONAGE_SEQUENTIAL_STOPS.length-2,Math.floor(scaled));
  const fraction=scaled-index;
  const rgb=hex=>[1,3,5].map(i=>Number.parseInt(hex.slice(i,i+2),16));
  const from=rgb(PATRONAGE_SEQUENTIAL_STOPS[index]);
  const to=rgb(PATRONAGE_SEQUENTIAL_STOPS[index+1]);
  return '#'+from.map((v,i)=>Math.round(v+(to[i]-v)*fraction)
    .toString(16).padStart(2,'0')).join('');
}

// Choose the more legible chip text for each shade (including yellow, cyan
// and green) using WCAG relative luminance and contrasting black/white.
export function patronageHeatTextColour(hex) {
  const c=/^#[0-9a-f]{6}$/i.test(hex||'')?hex:'#ffffff';
  const rgb=[1,3,5].map(i=>Number.parseInt(c.slice(i,i+2),16)/255);
  const linear=rgb.map(v=>v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4);
  const luminance=linear[0]*0.2126+linear[1]*0.7152+linear[2]*0.0722;
  return (luminance+0.05)/0.05 >= 1.05/(luminance+0.05)
    ? '#000000' : '#ffffff';
}

// Only these five user-specified stations are removed from the visual scaling.
// All other interchanges must use their normal source-backed colour and size.
export const PATRONAGE_HEAT_EXCLUDED_HUBS=Object.freeze([
  'Martin Place','Town Hall','Central','Redfern','Sydenham',
]);
const patronageHubKeys=new Set(PATRONAGE_HEAT_EXCLUDED_HUBS.map(stopNameKey));

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
  const plotted=[...new Set([...plan.trunk,...plan.branches.flatMap(b=>b.stations)]
    .map(stopNameKey))];
  const published=plotted.map(key=>({
    key,value:catalogue.has(key)?recorded.get(catalogue.get(key).id)?.value:null,
  })).filter(st=>st.value!=null && Number.isFinite(st.value));
  // Retain the actual highest count for reporting and old SVG consumers.
  // Neither mobile marker sizes nor colours should use this hub-skewed peak.
  const max=Math.max(1,...published.map(st=>st.value));
  // Remove only Martin Place, Town Hall, Central, Redfern and Sydenham. All other
  // hubs remain part of the size and rainbow colour calculation. If no other
  // published values exist, fall back to those available source records.
  const ordinary=published.filter(st=>!patronageHubKeys.has(st.key));
  const excludeHubs=ordinary.length>0;
  const gradientMaximum=Math.max(1,...(excludeHubs?ordinary:published)
    .map(st=>st.value));
  const excludedHubCount=excludeHubs
    ? published.filter(st=>patronageHubKeys.has(st.key)).length : 0;
  // All included stations (including interchanges other than the five
  // exclusions) define the maximum for nine square-root-spaced volume bands.
  // Identical published figures always receive identical colours.
  const colourBands=stationPatronageVolumeBands((excludeHubs?ordinary:published)
    .map(st=>st.value));
  const nodes=[],paths=[],shown=new Set(),mainX=58,branchX=412,top=68,step=47;
  function add(stop,x,y,service=plan.line) {
    const key=stopNameKey(stop);
    if(shown.has(key))return;
    shown.add(key);
    const station=catalogue.get(key);
    const record=station?recorded.get(station.id):null;
    const hubExcludedFromScale=excludeHubs && patronageHubKeys.has(key);
    const heatIntensity=record
      ? Math.sqrt(Math.min(1,Math.max(0,record.value)/gradientMaximum)):0;
    // A designated hub is neutral and fixed-size, not a red/oversized
    // outlier. Non-hubs use the SAME hub-free reference for size and colour.
    // A published zero still has a small filled marker; missing stays hollow.
    const markerSize=!record?16:hubExcludedFromScale?18:
      Math.round(12+14*heatIntensity);
    nodes.push({
      id:station?.id??null, name:station?.name??stop, lines:station?.lines||[],
      entries:record?.entries??null, exits:record?.exits??null,
      value:record?.value??null, unreported:!record, unmatched:!station,
      x,y,service,intensity:record?Math.sqrt(Math.max(0,record.value)/max):0,
      heatIntensity,markerSize,hubExcludedFromScale,
      colourBand:record?colourBands.get(record.value)??null:null,
      visualColour:record
        ? (hubExcludedFromScale?'#e4e9ef':PATRONAGE_VISUAL_COLOURS[
            colourBands.get(record.value)??0]):null,
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
  return {nodes,paths,width:820,height:highest+72,maximum:max,
    gradientMaximum,excludedHubCount,hubScaleExclusionActive:excludeHubs,
    flipped:!!flip,
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
    const radius=(st.markerSize??(st.value===null?18:14+18*st.intensity))/2;
    const displayHeat=st.visualColour??(st.hubExcludedFromScale
      ? '#e4e9ef' : patronageHeatColour(st.heatIntensity??st.intensity));
    const group=svgNode('g',{
      class:'sp-diagram-stop'+(st.value===null?' sp-diagram-missing':'')+
        (st.hubExcludedFromScale?' sp-diagram-hub':'')+
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
          ';--sp-heat-colour:'+displayHeat}),
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
    const excludedHub=!missing&&st.hubExcludedFromScale;
    const fill=st.visualColour??(excludedHub?'#e4e9ef':
      patronageHeatColour(st.heatIntensity??st.intensity));
    const markerSize=st.markerSize??(missing?16:18);
    const label=missing?(st.unmatched?'No catalogue match':'Not published'):number(st.value);
    const routeColour=colour(st.service==='T4_SCO'?'T4':st.service||plan.line);
    const muted=term&&!st.name.toLowerCase().includes(term);
    const item=node('li',{class:'sp-route-stop'+
      (excludedHub?' sp-route-hub':'')+(muted?' sp-route-dim':''),
      style:'--sp-route-colour:'+routeColour});
    const body=node('button',{type:'button',class:'sp-route-stop-button',
      'aria-label':st.name+', '+label+' '+metric+
        (excludedHub?', major interchange excluded from colour and size scale':'')+
        (st.id?', show station details':''),
      'aria-pressed':String(st.id===selectedId),
      ...(st.id?{}:{disabled:'disabled'})},
      node('span',{class:'sp-route-dot'+(missing?' sp-route-dot-missing':'')+
        (excludedHub?' sp-route-dot-hub':''),
        style:'--sp-marker-size:'+markerSize+'px;border-color:'+routeColour+
          (missing?'':';background-color:'+fill),
        'aria-hidden':'true'}),
      node('span',{class:'sp-route-text'},
        node('span',{class:'sp-route-name'},st.name),
        excludedHub?node('span',{class:'sp-route-hub-tag',
          title:'Not used to calculate colour or marker size'},'Hub'):null,
        node('span',{class:'sp-route-amount'+(missing?' sp-route-amount-missing':'')+
          (excludedHub?' sp-route-amount-hub':''),
          style:missing?'':('background-color:'+fill+';color:'+
            (excludedHub?'#354154':patronageHeatTextColour(fill)))},label)));
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
  const recentAnnual=annualStationPatronage(data,'monthly');
  const historicalAnnual=annualStationPatronage(data,'legacyMonthly');
  const displayData={...data,annualMonthly:recentAnnual.totals,
    annualLegacyMonthly:historicalAnnual.totals};
  const f = { period: months.length ? 'monthly' : samples.length ? 'windows' : years.length ? 'typical' : 'historical',
    year: years.at(-1) || '2023',annualYear:recentAnnual.years.at(-1)||historicalAnnual.years.at(-1)||'',
    sample:samples.at(-1)||'2023',
    day: 'weekday', hour: '8', window:'06-10', month:months.at(-1)||legacyMonths.at(-1)||'',
    metric: 'total', line: 'all', route:'', direction:'forward',
    sort:'patronage', view:'list', diagramFlip:false, search:'', station: null };
  const heading = node('header', { class: 'sp-heading' },
    node('p', { class: 'sp-eyebrow' }, 'Opal station activity'),
    node('h1', {}, 'Station patronage'),
    node('p', { class: 'sp-intro' },
      'Compare monthly and annual station entries and exits by rail line and corridor.'),
    node('p', { class: 'sp-scope-summary' },
      node('strong', {}, 'Historical Opal taps, not live crowding. '),
      'Counts do not identify passenger direction or a specific train.'),
    node('details', { class: 'sp-methodology-disclosure' },
      node('summary', {}, 'How to interpret station and corridor figures'),
      node('p', {},
        'T4 and South Coast corridors follow station order, including interchanges and branches. '+
        'Inbound/outbound changes display order only. Entries and exits cannot identify '+
        'a journey direction, train service or the number aboard a particular line.')));
  const recent = recentMonthlyStatus(data);
  heading.append(node('section', {
    class: 'sp-source-status' + (recent.hasRecent ? ' sp-source-status-current' : ' sp-source-status-missing'),
    role: 'status', 'aria-label': 'Latest monthly station data status',
  },
    node('strong', {}, recent.hasRecent
      ? 'Latest Opal month: '+recent.latestMonth : recent.title),
    node('span', { class: 'sp-source-date' }, recent.details),
    !recent.hasRecent ? node('a', {
      href: sourceData, target: '_blank', rel: 'noopener noreferrer',
    }, 'View TfNSW monthly station dataset') : null,
  ));
  const form = node('div', { class: 'sp-controls' });
  const content = node('div', { class: 'sp-content' });
  const notes = node('section', { class: 'sp-notes' },
    node('h2', {}, 'Source and limitations'),
    node('p', {}, 'Source: Transport for NSW Opal-derived station entries and exits. Historical typical-day figures average three sampled weekdays, including three distinct 2020 periods. Source windows are 06–10, 10–15, 15–19, 19–06 and published 24-hour totals, not hourly counts. Annual views sum only published months from one source and never fill missing station-months as zero. Historical and newer monthly totals use different methods, so 2024 must be viewed separately by source. Suppressed counts below 50 remain missing, not zero.'),
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
    heading.append(node('details', { class: 'sp-warning sp-unmatched-details' },
      node('summary', {},
        number(data.coverage.unmatchedCount)+' source station names could not be matched'),
      node('p', {},
        'These source names were excluded because they could not be uniquely matched to the station catalogue. '+
        'The importer must reconcile them before their figures are accepted. Verified station values are unchanged.')));
  }

  function renderControls() {
    const allMonthly = f.period === 'historical' ? legacyMonths : months;
    if(allMonthly.length && !allMonthly.includes(f.month))f.month=allMonthly.at(-1);
    const activeAnnual=f.period==='historical-annual'?historicalAnnual:recentAnnual;
    if((f.period==='annual'||f.period==='historical-annual') &&
      !activeAnnual.years.includes(f.annualYear))f.annualYear=activeAnnual.years.at(-1)||'';
    const controls = [
      field('Dataset', [
        ...(samples.length ? [['windows','Historic sampled day (time windows)']] : []),
        ...(years.length ? [['typical', 'Historical hourly sample (separate source)']] : []),
        ...(legacyMonths.length ? [['historical','Monthly history 2016–2024']] : []),
        ...(historicalAnnual.years.length ? [['historical-annual','Annual history 2016–2024']] : []),
        ...(months.length ? [['monthly', 'Recent monthly totals']] : []),
        ...(recentAnnual.years.length ? [['annual','Recent annual totals']] : []),
      ], f.period, v => { f.period = v; f.station = null; render(); }),
      f.period === 'windows'
        ? field('Historical sample', samples.map(x => [x, x]), f.sample, v => {f.sample=v;f.station=null;render();})
        : f.period === 'typical'
          ? field('Historical year', years.map(x => [x, x]), f.year, v => { f.year = v; f.station = null; render(); })
          : f.period === 'annual'||f.period==='historical-annual'
            ? field('Calendar year',activeAnnual.years.map(x=>[x,
                x+(activeAnnual.coverage[x]?.completeYear?'':' · partial')]),
              f.annualYear,v=>{f.annualYear=v;f.station=null;render();})
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
      field('Measure', [['entries', 'Entries'], ['exits', 'Exits'], ['total', 'Entries + exits']], f.metric, v => { f.metric = v; render(); })];
    // Passing a null conditional child to replaceChildren() generates visible
    // "null" text on mobile Safari. Filter disabled choices explicitly.
    form.replaceChildren(...controls.filter(Boolean));
  }

  function render() {
    renderControls();
    const selectedRoute=patronageRouteChoice(routes,f.line,f.route);
    const ordered=f.line!=='all' && selectedRoute.route;
    const listRows=ordered ? stationRouteRows(displayData,stations,routes,f) : patronageRows(displayData,stations,f);
    const plan=stationDiagramPlan(routes,f.line,f.route);
    const diagramColors=Object.fromEntries(lineItems.map(l=>[l.id,l.color]));
    const allObservations=plan ? patronageRows(displayData,stations,{...f,line:'all',search:''}) : [];
    const diagramModel=plan ? stationDiagramModel(plan,stations,allObservations,
      {flip:f.diagramFlip}) : null;
    // Summary cards use all unique plotted stations when both branches are shown;
    // the selected route/list subset would otherwise undercount the diagram.
    const rows=f.view==='diagram' && diagramModel ? diagramModel.nodes : listRows;
    const published=rows.filter(r=>r.value!==null);
    const metric = f.metric === 'total' ? 'entries plus exits' : f.metric;
    const sample = f.period === 'typical', broadSample=f.period==='windows';
    const activeAnnual=f.period==='historical-annual'?historicalAnnual:recentAnnual;
    const annualMode=f.period==='annual'||f.period==='historical-annual';
    const yearCoverage=annualMode?activeAnnual.coverage[f.annualYear]:null;
    const annualSource=f.period==='historical-annual'?'historical':'recent';
    const periodDescription = broadSample
      ? f.sample + ' sampled typical weekday, ' + ({
          '06-10':'06:00–10:00','10-15':'10:00–15:00','15-19':'15:00–19:00',
          '19-06':'19:00–06:00','24h':'published 24-hour total'
        }[f.window]||f.window)
      : sample ? f.year + ' sampled typical ' + f.day + ', ' + (f.hour === 'all' ? 'all recorded hours' : String(f.hour).padStart(2, '0') + ':00–' + String(f.hour).padStart(2, '0') + ':59')
      : annualMode ? f.annualYear+' · '+(yearCoverage?.completeYear?'full calendar year':'partial year')+
        ' ('+(yearCoverage?.monthCount||0)+'/12 published months, '+annualSource+' source)'
      : f.month + ' whole-month totals';
    const totals = published.reduce((a,r)=>a+r.value,0);
    const headline = node('section', { class: 'sp-overview' },
      cardValue('Data period', periodDescription,
        sample||broadSample?'Historical typical-day average':annualMode?'Sum of available monthly Opal counts':'Monthly Opal totals'),
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
    const annualNote=annualMode?node('p',{class:'sp-annual-note',role:'status'},
      yearCoverage?.completeYear
        ? 'Full '+f.annualYear+' calendar year. Stations missing any published month are shown as unavailable.'
        : 'Partial '+f.annualYear+' year: '+(yearCoverage?.monthCount||0)+
          ' published months ('+(yearCoverage?.months?.[0]||'unknown')+' to '+
          (yearCoverage?.months?.at(-1)||'unknown')+
          '), not a full calendar year. Stations missing any included month are shown as unavailable.',
      ' '+(yearCoverage?.missingStationCount||0)+' station'+
        (yearCoverage?.missingStationCount===1?'':'s')+' withheld for incomplete month coverage. '+
        (f.period==='historical-annual'?'Historical source only.':'Recent source only.')+
        ' Sources use different methods and are never mixed.') : null;
    content.replaceChildren(...[headline,annualNote,toggle,lower].filter(Boolean));
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
        node('div',{class:'sp-diagram-quick-guide'},
          node('div',{class:'sp-diagram-nine-band',role:'group',
            'aria-label':'Nine relative patronage volume bands, from lower to higher'},
            node('span',{class:'sp-band-label'},'Less'),
            ...PATRONAGE_VISUAL_COLOURS.map((colour,i)=>
              node('span',{class:'sp-band-swatch',style:'background-color:'+colour,
                title:['Lowest','Very low','Low','Lower middle','Middle',
                  'Upper middle','High','Very high','Highest'][i]+' relative station patronage',
                'aria-label':['Lowest','Very low','Low','Lower middle','Middle',
                  'Upper middle','High','Very high','Highest'][i]+' patronage band'})),
            node('span',{class:'sp-band-label'},'More')),
          node('span',{class:'sp-diagram-guide-note'},
            'Nine volume bands; grey = one of five excluded stations.')),
        search,
        node('details',{class:'sp-diagram-explainer'},
          node('summary',{},'About this diagram, colours and data'),
          node('p',{},'Main corridor: '+topStation+' → '+bottomStation+
            '. Flip changes stop order, not where passengers travelled. Branches connect at their junctions.'),
          node('p',{},'Nine colour bands show relative station tap volume using a square-root scale against '+
            'the busiest included station. They are not nine equal-count groups or equal-number-of-stations groups. '+
            'The warmer orange and red end highlights higher patronage. '+
            'Both colour and circle size reflect station tap counts; the exact published counts appear beside each station.'),
          node('p',{},'Missing/suppressed values use a hollow marker; a published zero remains a filled marker. '+
            'Counts describe station-level Opal taps, not a live train, boarding direction or timetable.'),
          node('p',{},'Martin Place, Town Hall, Central, Redfern and Sydenham alone are excluded from visual comparisons. '+
            number(diagramModel.excludedHubCount)+' published excluded stations are on this corridor; '+
            'their exact figures remain visible. Other interchange stations remain included.')),
        node('div',{class:'sp-diagram-scroll'}),
      );
    }

    function updateResults() {
      const visible = ordered ? stationRouteRows(displayData,stations,routes,f)
        : patronageRows(displayData,stations,f);
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
        detail.append(node('p', {}, 'Choose a different month, calendar year, rail line or station.'));
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
