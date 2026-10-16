// Track geometry for the network map: GTFS shapes simplified, snapped to a ~10 m grid, merged into one
// set of track segments per line (shared track is stored once per line), and joined back into chains.

const LAT0 = -33.87;                       // Sydney
const M_PER_DEG_LAT = 110_574;
const M_PER_DEG_LON = 111_320 * Math.cos((LAT0 * Math.PI) / 180);
export const GRID = 1e4;                   // coordinates are stored as integers of 1/10 000 of a degree

// Douglas–Peucker simplification of [[lat, lon], …] with a tolerance in metres.
export function simplify(points, tolM) {
  if (points.length <= 2) return points.slice();
  const xy = points.map(([la, lo]) => [lo * M_PER_DEG_LON, la * M_PER_DEG_LAT]);
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const [ax, ay] = xy[a], [bx, by] = xy[b];
    const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
    let maxD = -1, idx = -1;
    for (let i = a + 1; i < b; i++) {
      const [px, py] = xy[i];
      let d;
      if (len2 === 0) d = Math.hypot(px - ax, py - ay);
      else {
        const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
        d = Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
      }
      if (d > maxD) { maxD = d; idx = i; }
    }
    if (maxD > tolM && idx > 0) { keep[idx] = 1; stack.push([a, idx], [idx, b]); }
  }
  return points.filter((_, i) => keep[i]);
}

const key = (a, b) => `${a},${b}`;

// Collects track segments per line. add(line, [[lat, lon], …]) for each shape; then chains().
export class TrackBuilder {
  constructor({ tolM = 15 } = {}) {
    this.tolM = tolM;
    this.edges = new Map(); // line → Map(edgeKey → [nodeA, nodeB])
  }

  add(line, points) {
    const snapped = [];
    for (const [la, lo] of simplify(points, this.tolM)) {
      const p = [Math.round(la * GRID), Math.round(lo * GRID)];
      const last = snapped[snapped.length - 1];
      if (!last || last[0] !== p[0] || last[1] !== p[1]) snapped.push(p);
    }
    let m = this.edges.get(line);
    if (!m) this.edges.set(line, (m = new Map()));
    for (let i = 1; i < snapped.length; i++) {
      const a = key(...snapped[i - 1]), b = key(...snapped[i]);
      const k = a < b ? `${a}|${b}` : `${b}|${a}`;
      if (!m.has(k)) m.set(k, [a, b]);
    }
  }

  // { line: [chain, …] } where a chain is a flat list of integers: the first point's latitude and
  // longitude (× GRID), then the change in each for every following point.
  chains() {
    const out = {};
    for (const [line, edges] of this.edges) out[line] = edgesToChains([...edges.values()]).map(encodeChain);
    return out;
  }
}

// Join undirected edges [[a, b], …] (node keys "lat,lon") into as few polylines as possible.
export function edgesToChains(edges) {
  const adj = new Map();
  const link = (a, b, i) => { if (!adj.has(a)) adj.set(a, []); adj.get(a).push([b, i]); };
  edges.forEach(([a, b], i) => { link(a, b, i); link(b, a, i); });
  const used = new Uint8Array(edges.length);
  const chains = [];
  const walk = start => {
    for (const [, i] of adj.get(start)) {
      if (used[i]) continue;
      const chain = [start];
      let cur = start, edge = i;
      for (;;) {
        used[edge] = 1;
        const [a, b] = edges[edge];
        const next = a === cur ? b : a;
        chain.push(next);
        cur = next;
        const nbrs = adj.get(cur);
        if (nbrs.length !== 2) break;
        const nxt = nbrs.find(([, j]) => !used[j]);
        if (!nxt) break;
        edge = nxt[1];
      }
      chains.push(chain);
    }
  };
  // Start at ends and junctions first, then pick up loops.
  for (const [node, nbrs] of adj) if (nbrs.length !== 2) walk(node);
  for (const [node] of adj) walk(node);
  return chains.map(c => c.map(k => k.split(',').map(Number)));
}

export function encodeChain(points) {
  const out = [points[0][0], points[0][1]];
  for (let i = 1; i < points.length; i++) out.push(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
  return out;
}

export function decodeChain(flat) {
  const pts = [[flat[0], flat[1]]];
  for (let i = 2; i < flat.length; i += 2) {
    const [la, lo] = pts[pts.length - 1];
    pts.push([la + flat[i], lo + flat[i + 1]]);
  }
  return pts;
}
