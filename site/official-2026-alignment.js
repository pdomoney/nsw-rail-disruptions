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
  'Tallawong':[222.16,409.53], 'Rouse Hill':[255.36,401.49], 'Kellyville':[282.31,401.49],
  'Bella Vista':[309.25,401.49], 'Norwest':[336.2,401.49], 'Hills Showground':[363.15,401.49],
  'Castle Hill':[390.09,401.49], 'Cherrybrook':[417.04,401.49], 'Epping':[508,417],
  'Macquarie University':[565.17,434.81], 'Macquarie Park':[596.41,434.81],
  'North Ryde':[627.64,434.81], 'Chatswood':[696,459],
  'Crows Nest':[691.58,480.64], 'Victoria Cross':[725.83,514.84],
  'Barangaroo':[735.84,562.66], 'Martin Place':[780,599], 'Gadigal':[783.68,619.39],
  'Central':[758,652], 'Waterloo':[778.41,684.73], 'Sydenham':[690,749],
  'Marrickville':[666.62,750.79], 'Dulwich Hill':[647.35,750.99],
  'Hurlstone Park':[624.8,761.89], 'Canterbury':[611.64,775.04], 'Campsie':[596.85,789.81],
  'Belmore':[573.19,800.81], 'Lakemba':[553.55,800.81], 'Wiley Park':[533.91,800.81],
  'Punchbowl':[514.27,800.81], 'Bankstown':[484.33,798.41],
  'Lidcombe':[448,691], 'Berala':[448.56,724.12], 'Regents Park':[448.56,748.22],
  'Birrong':[457.6,771.99], 'Yagoona':[469.52,783.89], 'Olympic Park':[449,588],
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
  T1:Object.freeze({
    'Richmond':[160.27,295.29],
    'East Richmond':[160.27,315.61],
    'Clarendon':[160.27,335.76],
    'Windsor':[160.27,355.92],
    'Mulgrave':[160.27,376.15],
    'Vineyard':[160.27,396.36],
    'Riverstone':[160.27,416.4],
    'Schofields':[160.27,436.69],
    'Quakers Hill':[160.27,456.34],
    'Marayong':[164.96,475.47],
    'Blacktown':[244.74,551.85],
    'Seven Hills':[278.28,551.85],
    'Toongabbie':[295.17,551.85],
    'Pendle Hill':[320.63,558.13],
    'Wentworthville':[330.38,567.87],
    'Westmead':[353.89,591.43],
    'Harris Park':[387.22,624.79],
    'Granville':[411.26,648.81],
    'Strathfield':[519.96,679.66],
    'Central':[748.34,651.67],
    'Town Hall':[748.33,619.4],
    'Wynyard':[748.34,583.83],
    'North Sydney':[748.37,527.7],
    'Chatswood':[696.23,465.96],
    'Gordon':[609.93,379.84],
    'Hornsby':[519.94,281.44],
    'Berowra':[519.94,199.25],
  }),
  T2:Object.freeze({
    'Leppington':[141.35,941.89],
    'Edmondson Park':[174.99,941.89],
    'Liverpool':[298.51,847.66],
    'Warwick Farm':[298.51,820.75],
    'Cabramatta':[298.51,793.89],
    'Canley Vale':[298.51,767.02],
    'Fairfield':[298.51,739.69],
    'Yennora':[298.51,712.92],
    'Granville':[406.32,653.3],
    'Lidcombe':[448.6,686.34],
    'Strathfield':[519.96,686.34],
    'Burwood':[553.01,686.34],
    'Central':[754.09,651.67],
  }),
  T3:Object.freeze({
    'Liverpool':[305.2,847.66],
    'Warwick Farm':[305.2,820.75],
    'Cabramatta':[305.2,793.89],
    'Regents Park':[441.74,748.22],
    'Lidcombe':[448.6,693.32],
    'Strathfield':[519.96,693.02],
    'Burwood':[553.01,693.01],
    'Central':[759.84,651.67],
  }),
  T4:Object.freeze({
    'Martin Place':[789.09,606.57],
    'Central':[771.35,651.67],
    'Sydenham':[699.49,746.39],
    'Tempe':[688.79,781.06],
    'Wolli Creek':[688.74,801.27],
    'Arncliffe':[688.78,821.41],
    'Banksia':[688.78,841.54],
    'Rockdale':[688.78,861.75],
    'Kogarah':[688.78,881.92],
    'Carlton':[688.78,902.10],
    'Allawah':[688.78,922.27],
    'Hurstville':[688.76,942.64],
    'Penshurst':[688.78,962.62],
    'Mortdale':[688.78,982.79],
    'Oatley':[688.78,1002.96],
    'Como':[688.78,1023.14],
    'Jannali':[688.78,1043.31],
    'Sutherland':[688.76,1063.48],
    'Loftus':[688.78,1090.38],
    'Engadine':[688.78,1110.55],
    'Heathcote':[688.78,1130.72],
    'Waterfall':[688.76,1150.95],
    'Kirrawee':[756.06,1076.93],
    'Gymea':[776.12,1076.93],
    'Miranda':[796.44,1076.93],
    'Caringbah':[816.63,1076.93],
    'Woolooware':[836.82,1076.93],
    'Cronulla':[857.02,1076.93],
  }),
  T5:Object.freeze({
    'Richmond':[153.55,295.29],
    'East Richmond':[153.55,315.61],
    'Clarendon':[153.55,335.76],
    'Windsor':[153.55,355.95],
    'Mulgrave':[153.54,376.15],
    'Vineyard':[153.54,396.36],
    'Riverstone':[153.53,416.4],
    'Schofields':[153.54,436.61],
    'Quakers Hill':[153.54,456.25],
    'Marayong':[160.2,480.22],
    'Blacktown':[244.74,558.48],
    'Yennora':[291.75,712.96],
    'Fairfield':[291.75,739.74],
    'Canley Vale':[291.75,767.07],
    'Cabramatta':[291.75,793.94],
    'Warwick Farm':[291.75,820.8],
    'Casula':[291.75,881.37],
    'Leppington':[141.3,935.14],
  }),
  T7:Object.freeze({
    'Lidcombe':[448.6,672.95],
    'Olympic Park':[469.26,591.66],
  }),
  T8:Object.freeze({
    'Macarthur':[305.17,1096.52],
    'Campbelltown':[305.2,1069.63],
    'Holsworthy':[352.38,897.39],
    'East Hills':[381.05,897.39],
    'Panania':[409.71,897.39],
    'Revesby':[438.38,897.39],
    'Padstow':[467.04,897.39],
    'Riverwood':[495.71,897.39],
    'Narwee':[524.37,897.39],
    'Wolli Creek':[695.48,794.52],
    'International Airport':[749.65,789.36],
    'Mascot':[765.58,745.79],
    'Green Square':[765.58,717.78],
    'Central':[765.59,651.67],
  }),
  T9:Object.freeze({
    'Hornsby':[513.23,281.44],
    'Epping':[513.23,417.89],
    'Central':[742.56,651.67],
    'Town Hall':[742.56,619.4],
    'Wynyard':[742.56,583.83],
    'North Sydney':[742.56,527.7],
  }),
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
    'Central','Redfern','Sydenham','Tempe','Wolli Creek',
    'Arncliffe','Banksia','Rockdale','Kogarah','Carlton','Allawah',
    'Hurstville','Penshurst','Mortdale','Oatley','Como','Jannali',
    'Sutherland','Loftus','Engadine','Heathcote','Waterfall'],
    ['Sutherland','Kirrawee','Gymea','Miranda','Caringbah','Woolooware','Cronulla']],
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
      // For conventional trains the initial PR64 coordinates remain partly
      // inaccurate. Only use station pairs individually matched to same-line
      // coloured vector circles in the checksum-pinned 2026 official PDF.
      if(line!=='M1'&&line!=='T6'&&
        (!PDF_2026_LINE_STOPS[line]?.[from]||!PDF_2026_LINE_STOPS[line]?.[to]))continue;
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
  const hits=new Map();
  // The generic PR64 registry covers only some printed stations. After
  // the 2026 source-vector audit the line-specific registry is the actual
  // authoritative set for both stop selection and diagram vehicle sections.
  for(const [line,stations] of Object.entries(PDF_2026_LINE_STOPS)) {
    if(lineFilter&&line!==lineFilter)continue;
    for(const [name,point] of Object.entries(stations)) {
      if(selected&&!selected.has(name))continue;
      if(!hits.has(name))hits.set(name,point);
    }
  }
  return [...hits];
}


export function officialDisruptionPins2026(live,lineFilter='') {
  const results=[],seen=new Set();
  const lines=lineFilter?new Set((ROUTES_2026[lineFilter]||[]).flat()):null;
  const locations=new Map(source2026StationHits(lineFilter)
    .map(([name,xy])=>[normalise(name),{name,xy}]));
  for(const overlay of live?.overlays||[]) {
    if(lineFilter&&!(overlay.lines||[]).includes(lineFilter))continue;
    for(const info of [...(overlay.pins||[]),...(overlay.spins||[])]) {
      const original=locations.get(normalise(info[2]));
      if(!original||lines&&!lines.has(original.name))continue;
      const chosen=PDF_2026_LINE_STOPS[lineFilter]?.[original.name]||
        Object.values(PDF_2026_LINE_STOPS).find(line=>line[original.name])?.[original.name];
      if(!chosen)continue; // no printed 2026 source-symbol match
      const point={...original,xy:chosen};
      const id=overlay.kind+'|'+point.name;
      if(seen.has(id))continue;
      seen.add(id);
      results.push({...point,kind:overlay.kind,
        title:overlay.title||'Reported service disruption'});
    }
  }
  return results;
}
