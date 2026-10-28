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

## Phase 2C: GTFS service support for geometry exceptions

The daily audit now reads the same collected `data/stations/*.json` source files used by the map builder, and correlates each flagged station-line pair with recorded `stop_times` row counts. The complete JSON, CSV and Markdown evidence include the maximum source count for that station/line and its percentage relative to the most frequently appearing station for that line in the same static feed. Multiple platform stop records with a common name are compared using the **maximum**, not summed. These counts do **not** tell us how many trains actually stop at a station on any particular date. They can reveal associations supported by only one or a few records, and help prioritise independent source review. No station memberships are hidden and no topology is corrected automatically.

Manual command: add `--station-dir data/stations` to `scripts/audit-network-geometry.mjs` when using collected data. If omitted, service support fields remain explicitly unavailable. Continue to assess route/shape IDs, actual active service calendars and the source GeoJSON before making display changes.

## Phase 2D: map presentation of route-adjacent stations

The geographic map now receives display-only `network.stationProximity` metadata from the same TfNSW GTFS shapes used to draw its lines. Where a station-line association is **more than 1 kilometre** from the current same-line GTFS route segments, a line-filtered geographic map does not display that station as though it were on the mapped line. The all-lines map retains the geographic station and describes those distant GTFS stop-time associations separately in the hover and click details. The offline geographic SVG fallback applies the same rule.

This conservative 1 km presentation boundary is intentionally **different** from the 150 m station QA threshold. Neither threshold declares a service invalid. In particular, recorded special trains, alternate routes and diversions remain in underlying GTFS records and all route data. The independent official 2024 schematic is unchanged. If proximity metadata is unavailable (cached older network data), the geographic display falls back to all original associations instead of assuming a classification. Manual device acceptance is required before deployment.

## Modern Geographic Map presentation (Phase 3)

The Geographic Map retains the existing TfNSW GTFS shapes, stop coordinates, and reported realtime train positions. To avoid illegible icon piles at statewide scale, multiple vehicles in the same projected screen grid cell are presented as a **count marker** at a group centroid, never labelled as a reported train coordinate. Selecting a group zooms to separate the actual markers; at maximum useful zoom, selecting it reports its real member service descriptions. No artificial train positions are exported or stored.

Station rings declutter by importance at low zoom and reappear progressively when zooming in. Selecting a line keeps its eligible stations available regardless of overview zoom, consistent with the Phase 2D proximity logic. Existing OSM tiles and required attribution remain, with CSS-only visual softening for rail focus. No paid tile dependency or unverified TfNSW map asset is introduced. The official PDF network map remains untouched.

## Phase 4C: official Southwest Metro opening readiness (30 October 2026)

NSW Government confirmed passenger service from Bankstown at **04:31 AEDT on Friday 30 October 2026** (see https://www.nsw.gov.au/ministerial-releases/southwest-metro-to-open-friday-30-october-2026). The M1 extends the existing Tallawong–Sydenham route along Marrickville, Dulwich Hill, Hurlstone Park, Canterbury, Campsie, Belmore, Lakemba, Wiley Park and Punchbowl to Bankstown. **No static GTFS path proves passenger operations.**

The daily and manually dispatched **Map geometry accuracy audit** now includes `mode-readiness.json`, `mode-readiness.md`, `mode-lines.csv` and `metro-southwest-stations.csv`. It audits the three **current collected mode-specific TfNSW static feeds**: `metro` → M1, `sydneytrains` → T6 and T1/SCO/SHL, `lr-parramatta` → L4, checking feed timestamps, station-to-same-line route distances, source freshness and all 11 expected Southwest Metro stops. The audited data branch SHA is preserved. It does not fetch a new geospatial reference or alter the website.

Snapshot examination of data branch on 29 October showed M1 geo feed built 28 October 09:17 UTC, with all 11 Southwest Metro stops on source geometry within 1 km; 10 were within 10 m and Bankstown was about 161 m away (potential interchange/platform alignment). T6 and L4 have their own source feed geometry. A snapshot *before* 04:31 AEDT is labelled `pre-opening-static-feed-present`. After the announced opening, static feed timestamps alone are labelled **service-unverified**, even if geometry refreshed. Actual opening-day GTFS scheduled trips, calendar exceptions, and realtime positions need separate confirmation. Do not use a copied T3 Bankstown 2024 corridor to fabricate operating Metro services.

The historical public ArcGIS audit from run 40779094439 (hosted layer metadata dated February 2024) identified shape review points in T1 `2-T1-W-sj2-1.1.R`, SCO `76-SCO-sj2-1.1.R` and `2-SCO-sj2-1.1.R`, and SHL `76-SHL-sj2-1.1.R`. Subsequent public-route comparisons additionally export `reference-exception-locations.csv`: approximate sampled latitude/longitude and distance to the installed GTFS route for each matched-shape exception (up to eight sample points per shape), **not** coordinate corrections. Reconcile shape IDs, service-date calendars and the provenance of the 2024 reference before modifying actual 2026 routes.
