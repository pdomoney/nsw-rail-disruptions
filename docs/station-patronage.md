# Station patronage data import

The **Station patronage** view is separate from the **Crowding hotspots** view.

- **Historical typical day**: Transport for NSW station entries/exits from a three-day sample, available for years **2016–2023 only**. Numbers are sample-derived average station entries/exits, not live passengers, carriage occupancy or numbers of passengers assigned to a particular train line.
- **Monthly station usage**: TfNSW Opal-derived station entries/exits from **November 2024 onward**, as reported in the newer dataset. These are whole-month totals, **not hourly counts**.
- Do not interpolate monthly totals into hourly estimates. Do not claim any recent hourly station tap counts without their own separately validated source.

## Official sources and access

Transport for NSW: https://opendata.transport.nsw.gov.au/dataset/train-station-entries-and-exits-data

Historical typical-day workbook (XLSX):
https://opendata.transport.nsw.gov.au/data/dataset/3977df59-a1fa-422e-91ff-cfaeac355cc9/resource/491763fc-82ed-4e44-9fca-8f3285db526e/download/train-station-entries-and-exits-version-2.2.xlsx

Monthly dataset (CSV):
https://opendata.transport.nsw.gov.au/data/dataset/3977df59-a1fa-422e-91ff-cfaeac355cc9/resource/f8bb2918-0540-4bb3-9ccf-f7aef04d4249/download/entry_exit.csv

The Open Data Hub requires a login for these downloads. This project will **not** silently substitute third-party estimates or use a fake dataset. Obtain and inspect the actual files before converting them into the normalized layouts below. The historical workbook's real column mapping is not assumed to be identical to the normalized schema. Do not publish data until the mapping and sample semantics have been independently validated.

## Data branch import

The GitHub Actions collector already checks out branch \`data\` at \`./data\`. The build reads, if present:

\`\`\`
data/patronage/
  provenance.json
  typical-day.csv
  monthly.csv
\`\`\`

Only \`provenance.json\` plus at least one CSV are necessary. These CSVs are **normalized exports**, not assertions about the original TfNSW column names. Keep the raw files offline or under separate explicitly approved source control: the application only needs validated, aggregated station observations.

**Normalized typical-day.csv** (example below is SYNTHETIC FOR FORMAT ONLY, do not deploy):

\`\`\`csv
station,year,day_type,hour,entries,exits
Central,2023,weekday,8,100.5,90
Town Hall,2023,weekday,9,20,40
\`\`\`

Field rules:
- \`station\`: display name matching the current TfNSW station catalogue. No platform ID or made-up line allocation.
- \`year\`: 2016–2023 only, derived from the actual source worksheet.
- \`day_type\`: \`weekday\` or \`weekend\`, only if the source states that category.
- \`hour\`: Sydney-local hour 0–23, only if the source explicitly supplies an hourly time interval.
- \`entries\`/\`exits\`: nonnegative sampled average station counts. Decimals permitted for averages. No inferred zeros for absent cells.
- Exactly one row per station/year/day_type/hour; duplicate rows are rejected.

**Normalized monthly.csv** (SYNTHETIC FORMAT EXAMPLE, do not deploy):

\`\`\`csv
station,month,entries,exits
Central,2026-08,1000,1200
Town Hall,2026-08,500,600
\`\`\`

Month is \`YYYY-MM\` and no earlier than 2024-11. Monthly counts must be nonnegative whole numbers and unique per station/month.

**provenance.json** (with both sources present):

\`\`\`json
{
  "provider": "Transport for NSW",
  "typicalSource": "https://opendata.transport.nsw.gov.au/data/dataset/3977df59-a1fa-422e-91ff-cfaeac355cc9/resource/491763fc-82ed-4e44-9fca-8f3285db526e/download/train-station-entries-and-exits-version-2.2.xlsx",
  "monthlySource": "https://opendata.transport.nsw.gov.au/data/dataset/3977df59-a1fa-422e-91ff-cfaeac355cc9/resource/f8bb2918-0540-4bb3-9ccf-f7aef04d4249/download/entry_exit.csv"
}
\`\`\`

The provenance metadata is a **provenance declaration, not proof of authenticity**. The author must verify the original export, workbook layout, aggregation, dates and expected totals. Review unmatched-station warnings and match against TfNSW station names. Unknown or ambiguously named stations are excluded, never assigned to a different stop to make the totals match.

Commit the normalized CSVs and provenance file to the repository's **data branch** after verifying them. The existing automatic build will then create \`dist/data/station-patronage.json\` and publish it to GitHub Pages. Missing inputs produce an explicit no-data state with a useful searchable station catalogue. A malformed import is isolated so the alerts, delays and maps still publish.

## Acceptance before shipping actual numbers

1. Validate the official file identity and available period. Check that year/day/hour values genuinely exist in the source rather than being derived from monthly figures.
2. Reconcile a sample of Central, Town Hall and at least one interchange against source entries and exits and total averages.
3. Verify that a station served by two lines appears in either line filter but is counted **once** in the network total.
4. Investigate unknown names and ambiguous station matches: fix the crosswalk instead of silently dropping large groups.
5. Verify no future year beyond 2023 appears in the typical-day view, and no alleged hourly data appears for monthly files.
6. Check the monthly methodology change and 2024 metro opening. Do not equate historical line membership with current timetables.
7. Run \`npm test\`. Confirm the station view, missing-data state and existing disruption/crowding views remain functional.

No automated scraping of logged-in dataset downloads is required. The site itself remains read-only and does not expose an API key.
