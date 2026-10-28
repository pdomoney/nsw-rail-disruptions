// Read-only GTFS network geography audit. Does not modify coordinates or routes.
import { decodeChain } from './geo.js';
import { project } from './netmap.js';

const finite = n => typeof n === 'number' && Number.isFinite(n);
const round = (n, places = 1) => n == null || !Number.isFinite(n) ? null : Number(n.toFixed(places));
const percentile = (values, fraction) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.ceil(fraction * sorted.length) - 1];
};

function validSegments(network, line) {
  const segments = [];
  for (const encoded of network.lines?.[line] || []) {
    if (!Array.isArray(encoded) || encoded.length < 4 || encoded.length % 2) continue;
    const chain = decodeChain(encoded);
    for (let i = 1; i < chain.length; i++) {
      const [ax, ay] = chain[i - 1], [bx, by] = chain[i];
      if ([ax, ay, bx, by].every(finite) && (ax !== bx || ay !== by))
        segments.push([ax, ay, bx, by]);
    }
  }
  return segments;
}
function distanceUnits(x, y, [ax, ay, bx, by]) {
  const dx = bx - ax, dy = by - ay;
  const u = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(x - (ax + u * dx), y - (ay + u * dy));
}
function closestUnits(x, y, segments) {
  if (!finite(x) || !finite(y) || !segments.length) return null;
  let best = Infinity;
  for (const segment of segments) best = Math.min(best, distanceUnits(x, y, segment));
  return best;
}
// Spatial index for the optional reference route sample comparison.
function indexSegments(segments, cellSize = 200) {
  const buckets = new Map();
  for (const segment of segments) {
    const [ax, ay, bx, by] = segment;
    for (let gx = Math.floor(Math.min(ax, bx) / cellSize); gx <= Math.floor(Math.max(ax, bx) / cellSize); gx++)
      for (let gy = Math.floor(Math.min(ay, by) / cellSize); gy <= Math.floor(Math.max(ay, by) / cellSize); gy++) {
        const key = gx + ',' + gy;
        if (!buckets.has(key)) buckets.set(key, []);
        buckets.get(key).push(segment);
      }
  }
  return { buckets, cellSize };
}
function nearIndexed(x, y, index, thresholdUnits) {
  const { buckets, cellSize } = index;
  const cx = Math.floor(x / cellSize), cy = Math.floor(y / cellSize);
  const radius = Math.ceil(thresholdUnits / cellSize) + 1;
  for (let dx = -radius; dx <= radius; dx++) for (let dy = -radius; dy <= radius; dy++)
    for (const segment of buckets.get((cx + dx) + ',' + (cy + dy)) || [])
      if (distanceUnits(x, y, segment) <= thresholdUnits) return true;
  return false;
}
function referencePaths(feature) {
  const g = feature?.geometry;
  if (g?.type === 'LineString') return [g.coordinates];
  if (g?.type === 'MultiLineString') return g.coordinates;
  return [];
}
function samplesFor(path, unit, stepMeters = 500, maxSamples = 750) {
  if (!Array.isArray(path)) return [];
  const points = path.map(p => Array.isArray(p) && finite(p[0]) && finite(p[1]) &&
    Math.abs(p[0]) <= 180 && Math.abs(p[1]) <= 90 ? project(p[1], p[0]) : null).filter(Boolean);
  if (points.length < 2) return [];
  const samples = [points[0]];
  let walked = 0, next = stepMeters / unit;
  for (let i = 1; i < points.length && samples.length < maxSamples; i++) {
    const a = points[i - 1], b = points[i], length = Math.hypot(a[0] - b[0], a[1] - b[1]);
    if (!length) continue;
    while (next <= walked + length && samples.length < maxSamples) {
      const t = (next - walked) / length;
      samples.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
      next += stepMeters / unit;
    }
    walked += length;
  }
  if (samples.length < maxSamples) samples.push(points.at(-1));
  return samples;
}

export function auditNetworkGeometry(network, { live = null, reference = null,
  source = null, stationToleranceM = 150, referenceToleranceM = 100 } = {}) {
  if (!network || !network.lines || !Array.isArray(network.stations))
    throw new Error('Expected a published network.json with lines and stations');
  if (!(stationToleranceM > 0) || !(referenceToleranceM > 0))
    throw new Error('Tolerances must be positive');
  const unit = network.unit || 10;
  if (!(finite(unit) && unit > 0)) throw new Error('Invalid network unit');
  const segments = Object.fromEntries(Object.keys(network.lines).sort().map(line => [line, validSegments(network, line)]));
  const stationPairs = [];
  for (const [name, x, y, lineText] of network.stations) {
    for (const line of String(lineText || '').split(/\s+/).filter(Boolean)) {
      const closest = closestUnits(x, y, segments[line] || []);
      const metres = closest == null ? null : closest * unit;
      stationPairs.push({ station: name, line, distanceM: round(metres),
        classification: metres == null ? 'missing-geometry' : metres <= stationToleranceM ? 'within-tolerance' : 'review-offset' });
    }
  }
  stationPairs.sort((a, b) => a.line.localeCompare(b.line) || a.station.localeCompare(b.station));
  const columns = live?.cols || [], ix = key => columns.indexOf(key);
  const hasGeo = ix('x') >= 0 && ix('y') >= 0, hasDiagram = ix('sx') >= 0 && ix('sy') >= 0;
  const liveRows = Array.isArray(live?.trains) ? live.trains : [], byLine = {};
  for (const line of Object.keys(segments).sort()) {
    const ss = stationPairs.filter(s => s.line === line), ds = ss.map(s => s.distanceM).filter(finite);
    const ls = liveRows.filter(row => row[ix('line')] === line);
    byLine[line] = {
      segmentCount: segments[line].length,
      routeLengthKm: round(segments[line].reduce((sum, [ax, ay, bx, by]) => sum + Math.hypot(ax - bx, ay - by) * unit / 1000, 0), 2),
      stationLinePairs: ss.length,
      withinTolerance: ss.filter(s => s.classification === 'within-tolerance').length,
      reviewOffsets: ss.filter(s => s.classification === 'review-offset').length,
      missingGeometry: ss.filter(s => s.classification === 'missing-geometry').length,
      p95StationOffsetM: round(percentile(ds, .95)),
      maxStationOffsetM: round(ds.length ? Math.max(...ds) : null),
      snapshotVehicleRows: ls.length,
      rowsWithGeographicCoordinates: hasGeo ? ls.filter(r => finite(r[ix('x')]) && finite(r[ix('y')])).length : null,
      rowsWithTrustedDiagramPlacement: hasDiagram ? ls.filter(r => finite(r[ix('sx')]) && finite(r[ix('sy')])).length : null,
    };
  }
  const result = {
    schema: 'nsw-rail-geometry-audit/v1',
    input: { networkGeneratedAt: network.generatedAt || null, liveSnapshotAt: live?.at || null,
      stationToleranceM, referenceToleranceM, source: source || null },
    summary: {
      lines: Object.keys(segments).length, stationLinePairs: stationPairs.length,
      withinTolerance: stationPairs.filter(s => s.classification === 'within-tolerance').length,
      reviewOffsets: stationPairs.filter(s => s.classification === 'review-offset').length,
      missingGeometry: stationPairs.filter(s => s.classification === 'missing-geometry').length,
      liveRows: liveRows.length
    },
    byLine,
    stationExceptions: stationPairs.filter(s => s.classification !== 'within-tolerance'),
  };
  if (reference !== null) {
    if (reference.type !== 'FeatureCollection' || !Array.isArray(reference.features))
      throw new Error('Expected a GeoJSON FeatureCollection');
    const indices = Object.fromEntries(Object.entries(segments).map(([line, ss]) => [line, indexSegments(ss)]));
    const compared = {}, exceptions = [];
    let unknownLineFeatures = 0, invalidGeometryFeatures = 0;
    for (let n = 0; n < reference.features.length; n++) {
      const feature = reference.features[n], props = feature?.properties || {};
      const line = String(props.route_short_name || props.ROUTE_SHORT_NAME || props.line || '').trim();
      const paths = referencePaths(feature);
      if (!paths.length) { invalidGeometryFeatures++; continue; }
      if (!indices[line]) { unknownLineFeatures++; continue; }
      const samples = paths.flatMap(p => samplesFor(p, unit));
      if (!samples.length) { invalidGeometryFeatures++; continue; }
      const stat = compared[line] ||= { features: 0, samples: 0, nearRouteSamples: 0 };
      let near = 0;
      const outsideSamples = [];
      for (let sampleIndex=0;sampleIndex<samples.length;sampleIndex++) {
        const [x,y]=samples[sampleIndex];
        if (nearIndexed(x,y,indices[line],referenceToleranceM/unit)) { near++; continue; }
        if (outsideSamples.length >= 8) continue; // bounded shape-review attachment
        const nearest=closestUnits(x,y,segments[line]);
        // Inverse of the explicitly documented local map projection. These
        // approximate points are for locating reference geometry differences,
        // never replacement positions for a train/station/track.
        const longitude=151+x/((111320*Math.cos(-33.87*Math.PI/180))/10);
        const latitude=-33.87-y/(110574/10);
        outsideSamples.push({
          sampleIndex,
          referenceLatitude:round(latitude,5),
          referenceLongitude:round(longitude,5),
          nearestInstalledRouteM:round(nearest==null?null:nearest*unit,1),
        });
      }
      stat.features++; stat.samples += samples.length; stat.nearRouteSamples += near;
      if (near < samples.length) exceptions.push({
        featureIndex: n, line, shapeId: String(props.shape_id || props.SHAPE_ID || ''),
        matchedSamples: near, sampledPoints: samples.length, outsideSamples
      });
    }
    for (const v of Object.values(compared))
      v.sampleCoveragePercent = round(v.samples ? v.nearRouteSamples / v.samples * 100 : null);
    result.reference = {
      totalFeatures: reference.features.length, unknownLineFeatures, invalidGeometryFeatures,
      comparedByLine: Object.fromEntries(Object.entries(compared).sort(([a], [b]) => a.localeCompare(b))),
      featureExceptions: exceptions.slice(0, 200),
      truncatedExceptions: Math.max(0, exceptions.length - 200)
    };
  }
  return result;
}
