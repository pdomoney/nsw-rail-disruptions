#!/usr/bin/env node
// Generate a read-only geography report from an actual network build.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { auditNetworkGeometry } from '../src/lib/geometry-audit.js';
import { addStationServiceEvidence } from '../src/lib/station-service-evidence.js';

const args = process.argv.slice(2);
const option = name => { const n = args.indexOf(name); return n < 0 ? null : args[n + 1]; };
if (args.includes('--help')) {
  console.log('Usage: node scripts/audit-network-geometry.mjs [--network dist/data/network.json] [--live dist/data/live.json] [--station-dir data/stations] [--reference authorised-routes.geojson --source-url URL --downloaded-on YYYY-MM-DD] [--output report.json]');
  process.exit(0);
}
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
try {
  const referencePath = option('--reference'), outputPath = option('--output');
  const provenancePath = option('--reference-provenance');
  const provenance = provenancePath ? read(provenancePath) : null;
  const source = referencePath ? {
    kind: 'operator-provided GeoJSON; authenticity and licence require human review',
    url: option('--source-url'), downloadedOn: option('--downloaded-on'),
    fileName: path.basename(referencePath),
    sha256: createHash('sha256').update(fs.readFileSync(referencePath)).digest('hex'),
    sourceObjectIdCount:provenance?.sourceObjectIdCount ?? null,
    excludedGeometryCount:provenance?.excludedGeometryCount ?? null,
    comparisonCoverage:provenance?.comparisonCoverage ?? 'not_verified',
    portalLastUpdatedValues: Array.isArray(provenance?.portalLastUpdatedValues) ?
      provenance.portalLastUpdatedValues : [],
  } : null;
  if (provenance && (!source || source.sha256 !== provenance.sha256))
    throw new Error('Reference source checksum does not match its provenance manifest');
  let report = auditNetworkGeometry(read(option('--network') || 'site/data/network.json'), {
    live: option('--live') ? read(option('--live')) : null,
    reference: referencePath ? read(referencePath) : null, source
  });
  const stationDir = option('--station-dir');
  if (stationDir) {
    const feedFiles = fs.readdirSync(stationDir).filter(name => name.endsWith('.json')).sort()
      .map(name => read(path.join(stationDir, name)));
    if (!feedFiles.length) throw new Error('No GTFS station JSON sources in ' + stationDir);
    report = addStationServiceEvidence(report, feedFiles);
  }
  const content = JSON.stringify(report, null, 2) + '\n';
  if (outputPath) {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, content);
  } else process.stdout.write(content);
} catch (error) {
  console.error('Geometry audit failed:', error.message);
  process.exitCode = 1;
}
