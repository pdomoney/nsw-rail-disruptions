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
  'Berowra': [519,218], 'Hornsby': [516,305], 'Gordon': [610,401],
  'Chatswood': [661,488], 'North Sydney': [730,548], 'Milsons Point': [748,579],
  'Epping': [511,467], 'Tallawong': [221,453], 'Rouse Hill': [254,452],
  'Kellyville': [282,452], 'Norwest': [371,452], 'Macquarie University': [554,479],
  'Crows Nest': [706,532], 'Victoria Cross': [723,562], 'Barangaroo': [741,611],
  'Martin Place': [785,630], 'Gadigal': [785,673], 'Central': [766,704],
  'Town Hall': [764,670], 'Wynyard': [744,633],
  'Circular Quay': [784,591], 'St James': [840,635], 'Museum': [805,691],
  'Redfern': [748,728], 'Sydenham': [693,801], 'Waterloo': [769,754],
  'Richmond': [153,316], 'Windsor': [155,374], 'Schofields': [157,424],
  'Blacktown': [244,573], 'Parramatta': [361,664],
  'Strathfield': [514,697], 'Lidcombe': [446,705], 'Olympic Park': [447,625],
  'Granville': [401,701], 'Merrylands': [292,735],
  'Regents Park': [442,771], 'Bankstown': [565,802],
  'Cabramatta': [299,819], 'Liverpool': [301,869], 'Glenfield': [302,941],
  'Leppington': [133,987], 'Campbelltown': [302,1092], 'Macarthur': [302,1124],
  'Bondi Junction': [896,567], 'International Airport': [738,802],
  'Domestic Airport': [738,776], 'Mascot': [738,748],
  'Wolli Creek': [691,824], 'Hurstville': [689,963],
  'Sutherland': [689,1120], 'Cronulla': [892,1129], 'Waterfall': [689,1206],
  'East Hills': [548,940],
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
        edges.push({ from, to, geoA:a.xy, geoB:b.xy, pdfA:OFFICIAL_STOPS[from], pdfB:OFFICIAL_STOPS[to] });
      }
    }
    segments[id]=edges;
  }
  return segments;
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
  const alignment=buildOfficialAlignment(network);
  const selected=new Set((OFFICIAL_CORRIDORS[lineFilter]||[]).flat());
  const stationLayer=el('g',{class:'official-station-hits'});
  const hitRadius=Math.max(unit(11),3);
  for (const [name,pos] of Object.entries(OFFICIAL_STOPS)) {
    if(lineFilter && !selected.has(name)) continue;
    const c=el('circle',{cx:pos[0],cy:pos[1],r:hitRadius,
      class:'official-station-target','aria-label':'Fixed station '+name,tabindex:'0',role:'button'});
    c.addEventListener('click',()=>onStationSelect?.(name,lineFilter?[lineFilter]:[]));
    c.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onStationSelect?.(name,lineFilter?[lineFilter]:[])}});
    stationLayer.append(c);
  }
  svg.append(stationLayer);
  const trainLayer=el('g',{class:'official-train-markers'});
  const positioned=[];
  let unmatched=0;
  for(const train of live?.trains||[]){
    const [line,,,delay,pax,fullest,,headsign]=train;
    if(lineFilter&&line!==lineFilter)continue;
    if(!OFFICIAL_CORRIDORS[line])continue; // intercity not shown on the source map
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
      fill:delayColor(delay),stroke:'#ffffff','stroke-width':unit(2)}));
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
  return {svg,base,W,H,positioned:positioned.length,unmatched};
}
