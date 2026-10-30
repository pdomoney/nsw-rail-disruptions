# 2026 diagram coordinate and timetable source cross-check

Visual acceptance of the 30 October 2026 official TfNSW PDF is provisional: PDF vector-symbol coordinates alone do not establish a particular vehicle's current timetable, line, and station pair.

## Manual operator workflow

After the PR is approved and merged, use GitHub Actions → Cross-check 2026 diagram coordinates and GTFS timetable → Run workflow. It downloads fresh authenticated TfNSW static GTFS for M1 and Sydney Trains, followed by near-synchronous TfNSW GTFS-Realtime vehicle positions and trip updates. It aborts when the realtime feed is stale or snapshots disagree by over three minutes. The existing TfNSW API key is required. Source SHA-256 hashes, actual endpoints, fetch timestamps, and collected data branch SHA are attached to an operator-only 14-day workflow artifact. It does not publish or modify the live maps.

Each M1 or T1–T9 vehicle report cross-references the source GTFS trip ID and route, exact shape ID, current service calendar, dated timetable stop sequence and station-pair interval, geographic distance to the particular trip's shape, and the actual 2026 diagram station-pair interpolation used by the application. The report treats vehicle positions, scheduled times, and GTFS-Realtime trip updates as separate types of evidence. Unmatched data is retained as an evidence gap, not accepted as correct.

Review tolerances: at most 150 metres from the exact source GTFS trip shape, existing 250-metre geographic diagram segment threshold, vehicle feed age at most 15 minutes, earliest scheduled service window minus 10 minutes, and latest scheduled service window plus 30 minutes. Timetable plausibility is not punctuality confirmation, especially when services are disrupted. A realtime trip-update delay is included separately.

Artifacts: coordinate-timetable-audit.json, coordinate-timetable-audit.csv, coordinate-timetable-audit.md. The report classifies source-correlated, inconsistent, stale, off-shape, not rendered, and insufficient-timetable matches. All outputs are read-only. A source-compatible interpolated vehicle does not prove its exact location on the curved PDF artwork, nor does a scheduled trip prove it physically ran. Coordinate changes should occur only in a separate owner-reviewed correction after examining detailed evidence.
