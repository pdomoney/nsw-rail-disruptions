# Data branch

Data collected by [NSW Rail Disruptions](https://github.com/pdomoney/nsw-rail-disruptions). A scheduled GitHub Actions job commits to this branch every few minutes. Don't commit to it by hand.

The file formats and field names are described in the [main README](https://github.com/pdomoney/nsw-rail-disruptions#data-files-data-branch).

- `alerts/events/YYYY-MM.jsonl`: alerts that have ended, one JSON object per line.
- `alerts/open.json`: alerts currently in the feed.
- `delays/`: per-line delay samples from GTFS-realtime trip updates (collected from October 2026).
- `cancellations/`: unique cancelled trip IDs per day and line.
- `runs/`: one row per collection run.
- `coverage/archive.json`: snapshots per day in the imported history.
- `state/meta.json`: collector state and feed diagnostics.

Source: Transport for NSW Open Data, licensed [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Alerts from July 2023 to October 2026 were replayed from the community archive [jxeeno/nsw-service-alerts-historical](https://github.com/jxeeno/nsw-service-alerts-historical).
