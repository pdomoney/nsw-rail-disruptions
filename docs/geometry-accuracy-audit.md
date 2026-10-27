# NSW rail geography — accuracy audit (Phase 2A)

This introduces a **read-only** audit for a current published network build. It does not move stations or trains, rewrite routes, or alter the independently calibrated 2024 official TfNSW diagram.

## Run after the collector/build

    node scripts/audit-network-geometry.mjs --network site/data/network.json --live site/data/live.json --output artifacts/map-geometry-audit.json

Optionally compare an authorised TfNSW GeoJSON download:

    node scripts/audit-network-geometry.mjs --network site/data/network.json --live site/data/live.json --reference /path/to/sydney-train-routes.geojson --source-url https://opendata.transport.nsw.gov.au/data/dataset/sydney-train-routes --downloaded-on YYYY-MM-DD --output artifacts/map-reference-audit.json

Use the **actual acquisition date**. The report includes a SHA-256 hash of the local reference file, the source URL and date entered by the operator, and comparison counts. The TfNSW portal may require account login to download routes; its catalogue update time is not evidence that a particular file was fetched or verified. Never embed credentials in GitHub Pages.

## Output and interpretation

- For each public line: polyline segment count, approximate sum of segment lengths, station–line pairs within 150 m of **that line's route**, stations without available geometry and offsets requiring manual review. Distances are measured to line **segments**, not only vertices.
- Per-line live **snapshot** counts distinguish reported geographic coordinates from successfully matched official-diagram placement. These are not proof of true GPS accuracy or position freshness.
- Optional external GeoJSON features match by public route short name. Sampled route points within 100 m of the installed same-line geometry are counted; unsupported or unknown lines are explicitly reported. Feature shape IDs are retained for review where supplied.
- Geometry is sampled every 500 m, capped per feature. Branches, duplicate trips and shared tracks mean summed segment lengths are **not unique route kilometres**. Sample agreement is not timetable/service identity.
- A flagged station offset may represent a legitimate interchange/platform displacement, a static feed mismatch or missing routes, **not necessarily an error**.

## Phase 2 follow-up

Acquire the authorised TfNSW 2026 GeoJSON with a verifiable checksum and date, run the report using current data, review line/shape mismatches, and cross-check station offsets against official station/platform information. Compare service identity using GTFS route, shape, trip and feed-date metadata before changing a line. Sydney Train Routes is not necessarily complete coverage for Metro, light rail and Intercity feeds. Any newer official TfNSW network-map edition needs separate vector symbol calibration; longitude/latitude **must never** be mapped directly into the 2024 PDF's image coordinates.

This phase provides measurement tooling, not a claim of an already verified accuracy improvement.
