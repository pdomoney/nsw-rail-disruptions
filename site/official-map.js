import {reconcilePdfStations,REFERENCE_2024_ROUTES,OFFICIAL_LINE_PALETTE,nearestPdfSymbol} from './official-vector-stops.js';

// The official TfNSW published network PDF is rendered at deployment time.
// Calibration is to the 2024 first-page artwork, in image units 1024 x 1447.
// This is schematic, not geographic: never project train GPS directly on the PDF.
// Unmatched vehicles remain absent, rather than guessing a location.
export const OFFICIAL_MAP = Object.freeze({
  width: 1024, height: 1447, edition: '30 September 2024',
  image: 'assets/tfnsw-sydney-rail-2024.png',
  source: 'https://transportnsw.info/sydney-trains-network-map',
  licence: 'https://creativecommons.org/licenses/by/4.0/',
});

// Marker positions manually calibrated against the official PDF page (not GTFS coordinates).
// Store only positively identified railway/metro stops and do not infer new line extensions.
// Coordinates may be refined after browser overlay alignment review.
export const OFFICIAL_STOPS = Object.freeze({
  'Berowra': [519,218], 'Hornsby': [515,299], 'Gordon': [606,404],
  'Chatswood': [660,454], 'North Sydney': [744,521], 'Milsons Point': [747,551],
  'Epping': [512,437], 'Tallawong': [219,422], 'Rouse Hill': [252,422],
  'Kellyville': [285,422], 'Norwest': [368,422], 'Macquarie University': [565,454],
  'Crows Nest': [705,490], 'Victoria Cross': [735,543], 'Barangaroo': [739,584],
  'Martin Place': [786,621], 'Gadigal': [785,643], 'Central': [766,675],
  'Town Hall': [766,638], 'Wynyard': [766,604],
  'Circular Quay': [795,571], 'St James': [849,637], 'Museum': [810,673],
  'Redfern': [736,694], 'Sydenham': [705,781], 'Waterloo': [766,709],
  'Richmond': [155,315], 'Windsor': [155,376], 'Schofields': [155,455],
  'Blacktown': [242,574], 'Parramatta': [353,648],
  'Strathfield': [513,637], 'Lidcombe': [448,703], 'Olympic Park': [468,617],
  'Granville': [384,672], 'Merrylands': [291,706],
  'Regents Park': [441,770], 'Bankstown': [479,827],
  'Cabramatta': [294,818], 'Liverpool': [294,868], 'Glenfield': [294,940],
  'Leppington': [130,967], 'Campbelltown': [302,1095], 'Macarthur': [302,1125],
  'Bondi Junction': [899,636], 'International Airport': [767,822],
  'Domestic Airport': [767,803], 'Mascot': [767,769],
  'Wolli Creek': [690,824], 'Hurstville': [689,966],
  'Sutherland': [689,1090], 'Cronulla': [894,1101], 'Waterfall': [689,1177],
  'East Hills': [542,923],
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
  pdfSymbols: 266,
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

const svgNS='http://www.w3.org/2000/svg';
function el(tag, attrs={}) {
  const n=document.createElementNS(svgNS,tag);
  for (const [k,v] of Object.entries(attrs)) if(v!=null)n.setAttribute(k,String(v));
  return n;
}
const colors={early:'#2a9d58',onTime:'#1f8a56',minor:'#aa7513',late:'#d65b22',severe:'#a82730',unknown:'#536675'};
const delayColor=delay=>delay==null?colors.unknown:delay<120?colors.onTime:delay<300?colors.minor:delay<600?colors.late:colors.severe;
export function drawOfficialOverlay(container,{network,live,view='sydney',lineFilter='',vb:zoom=null,onTrainSelect,onStationSelect}) {
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
  svg.append(el('image',{href:OFFICIAL_MAP.image,x:0,y:0,width:OFFICIAL_MAP.width,
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
    const jitter=count?Math.min(8,count*3):0;
    const size=unit(26),x=pos.x+jitter*unit(1),y=pos.y;
    const g=el('g',{class:'official-vehicle',transform:'translate('+x+' '+y+')',tabindex:'0',role:'button',
      'aria-label':'Moving '+line+' train'+(headsign?' towards '+headsign:'')+', position estimated on 2024 map'});
    g.append(el('rect',{x:-size/2,y:-size/2,width:size,height:size,rx:unit(5),
      fill:OFFICIAL_LINE_PALETTE[line]||'#526777',stroke:'#ffffff','stroke-width':unit(2)}));
    // Small detached status badge uses delay, leaving the primary vehicle colour
    // equal to TfNSW's official line colour instead of being mistaken for a station.
    g.append(el('circle',{cx:size*.41,cy:-size*.37,r:unit(4),
      fill:delayColor(delay),stroke:'#ffffff','stroke-width':unit(1.2)}));
    g.append(el('rect',{x:-size*.32,y:-size*.36,width:size*.64,height:size*.26,
      rx:unit(1.5),fill:'#ffffff'}));
    const label=el('text',{x:0,y:size*.31,'font-size':unit(9),fill:'#ffffff',
      'text-anchor':'middle','font-family':'Arial,sans-serif','font-weight':'bold'});
    label.textContent=line;g.append(label);
    const title=el('title');
    title.textContent=line+' to '+(headsign||'destination not reported')+'. On-map position approximate between '+pos.from+' and '+pos.to;
    g.append(title);
    const select=()=>onTrainSelect?.(line+' '+(headsign?'towards '+headsign+'. ':'')+
       (delay==null?'Delay not reported. ':delay<60?'On time. ':Math.round(delay/60)+' minutes late. ')+
       'Shown approximately between '+pos.from+' and '+pos.to+' on the historical diagram.'+
       (pax!=null?' Estimated '+Math.round(pax)+' passengers aboard.':''));
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
