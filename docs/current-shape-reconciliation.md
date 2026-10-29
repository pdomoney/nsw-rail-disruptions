# Phase 4G — current TfNSW GTFS shape ID comparison

Existing public NSW ArcGIS hosted routes metadata dates to February 2024. The earlier comparison found four route shape exceptions in T1, SCO and SHL; those differences should not lead to 2026 track corrections without matching the actual current GTFS `shape_id` and service calendars.

Select GitHub Actions → **Compare 2026 TfNSW Sydney Trains shape IDs** → **Run workflow** (main branch). The operator workflow retrieves a fresh authenticated TfNSW Sydney Trains static ZIP using the existing secret, and downloads the public ArcGIS source with captured SHA-256 provenance. Reports are operator-only GitHub artifacts (28 days). The source ZIP is not committed or exported. The workflow has `contents: read` permissions and does not publish Pages.

Four historical IDs under review:

- T1: `2-T1-W-sj2-1.1.R`
- SCO: `76-SCO-sj2-1.1.R`, `2-SCO-sj2-1.1.R`
- SHL: `76-SHL-sj2-1.1.R`

Current counts use exact `routes.txt` route-to-line attribution, `trips.txt` shape IDs and service IDs, and date-qualified `calendar.txt` plus `calendar_dates.txt` for 29–31 October 2026. For an exact shape ID found in both feeds, both source→current and current→source directions are sampled approximately every 500 metres, reporting the proportion of sample points within 100 metres of the other geometry. These are diagnostic thresholds, not surveying accuracy. If an ID is absent, the report does **not** substitute a different shape of the same line. It also lists the most used current shape IDs for follow-up research only.

Artifacts: `historical-v-current-shapes.json`, `.md`, `.csv`, `current-source-provenance.json`, `reference-provenance.json`. A new run does not establish the exact TfNSW upstream timetable's release date: it records our HTTP fetch timestamp and SHA-256. Scheduled trips are not proof of physical train operation. No station coordinates, train GPS points, published routes or official diagram paths are modified by this workflow.
