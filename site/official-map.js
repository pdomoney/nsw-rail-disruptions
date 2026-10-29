import {reconcilePdfStations,REFERENCE_2024_ROUTES,OFFICIAL_LINE_PALETTE,nearestPdfSymbol} from './official-vector-stops.js';
import {reportedSouthwestMetroProjected} from './metro-southwest.js';

// The official TfNSW published network PDF is rendered at deployment time.
// Calibration is to the 2024 first-page artwork, in image units 1024 x 1447.
// This is schematic, not geographic: never project train GPS directly on the PDF.
// Unmatched vehicles remain absent, rather than guessing a location.
// Resolve relative to this published module, not the browser's current page URL.
// Home Screen apps and fragment navigation must use the same asset location.
export function officialMapAssetUrl(moduleUrl = import.meta.url) {
  return new URL('assets/tfnsw-sydney-rail-2024.png?asset=verified-render-v3', moduleUrl).href;
}
export const OFFICIAL_MAP = Object.freeze({
  width: 1024, height: 1447, edition: '30 September 2024',
  // Revised URL also bypasses cached 404 responses from the broken release.
  image: officialMapAssetUrl(),
  source: 'https://transportnsw.info/sydney-trains-network-map',
  licence: 'https://creativecommons.org/licenses/by/4.0/',
});

// Marker positions manually calibrated against the official PDF page (not GTFS coordinates).
// Store only positively identified railway/metro stops and do not infer new line extensions.
// Coordinates may be refined after browser overlay alignment review.
export const OFFICIAL_STOPS = Object.freeze({
  'Berowra': [519,218], 'Hornsby': [515,299], 'Gordon': [606,404], 'Asquith':[519.8,278.6], 'Waitara':[538.6,327.7],
  'Chatswood': [660,454], 'Denistone':[513,494.4], 'West Ryde':[513,522.6], 'North Strathfield':[513,633.4], 'North Sydney': [744,521], 'Roseville':[653.8,442.9], 'Milsons Point': [747,551], 'Artarmon':[683.2,472.2], 'Lindfield':[639.4,428.5],
  'Epping': [512,437], 'Tallawong': [219,422], 'Rouse Hill': [252.9,421.5],
  'Kellyville': [280.1,421.5], 'Bella Vista':[307.2,421.5],
  'Norwest': [334.4,421.5], 'Hills Showground':[361.6,421.5],
  'Castle Hill':[388.8,421.5], 'Cherrybrook':[416,421.5],
  'Macquarie University': [565.4,455.1], 'Macquarie Park':[596.9,455.1],
  'North Ryde':[628.4,455.1],
  'Crows Nest': [705,490], 'Victoria Cross': [735,543], 'Barangaroo': [739,584],
  'Martin Place': [786,621], 'Gadigal': [785,643], 'Central': [766,675],
  'Town Hall': [766,638], 'Wynyard': [766,604], 'Kings Cross':[859.0,628.2],
  'Circular Quay': [795,571], 'St James': [849,637], 'Museum': [810,673],
  'Redfern': [736,694], 'Sydenham': [705,781], 'Waterloo': [766,709],
  'Erskineville':[727.3,735], 'St Peters':[709.8,752.4],
  'Richmond': [155,315], 'Windsor': [155,376], 'Clarendon':[157,355.2], 'Schofields': [155,455], 'Quakers Hill':[157,476.8], 'Marayong':[161.7,496.1],
  'Emu Plains': [98,573.2], 'Penrith':[115.6,573.2], 'Kingswood':[132.5,573.2], 'Werrington':[149.5,573.2], 'St Marys':[164.8,573.2], 'Mount Druitt':[181.5,573.2], 'Rooty Hill':[198.4,573.2], 'Doonside':[215.4,573.2], 'Toongabbie':[276,573.2], 'Pendle Hill':[293,573.2], 'Wentworthville':[318.7,579.5], 'Westmead':[328.5,589.4],
  'Blacktown': [242,574], 'Parramatta': [359.6,630],
  'Strathfield': [519.8,702.1], 'Flemington':[486.4,708.9], 'Croydon':[553.1,708.9], 'Ashfield':[569.8,708.9], 'Petersham':[619.8,708.9], 'Stanmore':[636.5,708.9], 'Newtown':[653.1,708.9], 'Macdonaldtown':[669.8,708.9], 'Lidcombe': [448,703], 'Olympic Park': [468,617],
  'Granville': [385.9,646.8], 'Merrylands': [311,702.1],
  'Auburn':[405.2,675.5], 'Guildford':[297.4,717.7], 'Fairfield':[296.4,762.7],
  'Yennora':[296.4,735.7], 'Casula':[296.4,905.5],
  'Regents Park': [441,770], 'Bankstown': [479,827], 'Berala':[447.8,747.0], 'Birrong':[456.9,795.3], 'Sefton':[426.6,790.3], 'Villawood':[361.4,790.3], 'Carramar':[339.6,790.3],
  'Cabramatta': [294,818], 'Liverpool': [294,868], 'Glenfield': [294,940],
  'Leppington': [130,967], 'Campbelltown': [302,1095], 'Macarthur': [302,1125],
  'Bondi Junction': [897,628], 'International Airport': [751.5,812.8],
  'Domestic Airport': [767,803], 'Mascot': [767,769],
  'Wolli Creek': [690,824], 'Hurstville': [689,966], 'Arncliffe':[690.1,845.1], 'Kirrawee':[757.9,1102.9], 'Woolooware':[839.4,1102.9],
  'Sutherland': [689,1090], 'Cronulla': [894,1101], 'Waterfall': [689,1177],
  'East Hills': [379.7,921.8], 'Edmondson Park':[171.8,966.6], 'Green Square':[767.6,740.6], 'Macquarie Fields':[303.1,987], 'Ingleburn':[303.1,1014.1], 'Holsworthy':[350.7,921.8], 'Panania':[408.6,921.8], 'Revesby':[437.5,921.8], 'Padstow':[466.4,921.8], 'Riverwood':[495.3,921.8], 'Narwee':[524.2,921.8], 'Beverly Hills':[551.4,910.8], 'Kingsgrove':[572.3,889.9], 'Bexley North':[593.2,869], 'Bardwell Park':[614.1,848.1], 'Turrella':[635,827.3],
});
// On the original artwork, city interchange lines run side-by-side at different
// x coordinates. These override the station-wide tap target for the *train* icon.
// They are not separate stations, nor geospatial lat/lon.
export const OFFICIAL_LINE_STOPS = Object.freeze({
  T1: { 'Central':[744,676], 'Town Hall':[744,638], 'Wynyard':[744,604] },
  T2: { 'Central':[750,676], 'Town Hall':[750,638], 'Wynyard':[750,604] },
  T3: { 'Central':[754,676], 'Town Hall':[754,638], 'Wynyard':[754,604] },
  T4: { 'Central':[779,676], 'Town Hall':[781,638], 'Martin Place':[785,622] },
  T8: { 'Central':[759,676], 'Town Hall':[759,638], 'Wynyard':[759,604] },
  M1: { 'Central':[785,676], 'Gadigal':[785,644], 'Martin Place':[785,621],
    'Waterloo':[768,708], 'Sydenham':[704,781] },
});
// Every sequence follows stations printed on the 2024 map. No extrapolation past last anchor.
// A given train must be close to the corresponding geographical stop-to-stop line.
export const OFFICIAL_CORRIDORS = Object.freeze({
  T1: [
    ['Richmond','Windsor','Schofields','Blacktown','Parramatta','Strathfield','Central','Town Hall','Wynyard','Milsons Point','North Sydney','Chatswood','Gordon','Hornsby','Berowra'],
    ['Blacktown','Parramatta','Strathfield','Central'],
  ],
  T2: [['Leppington','Glenfield','Liverpool','Cabramatta','Merrylands','Granville','Lidcombe','Strathfield','Central','Town Hall','Wynyard','Circular Quay']],
  T3: [['Liverpool','Cabramatta','Regents Park','Lidcombe','Strathfield','Central','Town Hall','Wynyard']],
  T4: [['Bondi Junction','Martin Place','Town Hall','Central','Redfern','Sydenham','Wolli Creek','Hurstville','Sutherland','Cronulla'],
       ['Sutherland','Waterfall']],
  T5: [['Richmond','Blacktown','Parramatta','Merrylands','Cabramatta','Liverpool','Glenfield','Leppington']],
  T6: [['Bankstown','Regents Park','Lidcombe']],
  T7: [['Olympic Park','Lidcombe']],
  T8: [['Macarthur','Campbelltown','Glenfield','East Hills','Wolli Creek','International Airport','Domestic Airport','Mascot','Central','Town Hall','Wynyard']],
  T9: [['Hornsby','Epping','Strathfield','Central','Wynyard','North Sydney','Chatswood','Gordon']],
  M1: [['Tallawong','Rouse Hill','Kellyville','Norwest','Epping','Macquarie University','Chatswood','Crows Nest','Victoria Cross','Barangaroo','Martin Place','Gadigal','Central','Waterloo','Sydenham']],
});

// Named station locations now snap to actual station-symbol curves extracted from
// the SAME original 2024 TfNSW PDF as the published image. Do not draw arbitrary
// straight-line route geometry over the source. Unknown points remain unavailable.
export const PDF_STATION_CROSSWALK = reconcilePdfStations(OFFICIAL_STOPS,REFERENCE_2024_ROUTES);
export const PDF_STATION_COVERAGE = Object.freeze({
  pdfSymbols: 277,
  namedMatches: PDF_STATION_CROSSWALK.positions.size,
  verifiedAnchorCount: PDF_STATION_CROSSWALK.evidence.filter(e=>e.method==='vector-anchor').length,
  matchedIntermediateCount: PDF_STATION_CROSSWALK.evidence.filter(e=>e.method==='vector-intermediate').length,
  unmatchedSourceNames: PDF_STATION_CROSSWALK.unmatched.length
});

export function normaliseStop(name) {
  return String(name || '').normalize('NFKC').toLowerCase()
    .replace(/\bstation\b/g, '').replace(/[^\p{L}\p{N}]+/gu, '');
}
const D2 = (a,b) => (a[0]-b[0])**2+(a[1]-b[1])**2;
export function projectToSegment(p, a, b) {
  const dx = b[0]-a[0], dy = b[1]-a[1];
  const d = dx*dx+dy*dy;
  if (d < 1e-6) return null;
  const t = Math.max(0, Math.min(1, ((p[0]-a[0])*dx+(p[1]-a[1])*dy)/d));
  return { t, distance: Math.sqrt(D2(p,[a[0]+dx*t,a[1]+dy*t])) };
}

export function buildOfficialAlignment(network) {
  const geo = new Map();
  for (const row of network?.stations || []) {
    const [name, x, y, ids] = row;
    if (Number.isFinite(x) && Number.isFinite(y))
      geo.set(normaliseStop(name), { xy:[x,y], lines:new Set(String(ids||'').split(' ')) });
  }
  const segments = {};
  for (const [id, routes] of Object.entries(OFFICIAL_CORRIDORS)) {
    const edges=[];
    for (const route of routes) {
      // Missing stops break an alignment. Never bridge an undocumented gap.
      for (let i=1; i<route.length; i++) {
        const from = route[i-1], to=route[i], a=geo.get(normaliseStop(from)), b=geo.get(normaliseStop(to));
        if (!a || !b || !OFFICIAL_STOPS[from] || !OFFICIAL_STOPS[to]) continue;
        if (!a.lines.has(id) || !b.lines.has(id)) continue;
        const override = OFFICIAL_LINE_STOPS[id] || {};
        edges.push({ from, to, geoA:a.xy, geoB:b.xy,
          pdfA:override[from] || OFFICIAL_STOPS[from], pdfB:override[to] || OFFICIAL_STOPS[to] });
      }
    }
    segments[id]=edges;
  }
  return segments;
}
// Full TfNSW station-to-station evidence alignment, not broad hand-drawn corridors.
// Both endpoints must exist as original PDF vector symbols on the SAME line.
// The realtime feed's geographic coordinates determine fractional progress.
export function buildVerifiedPdfAlignment(network, crosswalk=PDF_STATION_CROSSWALK) {
  const geo=new Map();
  for(const [name,x,y,lines] of network?.stations||[])
    if(Number.isFinite(x)&&Number.isFinite(y))
      geo.set(normaliseStop(name),{point:[x,y],lines:new Set(String(lines).split(' '))});
  const result={};
  for(const [line,routes] of Object.entries(REFERENCE_2024_ROUTES)) {
    const printed=crosswalk.byLine.get(line) || new Map();
    const segments=[];
    for(const route of routes)for(let i=1;i<route.length;i++){
      const from=route[i-1],to=route[i],a=geo.get(normaliseStop(from)),b=geo.get(normaliseStop(to));
      if(!a||!b||!a.lines.has(line)||!b.lines.has(line))continue;
      if(!printed.has(from)||!printed.has(to))continue;
      const pdfA=printed.get(from),pdfB=printed.get(to);
      // Duplicate/near-coincident marks cannot support a usable progress bearing.
      if(Math.hypot(pdfB[0]-pdfA[0],pdfB[1]-pdfA[1])<2)continue;
      segments.push({from,to,geoA:a.point,geoB:b.point,pdfA,pdfB});
    }
    result[line]=segments;
  }
  return result;
}

export function locateOfficialTrain(train, alignment, maxDistance = 125) {
  const [line,x,y]=train;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  // The September 2024 PDF does not depict the Sydenham-to-Bankstown M1.
  // Never snap a Southwest vehicle to the old Sydenham terminus.
  if(line==='M1'&&reportedSouthwestMetroProjected(x,y))return null;
  let nearest=null;
  for (const edge of alignment[line] || []) {
    const projection=projectToSegment([x,y],edge.geoA,edge.geoB);
    if (!projection) continue;
    if (!nearest || projection.distance < nearest.distance) nearest={...projection,edge};
  }
  if (!nearest || nearest.distance>maxDistance) return null;
  const {pdfA,pdfB,from,to}=nearest.edge, t=nearest.t;
  return {x:pdfA[0]+(pdfB[0]-pdfA[0])*t,y:pdfA[1]+(pdfB[1]-pdfA[1])*t,
    distanceMetres:Math.round(nearest.distance*10),from,to,confidence: 'approximate'};
}

// Mark only incidents explicitly naming a station on the printed source map.
// Corridor-wide closures remain in the incident list; we never invent a route trace.
export function officialDisruptionPins(live, lineFilter='', crosswalk=PDF_STATION_CROSSWALK) {
  const index = new Map([...crosswalk.positions].map(([name,xy])=>[normaliseStop(name),{name,xy}]));
  const pins=[],seen=new Set();
  for (const overlay of live?.overlays || []) {
    if (lineFilter && !(overlay.lines || []).includes(lineFilter)) continue;
    for (const p of [...(overlay.pins || []),...(overlay.spins || [])]) {
      const name=p[2], station=index.get(normaliseStop(name));
      if (!station) continue;
      const id=overlay.kind+'|'+station.name;
      if (seen.has(id)) continue;
      seen.add(id);
      pins.push({...station,kind:overlay.kind,title:overlay.title || 'Reported rail disruption'});
    }
  }
  return pins;
}

// The old app used HEAD plus content-type, and rejected the map without ever
// decoding it. iOS browsers and intermediary caches may handle HEAD differently
// from images. Preflight the same GET-backed URL the SVG will actually display.
export function loadOfficialMapImage(url, createImage = () => new Image(), timeoutMs = 15_000) {
  return new Promise(resolve => {
    const img = createImage();
    let finished = false;
    const finish = ok => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      img.onload = null;
      img.onerror = null;
      resolve(ok);
    };
    img.onload = () => finish(img.naturalWidth >= 1024 && img.naturalHeight >= 1400);
    img.onerror = () => finish(false);
    const timer = setTimeout(() => finish(false), timeoutMs);
    img.src = url;
  });
}

// One tooltip content model for both SVG maps. Browser-native SVG <title>
// bubbles do not share the application's formatting and omit delay/occupancy.
export function mapTrainHoverRows({ line, headsign, delay, pax }) {
  const destination = headsign ? String(headsign).replace(/\s+Station$/i, '') : '';
  return [
    { value: 'MOVING ' + line + (destination ? ' to ' + destination : '') },
    { label: delay == null ? 'No delay reported' : delay < 60
      ? 'On time' : Math.round(delay / 60) + ' min late' },
    { label: pax == null ? 'Occupancy not reported'
      : 'About ' + Math.round(pax / 10) * 10 + ' people aboard (estimate)', muted: true },
  ];
}

const svgNS='http://www.w3.org/2000/svg';
function el(tag, attrs={}) {
  const n=document.createElementNS(svgNS,tag);
  for (const [k,v] of Object.entries(attrs)) if(v!=null)n.setAttribute(k,String(v));
  return n;
}
const colors={early:'#2a9d58',onTime:'#1f8a56',minor:'#aa7513',late:'#d65b22',severe:'#a82730',unknown:'#536675'};
const delayColor=delay=>delay==null?colors.unknown:delay<120?colors.onTime:delay<300?colors.minor:delay<600?colors.late:colors.severe;
export function drawOfficialOverlay(container,{network,live,view='sydney',lineFilter='',vb:zoom=null,onTrainSelect,onStationSelect,onTrainHover,onHoverEnd,imageUrl=OFFICIAL_MAP.image}) {
  const W=Math.max(310,container.clientWidth);
  const allowed=view==='city'?[595,400,380,540]:[0,0,OFFICIAL_MAP.width,OFFICIAL_MAP.height];
  const ratio=allowed[3]/allowed[2];
  const H=Math.round(Math.min(1550,Math.max(view==='city'?540:450,W*ratio)));
  const base=allowed.slice();
  const frame=zoom||base;
  const scale=W/frame[2];
  const unit=px=>px/scale;
  const svg=el('svg',{viewBox:frame.join(' '),width:W,height:H,
    class:'map-svg official-tfnsw-svg'+(zoom?' zoomed':''),
    role:'group','aria-label':'Original Transport for NSW 2024 Sydney rail network map with separately added live train symbols'});
  // Whole PDF page is a single authored background: no redraw or tracing of TfNSW routes.
  svg.append(el('image',{href:imageUrl,x:0,y:0,width:OFFICIAL_MAP.width,
    height:OFFICIAL_MAP.height,preserveAspectRatio:'none',class:'official-source-map'}));
  const alignment=buildVerifiedPdfAlignment(network);
  const selected=new Set((REFERENCE_2024_ROUTES[lineFilter]||[]).flat());
  const stationLayer=el('g',{class:'official-station-hits'});
  const hitRadius=Math.max(unit(11),3);
  for (const [name,pos] of PDF_STATION_CROSSWALK.positions) {
    if(lineFilter && !selected.has(name)) continue;
    const c=el('circle',{cx:pos[0],cy:pos[1],r:hitRadius,
      class:'official-station-target','aria-label':'Fixed station '+name,tabindex:'0',role:'button'});
    c.addEventListener('click',()=>onStationSelect?.(name,lineFilter?[lineFilter]:[]));
    c.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onStationSelect?.(name,lineFilter?[lineFilter]:[])}});
    stationLayer.append(c);
  }
  svg.append(stationLayer);
  // Affected named stations only, not guessed affected corridors. The incident
  // panel below the map retains full descriptions and unpositioned alerts.
  const disruptions=el('g',{class:'official-disruption-markers'});
  for (const pin of officialDisruptionPins(live,lineFilter)) {
    const icon=el('circle',{cx:pin.xy[0],cy:pin.xy[1],r:unit(12),
      fill:'none',stroke:pin.kind==='closed'?'#a66c15':'#ce4226',
      'stroke-width':unit(3),class:'official-disruption',role:'img',
      'aria-label':pin.kind+' at '+pin.name+'. '+pin.title});
    const title=el('title');title.textContent=pin.kind+' at '+pin.name+': '+pin.title;
    icon.append(title);disruptions.append(icon);
  }
  svg.append(disruptions);
  const trainLayer=el('g',{class:'official-train-markers'});
  const positioned=[];
  let unmatched=0;
  for(const train of live?.trains||[]){
    const [line,,,delay,pax,fullest,,headsign]=train;
    if(lineFilter&&line!==lineFilter)continue;
    if(!REFERENCE_2024_ROUTES[line])continue; // intercity not shown on the printed map
    const pos=locateOfficialTrain(train,alignment);
    if(!pos){unmatched++;continue;}
    positioned.push({train,pos});
  }
  // A small deterministic spread separates coincident vehicles without inventing routes.
  const bucket=new Map();
  for(const {train,pos} of positioned){
    const [line,,,delay,pax,fullest,,headsign]=train;
    const key=Math.round(pos.x/5)+':'+Math.round(pos.y/5);
    const count=bucket.get(key)||0;bucket.set(key,count+1);
    
const jitter = count ? Math.min(5, count * 2) : 0;
const size = unit(view === 'city' ? 17 : 19);
const x = pos.x + jitter * unit(1);
const y = pos.y;
// Create the train marker
const g = el('g', {
  class: 'official-vehicle',
  transform: 'translate(' + x + ' ' + y + ')',
  tabindex: '0',
  role: 'button',
  'aria-label': 'Moving ' + line + ' train' +
    (headsign ? ' towards ' + headsign : '') +
    ', position estimated on 2024 map'
});
// Invisible 30px touch target for mobile usability
g.append(el('rect', {
  class: 'official-train-hit',
  x: -unit(15),
  y: -unit(15),
  width: unit(30),
  height: unit(30),
  rx: unit(6),
  fill: 'transparent'
}));
// Smaller train body using the official line colour
g.append(el('rect', {
  class: 'official-train-body',
  x: -size / 2,
  y: -size / 2,
  width: size,
  height: size,
  rx: unit(3.8),
  fill: OFFICIAL_LINE_PALETTE[line] || '#526777',
  stroke: '#ffffff',
  'stroke-width': unit(1.6)
}));
// Smaller delay status indicator
g.append(el('circle', {
  cx: size * 0.40,
  cy: -size * 0.35,
  r: unit(3.1),
  fill: delayColor(delay),
  stroke: '#ffffff',
  'stroke-width': unit(1)
}));
// Train window
g.append(el('rect', {
  x: -size * 0.29,
  y: -size * 0.33,
  width: size * 0.58,
  height: size * 0.22,
  rx: unit(1.2),
  fill: '#ffffff'
}));
// Smaller train line identifier
const label = el('text', {
  x: 0,
  y: size * 0.28,
  'font-size': unit(7.2),
  fill: '#ffffff',
  'text-anchor': 'middle',
  'font-family': 'Arial,sans-serif',
  'font-weight': 'bold'
});
label.textContent = line;
g.append(label);
    // Use the same styled application hover card as the legacy train markers.
    // SVG <title> has been removed: its browser tooltip is inconsistent and
    // omits both delay and occupancy. Retain aria-label and click details.
    const hoverRows=mapTrainHoverRows({line,headsign,delay,pax});
    const showHover=e=>{
      if(e.pointerType==='touch' || e.buttons) return;
      onTrainHover?.(hoverRows,e.clientX,e.clientY);
    };
    g.addEventListener('pointerenter',showHover);
    g.addEventListener('pointermove',showHover);
    g.addEventListener('pointerleave',()=>onHoverEnd?.());
    g.addEventListener('pointercancel',()=>onHoverEnd?.());
    g.addEventListener('focus',()=>{
      const rect=g.getBoundingClientRect();
      onTrainHover?.(hoverRows,rect.left+rect.width/2,rect.top);
    });
    g.addEventListener('blur',()=>onHoverEnd?.());
    const select=()=>{
      onHoverEnd?.();
      onTrainSelect?.(line+' '+(headsign?'towards '+headsign+'. ':'')+
        (delay==null?'Delay not reported. ':delay<60?'On time. ':Math.round(delay/60)+' minutes late. ')+
        'Shown approximately between '+pos.from+' and '+pos.to+' on the historical diagram.'+
        (pax!=null?' Estimated '+Math.round(pax)+' passengers aboard.':''));
    };
    g.addEventListener('click',select);
    g.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();select()}});
    trainLayer.append(g);
  }
  svg.append(trainLayer);
  container.replaceChildren(svg);
  return {svg,base,W,H,positioned:positioned.length,unmatched,
    namedStations:PDF_STATION_CROSSWALK.positions.size,
    pdfSymbols:PDF_STATION_COVERAGE.pdfSymbols};
}
