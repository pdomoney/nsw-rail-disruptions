# Phase 4A: public NSW GTFS route comparison

**Status:** evidence-only, on demand. No TfNSW route, train, stop, official diagram or GitHub Pages publishing changes.

## Candidate sources

TfNSW's Sydney Train Routes dataset (https://opendata.transport.nsw.gov.au/dataset/sydney-train-routes) is derived from Sydney Trains GTFS static shapes.txt. Its GeoJSON download may require portal login. A catalogue date is not proof of downloaded file contents.

NSW's public Hosted TfNSW GTFS Routes ArcGIS layer (https://portal.data.nsw.gov.au/arcgis/rest/services/Hosted/TfNSW_GTFS_Routes_Public/FeatureServer/0) is queryable as GeoJSON and exposes route_short_name, route_id, shape_id and portal_last_updated. Its equivalence to the portal GeoJSON or the exact GTFS release has not been demonstrated. Treat it as **candidate cross-check data**, not independent track surveying evidence.

## Run the comparison

GitHub Actions → **Compare public NSW route geometry** → **Run workflow**, selecting main. The workflow checks out a pinned data branch revision, builds the current website data, and reads the fixed public ArcGIS layer. No API key or site credentials are required.

The fetch checks layer schema, retrieves the complete feature ID list, requests all features in batches, and validates completeness, duplicates, NSW geographic coordinates, polyline geometry and recognisable train line names. It fails closed on incomplete pages or schema drift; an error is not permission to infer route positions.

Artifacts are available for 28 days as nsw-rail-public-route-comparison:

- reference-routes.geojson — retrieved public route shapes, not committed to the app
- reference-provenance.json — acquisition timestamp, source URL, service ID, feature count, update fields and SHA-256
- geometry-audit.json — existing station / vehicle QA plus source-to-site sampled route geometry comparison
- reference-review.md and reference-coverage.csv — matched route count, sample matching within 100 m, unmatched / invalid features and shape IDs requiring review
- review-summary.md, station-exceptions.csv, line-indicators.csv and data-branch-sha.txt — earlier GTFS diagnostics and pinned data revision

## Limitations and next actions

The comparison samples public reference geometry toward installed GTFS lines only. A high match does not prove physical or temporal accuracy, and this phase does not yet prove all installed paths exist in the reference. TfNSW may produce both sources from the same feed. Differences may result from shape IDs, route variants, timetable dates, feed age, simplification or missing service coverage.

This source principally concerns Sydney Trains and must not be misrepresented as complete Metro, Light Rail and Intercity verification. Do not snap stations, hide valid special services or alter schematic calibration from these results. Next: reconcile exact shape IDs, service calendars and per-mode sources; review real discrepancies with source provenance before any coordinate change.

## Local evidence capture

```bash
DATA_DIR=data OUT_DIR=dist node src/build.js
node scripts/fetch-public-route-reference.mjs --out-dir audit-artifacts/reference
node scripts/audit-network-geometry.mjs \
  --network dist/data/network.json --live dist/data/live.json \
  --station-dir data/stations \
  --reference audit-artifacts/reference/reference-routes.geojson \
  --source-url https://portal.data.nsw.gov.au/arcgis/rest/services/Hosted/TfNSW_GTFS_Routes_Public/FeatureServer/0 \
  --downloaded-on "$(date -u +%F)" \
  --output audit-artifacts/reference/geometry-audit.json
node scripts/render-reference-comparison.mjs \
  --input audit-artifacts/reference/geometry-audit.json \
  --out-dir audit-artifacts/reference
```

## Corrective source validation after object 54407 (PR #55)

The initial source fetch rejected `objectId=54407` as a four-part `MultiLineString`. The previous assumed longitude floor of 140°E was narrower than the public ArcGIS layer's documented westward extent, approximately 138.56°E. The validity envelope is now buffered to accommodate the layer's NSW-origin interstate route coverage, while still refusing global/projected coordinates and degenerate polylines.

Every source object ID must still be returned exactly once. If a geometry part has fewer than two vertices, an unsupported geometry type, or a coordinate outside the source footprint, the **entire feature** is excluded and its object ID, route/shape fields, part and vertex indexes, and reason are recorded in `reference-rejections.json`. Rejections are never auto-snapped or rewritten. The workflow aborts if the excluded count exceeds the stricter of 100 or 1% of source features (with a minimum allowance of two for tiny test fixtures). Valid reference geometry can be compared with a clearly recorded `partial_with_explicit_exclusions` status. The number excluded appears in both provenance and the review summary; a partial comparison is not complete-source verification.

This is still candidate GTFS feed comparison, not independent evidence of true physical rail locations. No published map geometry is changed.

## Phase 4B: current route coverage and hosted source age

The first successful public ArcGIS comparison (GitHub Actions run 40779094439, 28 October 2026) retrieved 8,673 source features, zero geometry exclusions, and 897 of 911 sampled coordinates within 100 m **among 21 matched rail-feature records**. The remaining **8,652 features are outside the application's recognized rail line identifiers** and must not be treated as rail routes validated or rejected. The recorded hosted layer update field was `2024-02-01 10:43`; this does not establish a 2026 timetable release or an engineering survey date. **M1, T6 and L4 had no matching reference feature** among the 20 current app line identifiers.

Phase 4B reports the exact installed-line match matrix, exposes no-match lines as unavailable instead of silently omitting them, carries the source's hosted update fields through to the comparison summary, and warns when their dates are older than one year relative to the GTFS build. The artifact's per-line CSV includes every installed line even if no source geometry matched. Neither the 98.5% proximity among matched samples nor full recovery of public ArcGIS IDs constitutes network-wide coverage or accuracy certification.

For actual cartographic corrections, obtain newer source versions for Sydney Trains plus M1 Metro, T6, L4 and relevant Intercity feeds; reconcile route IDs, shape variants and calendar validity. Keep the old 2024 layer as *historical* corroboration and never automatically snap lines or station coordinates.
