// 2026 TfNSW published rail diagram: a separate, bounded manual crosswalk.
// Source: https://transportnsw.info/sydney-trains-network-map
// Approved PDF SHA-256: 7877f5bed61ef5f04fbda86752ca1582732544752242ca4777e2e93b00662669
// Pixel positions use the source's 1024 x 1447 page reference frame.
// This is NOT a georeferencing transform. Only explicitly reviewed station
// pairs can support approximate GTFS-progress markers. No 2024 pixels are used.
export const PDF_2026_SHA256 =
  '7877f5bed61ef5f04fbda86752ca1582732544752242ca4777e2e93b00662669';
export const PDF_2026_EDITION = '30 October 2026';
export const STOP_PIXELS_2026 = Object.freeze({
  'Tallawong':[219,401], 'Rouse Hill':[247,401], 'Kellyville':[274,401],
  'Bella Vista':[302,401], 'Norwest':[330,401], 'Hills Showground':[357,401],
  'Castle Hill':[385,401], 'Cherrybrook':[412,401], 'Epping':[508,417],
  'Macquarie University':[564,436], 'Macquarie Park':[595,436],
  'North Ryde':[625,436], 'Chatswood':[696,459],
  'Crows Nest':[704,487], 'Victoria Cross':[733,520],
  'Barangaroo':[740,563], 'Martin Place':[780,599], 'Gadigal':[780,632],
  'Central':[758,652], 'Waterloo':[766,685], 'Sydenham':[690,749],
  'Marrickville':[665,766], 'Dulwich Hill':[641,785],
  'Hurlstone Park':[613,800], 'Canterbury':[583,800], 'Campsie':[555,800],
  'Belmore':[526,800], 'Lakemba':[498,800], 'Wiley Park':[468,800],
  'Punchbowl':[441,800], 'Bankstown':[418,824],
  'Lidcombe':[448,691], 'Berala':[448,728], 'Regents Park':[449,767],
  'Birrong':[450,797], 'Yagoona':[447,821], 'Olympic Park':[449,588],
  'Richmond':[155,296], 'East Richmond':[156,319],
  'Clarendon':[157,335], 'Windsor':[157,355], 'Mulgrave':[157,376],
  'Vineyard':[157,396], 'Riverstone':[157,415], 'Schofields':[157,435],
  'Quakers Hill':[158,456], 'Marayong':[163,478], 'Blacktown':[245,554],
  'Seven Hills':[271,554], 'Toongabbie':[296,554], 'Pendle Hill':[317,554],
  'Wentworthville':[340,573], 'Westmead':[357,596],
  'Parramatta':[372,614], 'Harris Park':[388,633],
  'Granville':[402,652], 'Clyde':[418,668], 'Auburn':[435,683],
  'Strathfield':[517,691], 'Burwood':[545,691],
  'Redfern':[740,663], 'Town Hall':[742,616], 'Wynyard':[741,581],
  'Milsons Point':[743,550], 'North Sydney':[741,525],
  'Gordon':[613,385], 'Hornsby':[520,278], 'Berowra':[520,200],
  'Leppington':[141,943], 'Edmondson Park':[186,943],
  'Glenfield':[302,943], 'Liverpool':[303,855],
  'Warwick Farm':[302,826], 'Cabramatta':[301,794],
  'Canley Vale':[301,770], 'Fairfield':[300,741],
  'Yennora':[300,715], 'Guildford':[313,692], 'Merrylands':[332,670],
  'Casula':[303,885], 'Campbelltown':[305,1069], 'Macarthur':[305,1096],
  'East Hills':[381,903], 'Holsworthy':[355,902],
  'Panania':[409,902], 'Revesby':[440,902], 'Padstow':[467,902],
  'Riverwood':[497,902], 'Narwee':[527,902], 'Beverly Hills':[555,902],
  'Wolli Creek':[689,796], 'Green Square':[766,719],
  'Mascot':[766,754], 'Domestic Airport':[766,793],
  'International Airport':[744,793], 'Bondi Junction':[838,603],
  'Kings Cross':[817,605], 'St James':[833,636],
  'Museum':[811,654], 'Circular Quay':[794,563],
  'Hurstville':[690,945], 'Sutherland':[690,1076],
  'Cronulla':[881,1076], 'Waterfall':[690,1147],
});
// The 2026 PDF uses particular strands at its major interchanges. Explicit
// line-specific offsets can be refined independently of the route-stop names.
export const PDF_2026_LINE_STOPS = Object.freeze({
  M1:Object.freeze({
    'Tallawong':[222.16,409.53], 'Rouse Hill':[255.36,401.49],
    'Kellyville':[282.31,401.49], 'Bella Vista':[309.25,401.49],
    'Norwest':[336.20,401.49], 'Hills Showground':[363.15,401.49],
    'Castle Hill':[390.09,401.49], 'Cherrybrook':[417.04,401.49],
    'Epping':[505.16,417.88], 'Macquarie University':[565.17,434.81],
    'Macquarie Park':[596.41,434.81], 'North Ryde':[627.64,434.81],
    'Chatswood':[658.07,447.15], 'Crows Nest':[691.58,480.64],
    'Victoria Cross':[725.83,514.84], 'Barangaroo':[735.84,562.66],
    'Martin Place':[783.68,600.69], 'Gadigal':[783.68,619.39],
    'Central':[778.41,651.67], 'Waterloo':[778.41,684.73],
    'Sydenham':[703.93,750.91], 'Marrickville':[666.62,750.79],
    'Dulwich Hill':[647.35,750.99], 'Hurlstone Park':[624.80,761.89],
    'Canterbury':[611.64,775.04], 'Campsie':[596.85,789.81],
    'Belmore':[573.19,800.81], 'Lakemba':[553.55,800.81],
    'Wiley Park':[533.91,800.81], 'Punchbowl':[514.27,800.81],
    'Bankstown':[486.74,800.81],
  }),
  T6:Object.freeze({
    'Lidcombe':[448.60,700.00], 'Berala':[448.56,724.12],
    'Regents Park':[448.56,748.22], 'Birrong':[457.60,771.99],
    'Yagoona':[469.52,783.89], 'Bankstown':[481.92,796.00],
  }),
  T4:Object.freeze({'Central':[780,653], 'Sydenham':[691,749]}),
  T8:Object.freeze({'Central':[766,653], 'Wolli Creek':[694,795]}),
  T1:Object.freeze({'Central':[745,652],'Town Hall':[742,615],
    'Wynyard':[741,581],'Lidcombe':[450,692]}),
  T2:Object.freeze({'Central':[749,653],'Lidcombe':[452,694]}),
  T3:Object.freeze({'Central':[752,653],'Lidcombe':[455,697]}),
  T9:Object.freeze({'Central':[752,654]}),
});

export const ROUTES_2026 = Object.freeze({
  M1:[['Tallawong','Rouse Hill','Kellyville','Bella Vista','Norwest',
    'Hills Showground','Castle Hill','Cherrybrook'],
    ['Epping','Macquarie University','Macquarie Park','North Ryde',
    'Chatswood','Crows Nest','Victoria Cross','Barangaroo','Martin Place',
    'Gadigal','Central','Waterloo','Sydenham','Marrickville','Dulwich Hill',
    'Hurlstone Park','Canterbury','Campsie','Belmore','Lakemba','Wiley Park',
    'Punchbowl','Bankstown']],
  T6:[['Lidcombe','Berala','Regents Park','Birrong','Yagoona','Bankstown']],
  T7:[['Lidcombe','Olympic Park']],
  T1:[['Richmond','East Richmond','Clarendon','Windsor','Mulgrave',
    'Vineyard','Riverstone','Schofields','Quakers Hill','Marayong'],
    ['Blacktown','Seven Hills','Toongabbie','Pendle Hill','Wentworthville',
      'Westmead','Parramatta','Harris Park','Granville','Clyde','Auburn',
      'Lidcombe','Strathfield','Burwood'],
    ['Redfern','Central','Town Hall','Wynyard','Milsons Point',
      'North Sydney','Chatswood'],
    ['Gordon','Hornsby','Berowra']],
  T2:[['Leppington','Edmondson Park','Glenfield'],
    ['Liverpool','Warwick Farm','Cabramatta','Canley Vale','Fairfield',
      'Yennora','Guildford','Merrylands','Granville','Clyde','Auburn',
      'Lidcombe','Strathfield','Burwood'],
    ['Redfern','Central','Town Hall','Wynyard']],
  T3:[['Liverpool','Warwick Farm','Cabramatta'],
    ['Regents Park','Lidcombe','Strathfield','Burwood'],
    ['Redfern','Central','Town Hall','Wynyard']],
  T4:[['Bondi Junction','Kings Cross','Martin Place','Town Hall',
    'Central','Redfern','Sydenham','Wolli Creek','Hurstville',
    'Sutherland','Waterfall'],
    ['Sutherland','Cronulla']],
  T5:[['Richmond','East Richmond','Clarendon','Windsor','Mulgrave',
    'Vineyard','Riverstone','Schofields','Quakers Hill','Marayong'],
    ['Blacktown','Parramatta','Merrylands','Guildford','Yennora',
      'Fairfield','Canley Vale','Cabramatta','Warwick Farm','Liverpool',
      'Casula','Glenfield','Edmondson Park','Leppington']],
  T8:[['Macarthur','Campbelltown','Glenfield','Holsworthy','East Hills',
    'Panania','Revesby','Padstow','Riverwood','Narwee','Beverly Hills'],
    ['Wolli Creek','International Airport','Domestic Airport',
    'Mascot','Green Square','Central','Town Hall','Wynyard']],
  T9:[['Hornsby','Epping'],
    ['Strathfield','Burwood','Redfern','Central','Town Hall',
    'Wynyard','Milsons Point','North Sydney','Chatswood']],
});
const normalise=s=>String(s||'').normalize('NFKC').toLowerCase()
  .replace(/\bstation\b/g,'').replace(/[^\p{L}\p{N}]+/gu,'');
const pointDistance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
const closeness=(p,a,b)=>{
  const dx=b[0]-a[0],dy=b[1]-a[1],length2=dx*dx+dy*dy;
  if(length2<1)return null;
  const t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/length2));
  return {t,distance:pointDistance(p,[a[0]+t*dx,a[1]+t*dy])};
};
export function build2026PdfAlignment(network) {
  const stationGeo=new Map();
  for(const [name,x,y,lines] of network?.stations||[]) {
    if(!Number.isFinite(x)||!Number.isFinite(y))continue;
    const entry={xy:[x,y],lines:new Set(String(lines||'').split(/\s+/))};
    const key=normalise(name);
    // Preserve the first actual feed entry instead of conflating two platforms.
    if(!stationGeo.has(key))stationGeo.set(key,entry);
  }
  const result={};
  for(const [line,chains] of Object.entries(ROUTES_2026)) {
    const edges=[];
    for(const chain of chains)for(let i=1;i<chain.length;i++) {
      const from=chain[i-1],to=chain[i];
      const a=stationGeo.get(normalise(from)),b=stationGeo.get(normalise(to));
      if(!a?.lines.has(line)||!b?.lines.has(line))continue;
      const pdfA=PDF_2026_LINE_STOPS[line]?.[from]||STOP_PIXELS_2026[from];
      const pdfB=PDF_2026_LINE_STOPS[line]?.[to]||STOP_PIXELS_2026[to];
      if(!pdfA||!pdfB||pointDistance(pdfA,pdfB)<2)continue;
      edges.push({from,to,geoA:a.xy,geoB:b.xy,pdfA,pdfB});
    }
    result[line]=edges;
  }
  return result;
}
export function locate2026Train(train,alignment,maxDistanceUnits=25) {
  const [line,x,y]=train;
  if(!Number.isFinite(x)||!Number.isFinite(y)||!Number.isFinite(maxDistanceUnits))return null;
  let selected=null;
  for(const edge of alignment?.[line]||[]) {
    const match=closeness([x,y],edge.geoA,edge.geoB);
    if(!match)continue;
    if(selected==null||match.distance<selected.distance)
      selected={...match,edge};
  }
  // Source feed positions are projected in 10 m units. 25 => 250 m maximum. This rejects distant parallel line matches.
  // No 2024 alignment fallback, and no interpolation over missing stations.
  if(!selected||selected.distance>maxDistanceUnits)return null;
  const {pdfA,pdfB,from,to}=selected.edge;
  const px=pdfA[0]+selected.t*(pdfB[0]-pdfA[0]);
  const py=pdfA[1]+selected.t*(pdfB[1]-pdfA[1]);
  return {x:px,y:py,from,to,
    distanceMetres:Math.round(selected.distance*10),
    confidence:'approximate-2026-verified-pair'};
}
export function source2026StationHits(lineFilter='') {
  const selected=lineFilter?new Set((ROUTES_2026[lineFilter]||[]).flat()):null;
  return Object.entries(STOP_PIXELS_2026)
    .filter(([name])=>!selected||selected.has(name))
    .map(([name,point])=>[name,PDF_2026_LINE_STOPS[lineFilter]?.[name]||point]);
}


export function officialDisruptionPins2026(live,lineFilter='') {
  const results=[],seen=new Set();
  const lines=lineFilter?new Set((ROUTES_2026[lineFilter]||[]).flat()):null;
  const locations=new Map(Object.entries(STOP_PIXELS_2026)
    .map(([name,xy])=>[normalise(name),{name,xy}]));
  for(const overlay of live?.overlays||[]) {
    if(lineFilter&&!(overlay.lines||[]).includes(lineFilter))continue;
    for(const info of [...(overlay.pins||[]),...(overlay.spins||[])]) {
      const point=locations.get(normalise(info[2]));
      if(!point||lines&&!lines.has(point.name))continue;
      const id=overlay.kind+'|'+point.name;
      if(seen.has(id))continue;
      seen.add(id);
      results.push({...point,kind:overlay.kind,
        title:overlay.title||'Reported service disruption'});
    }
  }
  return results;
}
