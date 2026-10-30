#!/usr/bin/env python3
"""Audit 2026 TfNSW PDF vector station circles; never auto-patch live coordinates."""
import argparse,collections,hashlib,json,math,pathlib,re
p=argparse.ArgumentParser()
p.add_argument('--pdf',required=True);p.add_argument('--source',required=True);p.add_argument('--out-dir',required=True);p.add_argument('--pairs')
a=p.parse_args()
raw=pathlib.Path(a.pdf).read_bytes()
sha=hashlib.sha256(raw).hexdigest()
if sha!='7877f5bed61ef5f04fbda86752ca1582732544752242ca4777e2e93b00662669':
    raise RuntimeError('Unapproved TfNSW PDF checksum')
import fitz
doc=fitz.open(a.pdf)
if len(doc)!=1:raise RuntimeError('Unexpected PDF page count')
page=doc[0]; sx=1024/page.rect.width;sy=1447/page.rect.height
palette={'M1':(0,150,155),'T6':(120,63,32),'T1':(249,158,29),'T2':(0,152,205),
'T3':(243,112,33),'T4':(0,90,169),'T5':(195,39,146),'T7':(146,150,154),
'T8':(0,152,76),'T9':(209,31,54)}
def closest(c):
    if c is None:return None
    rgb=tuple(int(round(255*x)) for x in c[:3])
    dist,line=min((math.dist(rgb,v),k) for k,v in palette.items())
    return line if dist<=55 else None
candidates=[]; counts=collections.Counter()
for drawing in page.get_drawings():
    r=drawing.get('rect')
    if r is None:continue
    w,h=r.width*sx,r.height*sy
    if not (2<=w<=16 and 2<=h<=16 and abs(w-h)<=5):continue
    line=closest(drawing.get('color')) or closest(drawing.get('fill'))
    if not line:continue
    methods=collections.Counter(q[0] for q in drawing.get('items',[]))
    if methods.get('c',0)<2 and methods.get('qu',0)<1:continue
    pt=[round((r.x0+r.x1)*sx/2,2),round((r.y0+r.y1)*sy/2,2)]
    candidates.append({'line':line,'point':pt,'diameter':[round(w,2),round(h,2)]})
    counts[line]+=1
source=pathlib.Path(a.source).read_text()
body=source.split('STOP_PIXELS_2026 = Object.freeze({',1)[1].split('});',1)[0]
named={k:[float(x),float(y)] for k,x,y in re.findall(r"'([^']+)':\s*\[\s*([\d.]+)\s*,\s*([\d.]+)\s*\]",body)}
# Fail closed: each explicitly calibrated M1 and T6 station must match a
# colour-coded circular vector symbol from this exact approved PDF page.
# No closest-approximate fallback: drift or a missing source symbol is an error.
line_section=source.split('PDF_2026_LINE_STOPS = Object.freeze({',1)[1].split('export const ROUTES_2026',1)[0]
verified_counts={}
for line,expected in [('M1',31),('T6',6),('T1',27),('T2',13),('T3',8),('T4',28),('T5',18),('T7',2),('T8',14),('T9',6)]:
    match=re.search(r'\b'+line+r':Object\.freeze\(\{(.*?)\}\)',line_section,re.S)
    if not match:raise RuntimeError('Missing source-specific '+line+' calibration')
    positions={name:[float(x),float(y)] for name,x,y in re.findall(
        r"'([^']+)':\s*\[\s*([\d.]+)\s*,\s*([\d.]+)\s*\]",match.group(1))}
    if len(positions)!=expected:raise RuntimeError(line+' requires '+str(expected)+' calibrated stations')
    if len({tuple(v) for v in positions.values()}) != len(positions):
        raise RuntimeError(line+' assigns two different stations to the same vector symbol')
    source_points=[p['point'] for p in candidates if p['line']==line and p['point'][1]<1200]
    for name,point in positions.items():
        if not source_points:raise RuntimeError(line+' source station symbols unavailable')
        delta=min(math.dist(point,p) for p in source_points)
        if delta>0.3:raise RuntimeError(line+' '+name+' is '+str(round(delta,2))+
             'px from any official source station circle')
    verified_counts[line]=len(positions)
print('SOURCE_VERIFIED_STOP_COUNTS '+json.dumps(verified_counts,sort_keys=True))
review=[]
for line,names in {'M1':['Tallawong','Rouse Hill','Epping','Chatswood','Central','Sydenham',
'Marrickville','Dulwich Hill','Hurlstone Park','Canterbury','Campsie','Belmore','Lakemba',
'Wiley Park','Punchbowl','Bankstown'],
'T6':['Lidcombe','Berala','Regents Park','Birrong','Yagoona','Bankstown']}.items():
    pts=[v for v in candidates if v['line']==line]
    for name in names:
        if name not in named:continue
        near=sorted(pts,key=lambda p:math.dist(p['point'],named[name]))[:4]
        review.append({'line':line,'station':name,'manual':named[name],
                       'near':[{**v,'distance':round(math.dist(v['point'],named[name]),1)} for v in near]})
out=pathlib.Path(a.out_dir);out.mkdir(parents=True,exist_ok=True)
report={'source_sha256':sha,'counts':dict(counts),'candidate_count':len(candidates),
        'candidates':candidates,'nearest_symbols_not_approved_station_labels':review}
(out/'vector-points.json').write_text(json.dumps(report,indent=2)+'\n')
md=['# 2026 official TfNSW station circle evidence','',
'This is an operator-only diagnostic. Nearest station symbols may belong to a neighboring stop.',
'No automated coordinate changes are authorized.','',
'| Line | Name | Current anchor | Nearest same-color source symbol | Offset (px) |',
'|---|---|---|---|---:|']
for row in review:
    hit=row['near'][0] if row['near'] else None
    md.append('| '+row['line']+' | '+row['station']+' | '+str(row['manual'])+
      ' | '+(str(hit['point']) if hit else 'none')+' | '+
      (str(hit['distance']) if hit else 'unknown')+' |')

if a.pairs:
    all_pairs=json.loads(pathlib.Path(a.pairs).read_text())
    other=[]
    for row in all_pairs:
        line=row['line']
        vec=[p['point'] for p in candidates if p['line']==line and p['point'][1]<1200]
        nearest=sorted(vec,key=lambda p:math.dist(p,row['pixel']))[:2]
        delta=math.dist(nearest[0],row['pixel']) if nearest else None
        other.append({'line':line,'station':row['station'],'manual':row['pixel'],
                      'nearest':nearest,'delta':round(delta,1) if delta is not None else None})
    report['all_lines_operator_review']=other
    (out/'vector-points.json').write_text(json.dumps(report,indent=2)+'\n')
    md+=['','## Other line anchor candidates (NOT yet verified as named stations)',
         '','| Line | Station | Existing pixel | Closest same-colour circle | Difference px |',
         '|---|---|---|---|---:|']
    for row in other:
        if row['line'] in ('M1','T6'):continue
        md.append('| '+row['line']+' | '+row['station']+' | '+str(row['manual'])+
          ' | '+str(row['nearest'][0] if row['nearest'] else None)+
          ' | '+str(row['delta'])+' |')
        print('OTHER_LINE_PAIR',row['line'],row['station'],
              'delta='+str(row['delta']),'closest='+str(row['nearest'][:1]))
(out/'station-vector-audit.md').write_text('\n'.join(md)+'\n')
print('SOURCE_VECTOR_COUNTS '+json.dumps(dict(counts),sort_keys=True))
for line in ('M1','T6','T8','T4'):
    pts=sorted([x['point'] for x in candidates if x['line']==line],key=lambda p:(round(p[1]/12),p[0]))
    print('SOURCE_CANDIDATES_'+line+' '+json.dumps(pts))
    if line == 'T4':
        print('T4_SOUTH_SOURCE_CIRCLES '+json.dumps([p for p in pts
              if 650 <= p[0] <= 730 and 890 <= p[1] <= 1110]))


for row in review:
    hit=row['near'][0] if row['near'] else None
    print('ANCHOR_REVIEW',row['line'],row['station'],'manual='+str(row['manual']),
          'source_candidate='+str(hit['point'] if hit else None),
          'delta='+str(hit['distance'] if hit else 'none'))
