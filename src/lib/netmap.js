// The network map: track geometry projected to a flat plane, station positions, trains placed on it,
// and the sections named in current alerts ("between Waterfall and Sutherland") traced along the track.
import { decodeChain, encodeChain } from './geo.js';

// Equirectangular projection around Sydney, in units of 10 m (x east, y south).
const LAT0 = -33.87, LON0 = 151.0;
const KX = (111_320 * Math.cos((LAT0 * Math.PI) / 180)) / 10;
const KY = 110_574 / 10;
export const project = (lat, lon) => [Math.round((lon - LON0) * KX), Math.round((LAT0 - lat) * KY)];

// "Central Station" / "Bomaderry (Nowra) Station" / "Dulwich Hill Light Rail" → "central" / "bomaderry" / "dulwich hill"
export function stationKey(name) {
  return String(name || '').toLowerCase()
    .replace(/\(.*?\)/g, ' ')
    .replace(/\b(station|light rail|metro|interchange)\b/g, ' ')
    .replace(/[^a-z0-9' ]+/g, ' ').replace(/\s+/g, ' ').trim();
}

// Station names in an alert's "between …" phrases: "between Waterfall, Cronulla and Hurstville" →
// [['Waterfall', 'Cronulla', 'Hurstville']]; and the place in "… at Town Hall".
export function alertPlaces(text) {
  const s = String(text || '');
  const between = [];
  const re = /\bbetween ((?:[A-Z][\w'’-]*(?: [A-Z][\w'’-]*| &)*)(?:(?:, | and | or |, and )(?:[A-Z][\w'’-]*(?: [A-Z][\w'’-]*| &)*))+)/g;
  let m;
  while ((m = re.exec(s))) {
    const names = m[1].split(/, and |, | and | or /).map(x => x.trim()).filter(x => x && !/\b(stations?|line)$/i.test(x));
    if (names.length >= 2) between.push(names);
  }
  const at = [];
  const reAt = /\b(?:at|near) ((?:[A-Z][\w'’-]*)(?: [A-Z][\w'’-]*){0,3})/g;
  while ((m = reAt.exec(s))) {
    const name = m[1].replace(/\s+(Station|Platform)$/i, '').trim();
    if (!/^(The|This|A|An|Times|Least|Short|Least|All|Some)$/i.test(name)) at.push(name);
  }
  return { between, at };
}

// The places an alert says are affected. An alert also says where trains still run ("Trains run to a
// changed timetable between Cronulla, Sutherland and Bondi Junction"), where extra trains or metro
// services run, and where to change; those sentences name stations too but are not the closure.
// - kind 'closed' (trackwork): only sentences that close something: buses replace or run instead of
//   trains, trains do not run or do not stop, a section is closed or suspended.
// - kind 'incident': every sentence except those that only say where trains are still running.
// "the City" and "the City Circle" are taken as Central, so "between Sydenham and the City" is traced.
const CLOSES = /\bbuses (?:also )?(?:replace|run)\b|\b(?:do|does|will) not (?:run|stop)\b|\bnot (?:running|stopping)\b|\bno (?:trains|services|metro|light rail|trams)\b|\bclosed\b|\bsuspended\b/i;
const RUNS = /\b(?:runs?|running|operat(?:e|es|ing)|continue|extra stops?)\b/i;
const TROUBLE = /\bnot\b|\bno\b|delay|replac|suspend|disrupt|cancel|reduced|extra travel time|incident|closed|stopped/i;
export const alertSentences = text => String(text || '')
  .split(/(?<=[.!?])\s+(?=[A-Z0-9•-])|\n+|\s+[•-]\s+/)
  .map(s => s.replace(/^[•\s-]+/, '').trim()).filter(Boolean);
export function affectedPlaces(text, kind) {
  const keep = alertSentences(text).filter(s => kind === 'closed' ? CLOSES.test(s) : !(RUNS.test(s) && !TROUBLE.test(s)));
  const between = [], at = [], seen = new Set();
  for (const s of keep) {
    const p = alertPlaces(s.replace(/\bthe City(?: Circle)?\b/g, 'Central'));
    for (const names of p.between) { const k = names.join('|'); if (!seen.has(k)) { seen.add(k); between.push(names); } }
    for (const name of p.at) if (!at.includes(name)) at.push(name);
  }
  return { between, at };
}

// Undirected graph of the whole network's track, with nearby points of different lines joined (so a
// path can run from one line's track onto another's at junctions and shared corridors).
export class TrackGraph {
  constructor(linesChains, { joinUnits = 4, stepUnits = 25 } = {}) {
    this.nodes = [];               // [x, y]
    this.lines = [];               // node → Set of lines whose track it is on
    this.index = new Map();        // "x,y" → node id
    this.adj = [];                 // node → [[node, cost], …]
    const id = ([x, y], line) => {
      const k = `${x},${y}`;
      let i = this.index.get(k);
      if (i === undefined) { i = this.nodes.length; this.index.set(k, i); this.nodes.push([x, y]); this.adj.push([]); this.lines.push(new Set()); }
      this.lines[i].add(line);
      return i;
    };
    const link = (a, b) => {
      if (a === b) return;
      const [ax, ay] = this.nodes[a], [bx, by] = this.nodes[b];
      const d = Math.hypot(ax - bx, ay - by);
      this.adj[a].push([b, d]);
      this.adj[b].push([a, d]);
    };
    // Long straight stretches have points added every stepUnits (250 m), so every station is near a point.
    for (const [line, chains] of Object.entries(linesChains)) {
      for (const chain of chains) {
        let prev = null, prevP = null;
        for (const p of chain) {
          if (prevP) {
            const n = Math.floor(Math.hypot(p[0] - prevP[0], p[1] - prevP[1]) / stepUnits);
            for (let k = 1; k <= n; k++) {
              const q = [Math.round(prevP[0] + ((p[0] - prevP[0]) * k) / (n + 1)), Math.round(prevP[1] + ((p[1] - prevP[1]) * k) / (n + 1))];
              const j = id(q, line); link(prev, j); prev = j;
            }
          }
          const i = id(p, line);
          if (prev !== null) link(prev, i);
          prev = i; prevP = p;
        }
      }
    }
    // Join points closer than joinUnits (40 m) that are not already connected.
    const cell = joinUnits;
    const grid = new Map();
    this.nodes.forEach(([x, y], i) => {
      const k = `${Math.floor(x / cell)},${Math.floor(y / cell)}`;
      if (!grid.has(k)) grid.set(k, []);
      grid.get(k).push(i);
    });
    this.nodes.forEach(([x, y], i) => {
      const cx = Math.floor(x / cell), cy = Math.floor(y / cell);
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
        for (const j of grid.get(`${cx + dx},${cy + dy}`) || []) {
          if (j <= i) continue;
          const [jx, jy] = this.nodes[j];
          if (Math.hypot(jx - x, jy - y) <= joinUnits && !this.adj[i].some(([n]) => n === j)) link(i, j);
        }
      }
    });
    this.grid = grid;
    this.cell = cell;
    // A track that ends near another one (a branch whose first point falls between two points of the
    // main line) is joined to it, within 150 m.
    this.nodes.forEach((p, i) => {
      if (this.adj[i].length !== 1) return;
      const own = new Set([i, this.adj[i][0][0]]);
      const j = this.nearestWhere(p, 15, n => !own.has(n));
      if (j >= 0) link(i, j);
    });
  }

  // Nearest node to a point, within maxUnits; on one of the given lines' track if there is one in reach.
  nearest([x, y], maxUnits = 60, lines = null) {
    if (lines?.length) {
      const set = new Set(lines);
      const i = this.nearestWhere([x, y], maxUnits, n => [...this.lines[n]].some(l => set.has(l)));
      if (i >= 0) return i;
    }
    return this.nearestWhere([x, y], maxUnits, () => true);
  }

  nearestWhere([x, y], maxUnits, ok) {
    let best = -1, bd = Infinity;
    const r = Math.ceil(maxUnits / this.cell);
    const cx = Math.floor(x / this.cell), cy = Math.floor(y / this.cell);
    for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) {
      for (const j of this.grid.get(`${cx + dx},${cy + dy}`) || []) {
        if (!ok(j)) continue;
        const [jx, jy] = this.nodes[j];
        const d = Math.hypot(jx - x, jy - y);
        if (d < bd) { bd = d; best = j; }
      }
    }
    return bd <= maxUnits ? best : -1;
  }

  // Shortest path between two nodes, as a list of points (Dijkstra with a binary heap).
  path(a, b) {
    if (a < 0 || b < 0) return null;
    const dist = new Float64Array(this.nodes.length).fill(Infinity);
    const prev = new Int32Array(this.nodes.length).fill(-1);
    const heap = [[0, a]];
    dist[a] = 0;
    const push = item => { heap.push(item); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
    const pop = () => {
      const top = heap[0], last = heap.pop();
      if (heap.length) {
        heap[0] = last;
        let i = 0;
        for (;;) {
          const l = 2 * i + 1, r = l + 1;
          let m = i;
          if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
          if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
          if (m === i) break;
          [heap[m], heap[i]] = [heap[i], heap[m]];
          i = m;
        }
      }
      return top;
    };
    while (heap.length) {
      const [d, u] = pop();
      if (u === b) break;
      if (d > dist[u]) continue;
      for (const [v, w] of this.adj[u]) {
        const nd = d + w;
        if (nd < dist[v]) { dist[v] = nd; prev[v] = u; push([nd, v]); }
      }
    }
    if (!Number.isFinite(dist[b])) return null;
    const out = [];
    for (let u = b; u !== -1; u = prev[u]) out.push(this.nodes[u]);
    return out.reverse();
  }
}

// Decode stored chains (lat/lon × grid) and project them.
export function projectChains(flatChains, grid = 1e4) {
  return flatChains.map(c => decodeChain(c).map(([la, lo]) => project(la / grid, lo / grid)));
}

export { encodeChain };
