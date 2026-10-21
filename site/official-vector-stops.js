// Station symbol candidates extracted from the user-supplied 2024 TfNSW PDF's
// vector paths, NOT inferred from train latitude/longitude or our custom diagram.
//
// Each packet stores X,Y as 16-bit big-endian integers in tenths of a unit on the
// 1024 x 1447 reference page. Line ordering: T1 T2 T3 T4 T5 T6 T7 T8 T9 M1.
// The PDF frequently draws two or more coloured dots at a shared station.
// These are *symbol* coordinates, not one-to-one named station identities.
const PDF_SYMBOLS_2024 = {
 T1:'DNUXBgZRE2EGIhHaBiIRDgYiEEMGIg94BiIOqwYiDeAGIg0VBiISoAhqFmQHwBZkBxcWZAl2FmQGcBZkBdcWZAUtFmQEhBZkF0oPDRa6Dn0Vmg1dFQoMzRYqDe0YahAtGPoQvRmKEU0asBJyG0ATAhvQE5IcYBQiHPwUvx1OFXALchZkCsgWZAzVFwYMcxajCh8WZA48GGwUThttCXYWZB1OGQ0dThpTFE4LvBROCuIUTgoWFE4JShfZD50dThenHN0bUBAFGjYPjBm7DxMZRBF+G20=',
 T2:'DCYbbQueHAkLlBy9C5QdywuUHt8LlCSzC5Qg/AuUI18GtiXCGiobsRmDG7EY3RuxGDYbsRePG7EW6RuxFkIbsRWbG7EU9RuxE6cbsRMAG7EN3BjMFE4bsRMBG7ELlB/uC5QiDB2IGQ0diBpTHxEWXR2IF6cg2RkAH6IaAA7jGXMP1BpjD1sZ6xF+G7E=',
 T3:'Giob9BmDG/QY3Rv0GDYb9BePG/QW6Rv0FkIb9BWbG/QU9Rv0E6cb9BMBG/QL1yD8EKoe3w/RHt8O9x7fDh4e3w1EHt8ROR4hFE4b9AvXH+4dwhkNHcIaUx8RFpcdwhenIJ8ZAB+iGcYdLhugETkdLhF+G/c=',
 T4:'G4keOBthHg4hjhiKIjUYihr1H2wa9SEDGvUhzhr1Ipoa9SNmGvUkMRr1JP0a9SaUGvUnXxr1KCsa9Sj2GvUpwhr1K5wa9SxoGvUtMx2bKxUeZisVHzMrFR/+KxUgyisVGvUlyBr1Ko0eNhkNHjYaUx7pGIwdfhvw',
 T5:'BiETkQXeEdkF3hKgBd4NFQXeDeAF3g6sBd4PeAXeEEMF3hEODKUXNgxDFtQLchaoCsgWqAv3Gz4LaRvUC1AcvQtQHcsLUB7fC1AkswtQIP0LUCNgBrUlfg4MGJwKHxanCXYWpwtQH+4LUCIM',
 T6:'ElEfiRF+HiER2R8REX4dLg==',
 T7:'GYUYfhhjGIAXQhh+FF4YfhH7GH4apxh+Df0Xrg0VFscGNhadBEoZXARKG0IESh0eBEoe/wRIIOAeaRenIJAzjiJfM44=',
 T8:'Gzkd5wvXJLMdWx/AHfweCB38HO4d6x8xHGkcthu6HWQL1yaOC9cnnQvXKKwL1ym8C9cqyx38GQ0d/BpTHxEW0R38FEX/SEhFywh8hZbIsMViiOUIGQZAB+iGYwdVxvJHesfMQ==',
 T9:'GDsQXRjLEOwZWxF8GoESohsQEzEboRPBHDEUURzNFO8dExVwFAoP7RQKDxcUCg5BFAoNaxQKDJUU9RsqFE4bKh0TGQ0dExpTHRMXpxQKF7cUChadFAoVgxQKFGoUChNQFAoSNhyyGyQUChi+',
 M1:'G44ePBzQFtEeshkNHn0aUx59G6ATuREdHrIYURm/EkQbEROWHGsU7w=='
};
export const PDF_SYMBOL_COUNT = 282;

export const OFFICIAL_LINE_PALETTE = Object.freeze({
 T1:'#F99E1D', T2:'#0098CD', T3:'#F37021', T4:'#005AA9', T5:'#C32792',
 T6:'#783F20', T7:'#92969A', T8:'#00984C', T9:'#D11F36', M1:'#00969B'
});

export function decodePdfSymbols() {
  const result={};
  for(const [line,packed] of Object.entries(PDF_SYMBOLS_2024)){
    const bytes=Uint8Array.from(atob(packed), c=>c.charCodeAt(0));
    if(bytes.length%4) throw Error('Corrupt PDF station symbol packet: '+line);
    const pts=[];
    for(let i=0;i<bytes.length;i+=4) {
      const x=((bytes[i]<<8)|bytes[i+1])/10,y=((bytes[i+2]<<8)|bytes[i+3])/10;
      if(x<0||x>1024||y<0||y>1447) throw Error('Out-of-page PDF symbol on '+line);
      pts.push([x,y]);
    }
    result[line]=pts;
  }
  return result;
}
export function pointDistance(a,b){return Math.hypot(a[0]-b[0],a[1]-b[1]);}
export function nearestPdfSymbol(xy,points,maxDistance=18) {
  let nearest=null,dist=Infinity;
  for(const p of points||[]) { const d=pointDistance(xy,p); if(d<dist){dist=d;nearest=p;} }
  return nearest&&dist<=maxDistance?{position:nearest,distance:dist}:null;
}

/** Deterministic diagram-to-PDF point crosswalk.
 * anchor: {stationName:[x,y]} measured on official PDF.
 * lineRoutes: {line:[name,name,...][]}, using actual named TfNSW stop sequences.
 * With known anchors, find exact PDF vector station dots between them, in order.
 * Never create positions when route evidence is missing or ambiguous.
 */
export function reconcilePdfStations(anchors,lineRoutes,{maxAnchorDistance=17,maxGapDistance=10.5}={}){
  const dots=decodePdfSymbols(), positions=new Map(), byLine=new Map(),unresolved=new Set();
  const evidence=[];
  // First snap seeded, named anchors to genuine vector station symbols.
  for(const [name,xy] of Object.entries(anchors)){
    const serving=Object.keys(lineRoutes).filter(line=>lineRoutes[line].some(route=>route.includes(name)));
    const options=serving.flatMap(line=>(dots[line]||[]).map(position=>({position,line,
      distance:pointDistance(position,xy)}))).sort((a,b)=>a.distance-b.distance);
    const nearest=options[0];
    if(nearest&&nearest.distance<=maxAnchorDistance){
      positions.set(name,nearest.position);
      evidence.push({name,line:nearest.line,distance:+nearest.distance.toFixed(1),method:'vector-anchor'});
    }else unresolved.add(name);
  }
  // Intermediate stops only match when *both* enclosing names already have
  // verified PDF dots. Distances along an official corridor are an ordering clue,
  // not evidence that a route continues beyond a missing anchor.
  for(const [line,routes] of Object.entries(lineRoutes)){
    const symbols=dots[line]||[];
    const linePositions=new Map();
    for(const route of routes){
      let left=-1;
      for(let i=0;i<route.length;i++){
        if(!positions.has(route[i]))continue;
        if(left>=0&&i-left>1){
          const start=positions.get(route[left]),end=positions.get(route[i]);
          const delta=[end[0]-start[0],end[1]-start[1]];
          const d2=delta[0]**2+delta[1]**2;
          if(d2>0.1)for(let k=left+1;k<i;k++){
            const nm=route[k];
            if(positions.has(nm))continue;
            const t=(k-left)/(i-left);
            const target=[start[0]+delta[0]*t,start[1]+delta[1]*t];
            const candidates=symbols.map(p=>{
              const progress=((p[0]-start[0])*delta[0]+(p[1]-start[1])*delta[1])/d2;
              return {p,dist:pointDistance(p,target),progress};
            }).filter(x=>x.progress>0.01&&x.progress<0.99&&x.dist<=maxGapDistance)
              .sort((a,b)=>a.dist-b.dist);
            if(candidates[0]&&(!candidates[1]||candidates[1].dist-candidates[0].dist>1.2)){
              positions.set(nm,candidates[0].p);
              evidence.push({name:nm,line,distance:+candidates[0].dist.toFixed(1),method:'vector-intermediate'});
            }else unresolved.add(nm);
          }
        }
        left=i;
      }
      for(const nm of route)if(positions.has(nm))linePositions.set(nm,positions.get(nm));
    }
    byLine.set(line,linePositions);
  }
  return {positions,byLine,evidence,
    unmatched:[...unresolved].filter(n=>!positions.has(n)).sort(),
    symbols:dots};
}
