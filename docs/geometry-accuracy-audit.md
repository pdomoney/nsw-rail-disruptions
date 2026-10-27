# NSW rail geography audit: Phases 2A and 2B

The audit is read-only. It does not move rail lines, stations, trains, or alter the verified 2024 official network PDF.

## Daily production-data evidence

Open Actions > Map geometry accuracy audit. A daily scheduled run and manual Run workflow are available after merge. The independent audit job checks out the latest collected data branch, records its exact SHA, rebuilds the site data without a TfNSW API key, and produces a GitHub Actions summary plus a downloadable rail-map-geometry-audit artifact.

The artifact holds geometry-audit.json, review-summary.md, line-indicators.csv, station-exceptions.csv and data-branch-sha.txt. This does not deploy the site or alter five-minute collection.

## Manual run

    DATA_DIR=data OUT_DIR=dist node src/build.js
    node scripts/audit-network-geometry.mjs --network dist/data/network.json --live dist/data/live.json --output audit-artifacts/geometry-audit.json
    node scripts/render-geometry-audit.mjs --input audit-artifacts/geometry-audit.json --out-dir audit-artifacts

For operator-provided *authorised* GeoJSON, add the --reference /path/to/file.geojson --source-url URL --downloaded-on YYYY-MM-DD options to the second command. The SHA-256 of the actual reference file is recorded automatically. The TfNSW portal login must not be placed in Pages or repository code.

## Interpretation and remaining work

The 150 m station-to-same-line offset threshold requests manual review, not automatic correction. Interchange/platform positions, missing feed geometry and service route variants require different treatment. Summed segment distance is not unique route kilometres. Snapshot vehicle coordinate fields and 2024 PDF matches are separate indicators, neither proof of exact live GPS position.

Complete Issue #45 by acquiring authenticated current TfNSW GeoJSON, recording provenance, reviewing the station exceptions and comparing route/shape/trip identifiers and feed versions. Metro, light rail and Intercity should be audited against their own feeds. A genuinely newer official TfNSW network map must be vector-calibrated separately before replacing the 2024 image.

This phase creates repeatable diagnostic evidence, not a claim that the geometry is already corrected.
