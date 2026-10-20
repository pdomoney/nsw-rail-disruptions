// The network diagram: a schematic, patron-style map of Sydney Trains, Metro and the intercity lines
// (straight lines at 45° angles, stations evenly spaced, lines that share track drawn side by side).
// It is laid out by hand here, not taken from TfNSW's official map artwork.
//
// Corridors are the physical routes, each listing every station on it in order. Fixed points: a station
// with coordinates in NODES, or a bare corner [x, y]. Stations between two fixed points are spaced
// evenly along the line through them. Coordinates are diagram units (x east, y south), roughly one
// station apart. Lines are routes through the corridors: the stations to pass, in order, with the path
// between each found along the corridors. Intercity lines are only drawn where no suburban or metro line
// runs, so the inner network is not crowded with them, but their trains still show on the shared track.
// Light rail is not on the diagram.

export const SCHEMATIC_VIEWS = {
  // Coordinates here are hand-authored diagram units, not GPS or geographic positions.
  city: [-5.8, -10.9, 8.6, 6.5],
  sydney: [-41, -33, 8, 29.5],
};

export const NODES = {
  // City
  'Central': [0, 0], 'Town Hall': [-2, -2.5], 'Wynyard': [-2, -4.5], 'Circular Quay': [0, -6.5], 'St James': [2, -4.5], 'Museum': [2, -2.5],
  'Martin Place': [0, -3.5], 'Barangaroo': [-1, -4.8], 'Victoria Cross': [-1, -8.2], 'Crows Nest': [-1, -10.4],
  'Kings Cross': [3.5, -3.5], 'Bondi Junction': [6.5, -3.5],
  'Redfern': [-1, 1], 'Sydenham': [-1, 4.6], 'Wolli Creek': [-1, 7], 'International Airport': [1, 5],
  // North
  'Chatswood': [-2, -13], 'Hornsby': [-4, -27], 'Berowra': [-4, -31.8], 'Epping': [-13, -8.6], 'Tallawong': [-27, -8.6],
  // West
  'Strathfield': [-13, 1], 'Lidcombe': [-16.6, 1], 'Olympic Park': [-16.6, -1.4], 'Granville': [-20.2, 1], 'Harris Park': [-21.4, 1],
  'Parramatta': [-22.6, 1], 'Blacktown': [-29.8, 1], 'Richmond': [-36, -10.2], 'Emu Plains': [-39.4, 1],
  // South west
  'Regents Park': [-16.6, 3.4], 'Bankstown': [-14.2, 5.8], 'Merrylands': [-20.2, 2.2], 'Cabramatta': [-20.2, 8.2],
  'Liverpool': [-20.2, 10.6], 'Glenfield': [-20.2, 13], 'Leppington': [-25, 13], 'Macarthur': [-20.2, 20.2],
  // South
  'Hurstville': [-1, 15.4], 'Sutherland': [-1, 22.6], 'Cronulla': [6.2, 22.6], 'Waterfall': [-1, 27.4],
  // Intercity
  'Lithgow': [-64.6, 1], 'Bathurst': [-68.2, 1],
  'Gosford': [-4, -43], 'Hamilton': [14, -66], 'Newcastle Interchange': [15.6, -66], 'Maitland': [4, -78], 'Scone': [-6, -92], 'Dungog': [4, -88],
  'Wollongong': [-1, 49], 'Coniston': [-1, 50.2], 'Port Kembla': [4.6, 50.2], 'Bomaderry (Nowra)': [-1, 65.8],
  'Goulburn': [-36.3, 36.3],
};

export const CORRIDORS = [
  // City Circle, and the Eastern Suburbs line through Town Hall and Martin Place.
  ['Central', [-2, -2], 'Town Hall', 'Wynyard', 'Circular Quay', 'St James', 'Museum', [2, -2], 'Central'],
  ['Town Hall', [-1, -3.5], 'Martin Place', 'Kings Cross', 'Edgecliff', 'Bondi Junction'],
  // North Shore and Northern lines, and on to Newcastle.
  ['Wynyard', 'Milsons Point', 'North Sydney', 'Waverton', 'Wollstonecraft', 'St Leonards', 'Artarmon', 'Chatswood',
    'Roseville', 'Lindfield', 'Killara', 'Gordon', 'Pymble', 'Turramurra', 'Warrawee', 'Wahroonga', 'Waitara', [-2, -25], 'Hornsby'],
  ['Strathfield', 'North Strathfield', 'Concord West', 'Rhodes', 'Meadowbank', 'West Ryde', 'Denistone', 'Eastwood', 'Epping',
    'Cheltenham', 'Beecroft', 'Pennant Hills', 'Thornleigh', 'Normanhurst', [-13, -18], 'Hornsby'],
  ['Hornsby', 'Asquith', 'Mount Colah', 'Mount Kuring-gai', 'Berowra', 'Cowan', 'Hawkesbury River', 'Wondabyne', 'Woy Woy', 'Koolewong',
    'Tascott', 'Point Clare', 'Gosford', 'Narara', 'Niagara Park', 'Lisarow', 'Ourimbah', 'Tuggerah', 'Wyong', 'Warnervale', 'Wyee',
    [-4, -48], 'Morisset', 'Dora Creek', 'Awaba', 'Fassifern', 'Booragul', 'Teralba', 'Cockle Creek', 'Cardiff', 'Kotara', 'Adamstown', 'Broadmeadow', 'Hamilton', 'Newcastle Interchange'],
  ['Hamilton', [14, -68], 'Waratah', 'Warabrook', 'Sandgate', 'Hexham', 'Tarro', 'Beresfield', 'Thornton', 'Metford', 'Victoria Street', 'East Maitland', 'High Street', 'Maitland',
    'Telarah', 'Lochinvar', 'Greta', 'Branxton', 'Singleton', 'Muswellbrook', 'Aberdeen', [-6, -88], 'Scone'],
  ['Maitland', 'Mindaribba', 'Paterson', 'Hilldale', 'Martins Creek', 'Wallarobba', 'Wirragulla', 'Dungog'],
  // Metro.
  ['Tallawong', 'Rouse Hill', 'Kellyville', 'Bella Vista', 'Norwest', 'Hills Showground', 'Castle Hill', 'Cherrybrook', 'Epping',
    'Macquarie University', 'Macquarie Park', 'North Ryde', [-8.6, -13], 'Chatswood'],
  ['Chatswood', [-1, -12], 'Crows Nest', 'Victoria Cross', 'Barangaroo', [0, -3.8], 'Martin Place', 'Gadigal', 'Central', 'Waterloo', [0, 3.6], 'Sydenham'],
  // Inner West and Western lines, Richmond and the Blue Mountains.
  ['Central', 'Redfern', 'Macdonaldtown', 'Newtown', 'Stanmore', 'Petersham', 'Lewisham', 'Summer Hill', 'Ashfield', 'Croydon', 'Burwood', 'Strathfield',
    'Homebush', 'Flemington', 'Lidcombe', 'Auburn', 'Clyde', 'Granville', 'Harris Park', 'Parramatta', 'Westmead', 'Wentworthville', 'Pendle Hill',
    'Toongabbie', 'Seven Hills', 'Blacktown', 'Doonside', 'Rooty Hill', 'Mount Druitt', 'St Marys', 'Werrington', 'Kingswood', 'Penrith', 'Emu Plains',
    'Lapstone', 'Glenbrook', 'Blaxland', 'Warrimoo', 'Valley Heights', 'Springwood', 'Faulconbridge', 'Linden', 'Woodford', 'Hazelbrook', 'Lawson',
    'Bullaburra', 'Wentworth Falls', 'Leura', 'Katoomba', 'Medlow Bath', 'Blackheath', 'Mount Victoria', 'Bell', 'Zig Zag', 'Lithgow', 'Rydal', 'Tarana', 'Bathurst'],
  ['Blacktown', 'Marayong', 'Quakers Hill', 'Schofields', 'Riverstone', [-29.8, -4], 'Vineyard', 'Mulgrave', 'Windsor', 'Clarendon', 'East Richmond', 'Richmond'],
  ['Lidcombe', 'Olympic Park'],
  // South west: via Regents Park, via Granville and Harris Park, to Liverpool, Leppington and Campbelltown.
  ['Lidcombe', 'Berala', 'Regents Park', 'Sefton', [-16.6, 4.6], 'Chester Hill', 'Leightonfield', 'Villawood', 'Carramar', 'Cabramatta'],
  ['Regents Park', 'Birrong', 'Yagoona', 'Bankstown'],
  ['Granville', 'Merrylands', 'Guildford', 'Yennora', 'Fairfield', 'Canley Vale', 'Cabramatta', 'Warwick Farm', 'Liverpool', 'Casula', 'Glenfield',
    'Macquarie Fields', 'Ingleburn', 'Minto', 'Leumeah', 'Campbelltown', 'Macarthur',
    'Menangle Park', 'Menangle', 'Douglas Park', 'Picton', 'Tahmoor', 'Bargo', 'Yerrinbool', 'Mittagong', 'Bowral', 'Burradoo', 'Moss Vale', 'Exeter',
    'Bundanoon', 'Penrose', 'Wingello', 'Tallong', 'Marulan', 'Goulburn'],
  ['Harris Park', 'Merrylands'],
  ['Glenfield', 'Edmondson Park', 'Leppington'],
  // South: Airport, East Hills, Illawarra, Cronulla and the South Coast.
  ['Central', [1, 1], 'Green Square', 'Mascot', 'Domestic Airport', 'International Airport', 'Wolli Creek'],
  ['Wolli Creek', [-2.2, 8.2], 'Turrella', 'Bardwell Park', 'Bexley North', 'Kingsgrove', 'Beverly Hills', 'Narwee', 'Riverwood', 'Padstow', 'Revesby', 'Panania',
    'East Hills', 'Holsworthy', [-15.4, 8.2], 'Glenfield'],
  ['Redfern', 'Erskineville', 'St Peters', 'Sydenham', 'Tempe', 'Wolli Creek', 'Arncliffe', 'Banksia', 'Rockdale', 'Kogarah', 'Carlton', 'Allawah', 'Hurstville',
    'Penshurst', 'Mortdale', 'Oatley', 'Como', 'Jannali', 'Sutherland', 'Loftus', 'Engadine', 'Heathcote', 'Waterfall',
    'Helensburgh', 'Otford', 'Stanwell Park', 'Coalcliff', 'Scarborough', 'Wombarra', 'Coledale', 'Austinmer', 'Thirroul', 'Bulli', 'Woonona', 'Bellambi',
    'Corrimal', 'Towradgi', 'Fairy Meadow', 'North Wollongong', 'Wollongong', 'Coniston', 'Unanderra', 'Kembla Grange', 'Dapto', 'Albion Park', 'Oak Flats',
    'Shellharbour Junction', 'Minnamurra', 'Bombo', 'Kiama', 'Gerringong', 'Berry', 'Bomaderry (Nowra)'],
  ['Sutherland', 'Kirrawee', 'Gymea', 'Miranda', 'Caringbah', 'Woolooware', 'Cronulla'],
  ['Coniston', 'Cringila', 'Lysaghts', 'Port Kembla North', 'Port Kembla'],
];

// Each line's routes: the stations it passes through, in order (the path between them follows the
// corridors). The City Circle is run round in full by T2, T3 and T8.
const LOOP = ['Central', 'Town Hall', 'Wynyard', 'Circular Quay', 'St James', 'Museum', 'Central'];
export const LINE_ROUTES = {
  T1: [['Emu Plains', 'Blacktown', 'Strathfield', 'Redfern', 'Central', 'Wynyard', 'Hornsby', 'Berowra'], ['Richmond', 'Blacktown']],
  T2: [['Leppington', 'Glenfield', 'Liverpool', 'Cabramatta', 'Merrylands', 'Granville', 'Lidcombe', 'Strathfield', 'Redfern', ...LOOP]],
  T3: [['Liverpool', 'Cabramatta', 'Regents Park', 'Lidcombe', 'Strathfield', 'Redfern', ...LOOP]],
  T4: [['Bondi Junction', 'Martin Place', 'Town Hall', 'Central', 'Redfern', 'Sydenham', 'Wolli Creek', 'Hurstville', 'Sutherland', 'Cronulla'], ['Sutherland', 'Waterfall']],
  T5: [['Leppington', 'Glenfield', 'Liverpool', 'Cabramatta', 'Merrylands', 'Harris Park', 'Parramatta', 'Blacktown', 'Richmond']],
  T6: [['Bankstown', 'Regents Park', 'Lidcombe']],
  T7: [['Olympic Park', 'Lidcombe']],
  T8: [['Macarthur', 'Glenfield', 'Wolli Creek', 'International Airport', ...LOOP], ['Wolli Creek', 'Sydenham', 'Redfern', 'Central']],
  T9: [['Hornsby', 'Epping', 'Strathfield', 'Redfern', 'Central', 'Wynyard', 'Chatswood', 'Gordon']],
  M1: [['Tallawong', 'Epping', 'Chatswood', 'Martin Place', 'Central', 'Waterloo', 'Sydenham']],
  BMT: [['Central', 'Strathfield', 'Parramatta', 'Blacktown', 'Emu Plains', 'Lithgow', 'Bathurst']],
  CCN: [['Central', 'Strathfield', 'Epping', 'Hornsby', 'Gosford', 'Newcastle Interchange']],
  HUN: [['Newcastle Interchange', 'Hamilton', 'Maitland', 'Scone'], ['Maitland', 'Dungog']],
  SCO: [['Central', 'Redfern', 'Sydenham', 'Wolli Creek', 'Hurstville', 'Sutherland', 'Waterfall', 'Wollongong', 'Bomaderry (Nowra)'], ['Coniston', 'Port Kembla']],
  SHL: [['Central', 'Redfern', 'Sydenham', 'Wolli Creek', 'Glenfield', 'Macarthur', 'Goulburn']],
};
// Line order inside a bundle of lines sharing track, outermost first.
export const BUNDLE_ORDER = ['T4', 'T8', 'T2', 'T3', 'T1', 'T9', 'T6', 'T7', 'T5', 'M1', 'SCO', 'SHL', 'BMT', 'CCN', 'HUN'];
const INTERCITY = new Set(['BMT', 'CCN', 'HUN', 'SCO', 'SHL']);

// Station names: the data's names without "Station" etc., matched by stationKey.
const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const segLen = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
export const polyLen = pts => pts.slice(1).reduce((s, p, i) => s + segLen(pts[i], p), 0);
// The point a distance d along a polyline, and the polyline between two distances.
export function pointAt(pts, d) {
  for (let i = 1; i < pts.length; i++) {
    const l = segLen(pts[i - 1], pts[i]);
    if (d <= l || i === pts.length - 1) return lerp(pts[i - 1], pts[i], l ? Math.min(1, Math.max(0, d / l)) : 0);
    d -= l;
  }
  return pts[pts.length - 1];
}
function slice(pts, d0, d1) {
  const out = [pointAt(pts, d0)];
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    acc += segLen(pts[i - 1], pts[i]);
    if (acc > d0 + 1e-9 && acc < d1 - 1e-9) out.push(pts[i]);
  }
  out.push(pointAt(pts, d1));
  return out;
}
const r2 = p => [Math.round(p[0] * 100) / 100, Math.round(p[1] * 100) / 100];

// Lay out the corridors: every station's position, and each pair of neighbouring stations' shape.
export function layout() {
  const pos = new Map();            // name → [x, y]
  const edges = new Map();          // "A|B" (sorted) → { a, b, pts (from a to b) }
  const adj = new Map();            // name → Set of neighbours
  const link = (a, b, pts) => {
    const [p, q] = a < b ? [a, b] : [b, a];
    const shape = a < b ? pts : pts.slice().reverse();
    edges.set(`${p}|${q}`, { a: p, b: q, pts: shape.map(r2) });
    for (const [x, y] of [[a, b], [b, a]]) { if (!adj.has(x)) adj.set(x, new Set()); adj.get(x).add(y); }
  };
  for (const c of CORRIDORS) {
    // Split at fixed stations; corners stay in the shape between them.
    let fixedName = c[0], fixedPt = NODES[c[0]], between = [], corners = [];
    if (!fixedPt) throw new Error(`corridor must start at a fixed station: ${c[0]}`);
    pos.set(fixedName, fixedPt);
    for (let i = 1; i < c.length; i++) {
      const item = c[i];
      if (Array.isArray(item)) { corners.push({ at: between.length, pt: item }); continue; }
      if (!NODES[item]) { between.push(item); continue; }
      // A run from fixedName to item through `between`, bending at the corners.
      const shape = [fixedPt];
      corners.forEach(k => shape.push(k.pt));
      shape.push(NODES[item]);
      const L = polyLen(shape), n = between.length + 1;
      const dist = k => (L * k) / n;
      const names = [fixedName, ...between, item];
      names.forEach((nm, k) => { if (!pos.has(nm)) pos.set(nm, r2(pointAt(shape, dist(k)))); });
      for (let k = 1; k < names.length; k++) link(names[k - 1], names[k], slice(shape, dist(k - 1), dist(k)));
      fixedName = item; fixedPt = NODES[item]; between = []; corners = [];
    }
    if (between.length) throw new Error(`corridor must end at a fixed station: ${c[c.length - 1]}`);
  }
  return { pos, edges, adj };
}

// Shortest path between two stations along the corridors (by length on the diagram).
export function corridorPath({ edges, adj }, from, to) {
  if (from === to) return [from];
  const dist = new Map([[from, 0]]), prev = new Map(), done = new Set();
  for (;;) {
    let u = null, best = Infinity;
    for (const [k, d] of dist) if (!done.has(k) && d < best) { best = d; u = k; }
    if (u === null) return null;
    if (u === to) break;
    done.add(u);
    for (const v of adj.get(u) || []) {
      const e = edges.get(u < v ? `${u}|${v}` : `${v}|${u}`);
      const nd = best + polyLen(e.pts);
      if (nd < (dist.get(v) ?? Infinity)) { dist.set(v, nd); prev.set(v, u); }
    }
  }
  const out = [to];
  while (out[0] !== from) out.unshift(prev.get(out[0]));
  return out;
}

// Each line's station sequences (one per route), from its routes.
export function lineSequences(lay) {
  const out = {};
  for (const [line, routes] of Object.entries(LINE_ROUTES)) {
    out[line] = routes.map(r => {
      const seq = [r[0]];
      for (let i = 1; i < r.length; i++) {
        const p = corridorPath(lay, r[i - 1], r[i]);
        if (!p) throw new Error(`${line}: no path from ${r[i - 1]} to ${r[i]}`);
        seq.push(...p.slice(1));
      }
      return seq;
    });
  }
  return out;
}

// Offset a polyline sideways by d (positive to the right of its direction), with mitred corners.
export function offsetLine(pts, d) {
  if (!d) return pts;
  const norm = (a, b) => { const l = segLen(a, b) || 1; return [-(b[1] - a[1]) / l, (b[0] - a[0]) / l]; };
  return pts.map((p, i) => {
    const n0 = i > 0 ? norm(pts[i - 1], p) : null, n1 = i < pts.length - 1 ? norm(p, pts[i + 1]) : null;
    if (!n0 || !n1) { const n = n0 || n1; return [p[0] - n[0] * d, p[1] - n[1] * d]; }
    const mx = n0[0] + n1[0], my = n0[1] + n1[1], ml = Math.hypot(mx, my) || 1;
    const k = 1 / Math.max(0.5, (n0[0] * mx + n0[1] * my) / ml);
    return [p[0] - (mx / ml) * d * k, p[1] - (my / ml) * d * k];
  });
}

// The diagram: station positions, each line drawn as offset pieces where lines share track, and the
// lookups the build uses to place trains and sections on it.
export function buildSchematic({ gap = 0.31 } = {}) {
  const lay = layout();
  const seqs = lineSequences(lay);
  const key = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  // Which lines use each edge; intercity lines only count (and are only drawn) where no suburban or metro line runs.
  const usedBy = new Map();
  for (const [line, ss] of Object.entries(seqs)) for (const s of ss) for (let i = 1; i < s.length; i++) {
    const k = key(s[i - 1], s[i]);
    if (!usedBy.has(k)) usedBy.set(k, new Set());
    usedBy.get(k).add(line);
  }
  const drawnOn = new Map();
  for (const [k, set] of usedBy) {
    const local = [...set].filter(l => !INTERCITY.has(l));
    drawnOn.set(k, (local.length ? local : [...set]).sort((a, b) => BUNDLE_ORDER.indexOf(a) - BUNDLE_ORDER.indexOf(b)));
  }
  const pieces = {}, piece = new Map();   // line → its drawn pieces; "line|A|B" → that piece (from A to B)
  for (const [k, ls] of drawnOn) {
    const e = lay.edges.get(k);
    ls.forEach((l, i) => {
      const pts = offsetLine(e.pts, (i - (ls.length - 1) / 2) * gap).map(r2);
      (pieces[l] ||= []).push(pts);
      piece.set(`${l}|${k}`, pts);
    });
  }
  // Stations: how wide the widest bundle through each one is (for the marker), and its lines.
  const width = new Map(), linesAt = new Map();
  for (const [k, ls] of drawnOn) for (const nm of k.split('|')) {
    width.set(nm, Math.max(width.get(nm) || 1, ls.length));
    if (!linesAt.has(nm)) linesAt.set(nm, new Set());
    ls.forEach(l => linesAt.get(nm).add(l));
  }
  for (const [line, ss] of Object.entries(seqs)) for (const s of ss) for (const nm of s) { if (!linesAt.has(nm)) linesAt.set(nm, new Set()); linesAt.get(nm).add(line); }
  // Each station's marker: lined up across its widest bundle (the line's direction there, in degrees),
  // or a ring where three or more stretches meet.
  const marker = new Map();
  for (const [nm, p] of lay.pos) {
    let best = null;
    for (const nb of lay.adj.get(nm) || []) {
      const k = key(nm, nb), n = (drawnOn.get(k) || []).length, e = lay.edges.get(k);
      const q = e.a === nm ? e.pts[1] : e.pts[e.pts.length - 2];
      if (!best || n > best.n) best = { n, ang: (Math.atan2(q[1] - p[1], q[0] - p[0]) * 180) / Math.PI };
    }
    marker.set(nm, { lines: Math.max(1, best?.n || 1), angle: Math.round(((best?.ang ?? 0) + 360) % 180), ring: (lay.adj.get(nm)?.size || 0) >= 3 });
  }
  return { lay, seqs, usedBy, drawnOn, pieces, piece, width, linesAt, marker, key, gap };
}

// Diagram termini emulate the official map's visual language: compact, coloured
// line-code tags adjacent to named termini. Coordinates remain this project's own.
export const TERMINUS_CALLOUTS = {
  T1: ['Berowra', 'Emu Plains', 'Richmond'],
  T2: ['Leppington'],
  T3: ['Liverpool'],
  T4: ['Bondi Junction', 'Cronulla'],
  T5: ['Richmond', 'Leppington'],
  T6: ['Bankstown'],
  T7: ['Olympic Park'],
  T8: ['Macarthur'],
  T9: ['Hornsby'],
  M1: ['Tallawong', 'Sydenham'],
};
export function terminalCallouts(layout) {
  const entries = [];
  for (const [line, termini] of Object.entries(TERMINUS_CALLOUTS)) {
    for (const name of termini) {
      const p = layout.pos.get(name);
      if (!p) throw new Error('Schematic terminus missing: ' + line + ' / ' + name);
      entries.push([line, name, ...p]);
    }
  }
  return entries;
}

// Where each station's name goes first: r / l (right or left), a / b (above or below), the corners al / ar /
// bl / br, or slanted at 45°: ur (up and to the right) and dl (down and to the left), for stations along
// horizontal stretches. Picked from the direction of the line through the station, with these exceptions.
// The page tries the other sides where the first one would cover a line or another name.
const LABEL_SIDE = {
  'Town Hall': 'l', 'Wynyard': 'l', 'Circular Quay': 'a', 'St James': 'r', 'Museum': 'r', 'Central': 'r', 'Martin Place': 'a', 'Gadigal': 'r',
  'Barangaroo': 'r', 'Kings Cross': 'a', 'Edgecliff': 'a', 'Bondi Junction': 'r', 'Redfern': 'bl', 'Waterloo': 'r',
  'Milsons Point': 'l', 'North Sydney': 'l', 'Waverton': 'l', 'Wollstonecraft': 'l', 'St Leonards': 'l', 'Artarmon': 'l', 'Chatswood': 'r',
  'Strathfield': 'b', 'Lidcombe': 'b', 'Granville': 'b', 'Harris Park': 'ur', 'Parramatta': 'ur', 'Blacktown': 'b', 'Emu Plains': 'b', 'Epping': 'r',
  'Erskineville': 'l', 'St Peters': 'l', 'Sydenham': 'l', 'Tempe': 'l', 'Wolli Creek': 'r', 'Hornsby': 'r', 'Glenfield': 'r', 'Cabramatta': 'r',
  'Merrylands': 'r', 'Regents Park': 'r', 'Olympic Park': 'a', 'Sutherland': 'r', 'Tallawong': 'a', 'Richmond': 'a', 'Leppington': 'b', 'Macarthur': 'r',
  'Lithgow': 'b', 'Bathurst': 'b', 'Newcastle Interchange': 'r', 'Hamilton': 'r', 'Scone': 'a', 'Dungog': 'a', 'Goulburn': 'b', 'Port Kembla': 'r',
  'Bomaderry (Nowra)': 'b', 'Cronulla': 'r', 'Waterfall': 'r', 'Wollongong': 'r', 'Coniston': 'l', 'Gosford': 'r', 'Berowra': 'r',
};
const SIDE_BY_LINE = [
  // Metro North West, East Hills, Leppington: names below the line.
  [['Rouse Hill', 'Kellyville', 'Bella Vista', 'Norwest', 'Hills Showground', 'Castle Hill', 'Cherrybrook'], 'dl'],
  [['Turrella', 'Bardwell Park', 'Bexley North', 'Kingsgrove', 'Beverly Hills', 'Narwee', 'Riverwood', 'Padstow', 'Revesby', 'Panania', 'East Hills', 'Holsworthy', 'Edmondson Park'], 'dl'],
  // South line and Richmond line: names to the left.
  [['Guildford', 'Yennora', 'Fairfield', 'Canley Vale', 'Warwick Farm', 'Liverpool', 'Casula', 'Marayong', 'Quakers Hill', 'Schofields', 'Riverstone', 'Vineyard', 'Mulgrave', 'Windsor', 'Clarendon', 'East Richmond'], 'l'],
  [['Macquarie University', 'Macquarie Park', 'North Ryde'], 'ur'],
];
for (const [names, side] of SIDE_BY_LINE) for (const n of names) LABEL_SIDE[n] ??= side;

export function labelSide(S, name) {
  if (LABEL_SIDE[name]) return LABEL_SIDE[name];
  const p = S.lay.pos.get(name);
  let h = 0, v = 0;
  for (const nb of S.lay.adj.get(name) || []) {
    const q = S.lay.pos.get(nb), dx = Math.abs(q[0] - p[0]), dy = Math.abs(q[1] - p[1]);
    if (dx > 2 * dy) h++; else if (dy > 2 * dx) v++;
  }
  return h > v ? 'ur' : 'r';
}

// Puts trains on the diagram. realXY(name) is a station's real position (projected, as the trains' are).
// A train goes on the stretch of its line between two stations that it is nearest, the same share of the
// way along that line's piece of the diagram; one far from any stretch of its line (off its usual route)
// is left off (null).
export function trainPlacer(S, realXY) {
  const stretches = {};
  for (const [line, seqs] of Object.entries(S.seqs)) {
    const seen = new Set(), list = (stretches[line] = []);
    for (const sq of seqs) for (let i = 1; i < sq.length; i++) {
      const k = S.key(sq[i - 1], sq[i]);
      if (seen.has(k)) continue;
      seen.add(k);
      const [a, b] = k.split('|'), A = realXY(a), B = realXY(b);
      if (A && B) list.push({ A, B, pts: S.piece.get(`${line}|${k}`) || S.lay.edges.get(k).pts });
    }
  }
  return (line, x, y) => {
    let best = null;
    for (const st of stretches[line] || []) {
      const [ax, ay] = st.A, dx = st.B[0] - ax, dy = st.B[1] - ay, L2 = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / L2));
      const d = Math.hypot(ax + dx * t - x, ay + dy * t - y);
      if (!best || d < best.d) best = { d, t, st, len: Math.sqrt(L2) };
    }
    if (!best || best.d > Math.max(300, best.len * 0.4)) return null; // 3 km, or 40% of the stretch
    return pointAt(best.st.pts, polyLen(best.st.pts) * best.t);
  };
}

// The sections an alert names ("between Waterfall and Sutherland"), on the diagram: each pair of named
// stations joined along the corridors, on the strands of the alert's lines (or the corridor's middle where
// none of them is drawn). Names are the diagram's; returns polylines.
export function diagramSections(S, nameLists, lines) {
  const out = [], done = new Set();
  for (const ns of nameLists) for (let i = 1; i < ns.length; i++) {
    const route = corridorPath(S.lay, ns[i - 1], ns[i]) || [];
    for (let j = 1; j < route.length; j++) {
      const k = S.key(route[j - 1], route[j]);
      const mine = (S.drawnOn.get(k) || []).filter(l => lines.includes(l));
      for (const pts of mine.length ? mine.map(l => S.piece.get(`${l}|${k}`)) : [S.lay.edges.get(k).pts]) {
        const fk = pts.join(';');
        if (!done.has(fk)) { done.add(fk); out.push(pts); }
      }
    }
  }
  return out;
}
