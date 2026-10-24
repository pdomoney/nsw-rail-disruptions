## Activating recent station patronage (November 2024 onward)

The accepted 2016–2024 historical snapshots are built in and require no further upload. The **recent months** are deliberately a separate datasource and cannot appear until the authenticated CKAN refresh has succeeded at least once. TfNSW currently labels the source resource last updated **15 October 2026**, but this is not proof that its latest *trip-count month* is October 2026. The app displays the actual latest month obtained from validated records.

Use the official [TfNSW Open Data Hub](https://opendata.transport.nsw.gov.au/dataset/train-station-entries-and-exits-data/resource/f8bb2918-0540-4bb3-9ccf-f7aef04d4249) to create a personal API token. Keep it secret: **do not paste it into a GitHub issue, PR, ChatGPT message or public JavaScript**.

1. In the [NSW Rail Disruptions repository](https://github.com/pdomoney/nsw-rail-disruptions), open **Settings → Secrets and variables → Actions → New repository secret**.
2. Name the secret exactly `TFNSW_CKAN_TOKEN` and enter the Hub's CKAN token as the secret value. The CKAN DataStore snippets use the raw value in the `Authorization` header.
3. Go to **Actions → Refresh TfNSW station patronage → Run workflow**. It downloads and validates the monthly entries/exits from resource `f8bb2918-0540-4bb3-9ccf-f7aef04d4249`, and commits only verified station/month counts to the `data` branch.
4. Inspect the workflow run for `Updated official monthly patronage:`, including the actual `latest` month and the number of complete station-month records. Missing token on a manual run now fails clearly, rather than returning a misleading green success.
5. Following the next normal **Collect and publish** site build, visit [Station Patronage](https://pdomoney.github.io/nsw-rail-disruptions/#/stations). If recent data exists, the page now starts with the **Recent monthly totals** view and shows the latest available month and last successful import. Historical sample and historical monthly options remain accessible.

The refresh runs separately from the five-minute train collector, once daily. It must not infer hourly or live patronage from monthly counts. The website never stores or uses an API key in the browser. An unverified/partial refresh must not overwrite previously published data.

---

## Station directory shown instead of historic figures (PR #16)

PR #15 already includes **two checksum-pinned, compressed original-source snapshots** in `src/data/patronage/`. The user's uploaded `NSW_Opal_patronage_import_package(1).zip` has SHA-256 hashes that exactly match these files after decompression. A separate historical data-branch upload is **not needed**. The optional `TFNSW_CKAN_TOKEN` is only for **newer monthly** station records.

If the page shows **only a searchable station directory**, its loaded `data/station-patronage.json` has `available:false`, usually because the browser loaded the version published **before** PR #15, or because a build was unable to map historical station names to the current GTFS catalogue. PR #16 shows the true build reason, offers an **uncached data refresh** and records publication coverage in GitHub Actions **Build the site** logs.

After a successful new deployment, the latest Station Patronage page should have the historical **Dataset**, **Historical sample**, **Time window**, **Rail line** and **Measure** filters. Start with **2023 / 06:00–10:00**, select **Central** and compare **7,780 entries / 31,480 exits** with the source workbook. **2024-10** remains historical monthly; post-2024 CKAN months require the optional authenticated refresh.

To inspect a failed import, open **Actions → Collect and publish → latest completed run → collect → Build the site**, and search for `Published Opal station patronage:` or `Station patronage dataset rejected:`. Patronage failures do not block the live disruption monitor.

---
## Source-specific import: original TfNSW workbook and legacy monthly CSVs (2026-10-25)

The accepted source-derived normalised import package **NSW_Opal_patronage_import_package.zip** is prepared separately from this PR and contains these three files:

```text
patronage/
  provenance.json
  typical-periods.csv
  historical-monthly.csv
```

**New automated default:** Source-verified historical CSVs are bundled in `src/data/patronage/*.gz.b64` on PR #15 with pinned SHA-256 checksums. On merge, the site build reads them automatically; the historical patronage page can populate without an extra data-branch upload. No raw CSV or source API token is served to the browser.

The separately downloadable ZIP can instead be copied to the `data` branch at `data/patronage/` for explicitly managed replacement inputs; data-branch versions take precedence and require `provenance.json`.

### Source dates and shapes (verified against supplied originals)

* Historical sample workbook: `train-station-entries-and-exits-version-2.2.xlsx`, TfNSW, May 2024 release. The sheet has years 2016, 2017, 2018, 2019, **Feb 2020**, **May 2020**, **Sep 2020**, 2022 and 2023. Sample methodology: three weekdays, average per station. Four published intervals **06:00–10:00**, **10:00–15:00**, **15:00–19:00**, **19:00–06:00**, and source-published **24-hour totals**. Samples cannot be split into individual hours. Source worksheet contains suppressed dashes; **do not turn dashes into zeros**. The curated file `typical-periods.csv` contains **8,813 complete station/sample/window observations**.
* Historical monthly CSV `0292414e-8f70-4ee3-a61b-c9749182fe6f.csv`: July 2016–June 2024; **60,324 direction rows**.
* Historical monthly CSV `c0396b43-8b5f-4243-b49d-ed9fc813005b.csv`: July–October 2024; **2,526 direction rows**, including `Entries`/`Exits` variant labels.
* Combined curated `historical-monthly.csv` contains **29,945 complete station/month pairs** between July 2016 and October 2024. **1,480 station-month pairs** were excluded because at least one direction was withheld or incomplete. Original cells saying `Less than 50` represent suppression, not counts of zero.

The import process also records station identifiers matched against *the app's current GTFS station catalogue*. Unmatched or ambiguous station names remain excluded from metrics and are visibly counted. A station shared by M1/T1/etc is displayed in each relevant **filter**, but its same Opal entry is counted **once** in network totals, never attributed to a particular train line.

For example, the XLSX's **2023 Central** figures are 06:00–10:00 *7,780 entries/31,480 exits*, 15:00–19:00 *32,330 entries/15,970 exits*, and published 24h totals *69,940 entries/72,760 exits*. Separate Feb/May/Sep 2020 figures are also pinned as regression tests. These numbers describe historical sampled weekdays, **not live demand today**.

### Modern CKAN resource (November 2024 onwards)

The source resource ID is `f8bb2918-0540-4bb3-9ccf-f7aef04d4249`. TfNSW documents the datastore fields `MonthYear`, `Station`, `Station_Type`, `Entry_Exit`, `Trip` and lists the resource as datastore-active; the latest public dataset metadata was updated 15 October 2026.

Example (do not put a token in JavaScript delivered to the browser):

```bash
curl --fail --show-error --silent \
  -H "Authorization: $TFNSW_CKAN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"resource_id":"f8bb2918-0540-4bb3-9ccf-f7aef04d4249","limit":5,"offset":0}' \
  https://opendata.transport.nsw.gov.au/data/api/action/datastore_search
```

The source is **monthly**: do not infer time-of-day from these rows. The app uses a **daily, separate** GitHub Actions workflow `.github/workflows/opal-patronage.yml`, not the five-minute rail collector. Its `TFNSW_CKAN_TOKEN` secret is optional. Only after you add that secret will it fetch all paginated rows, validate the schema/completeness, omit suppressed/incomplete pairs and replace `data/patronage/monthly.csv` with the latest verified snapshot. No token goes to the static site. If the endpoint rejects the token, cannot complete pagination or changes schema, the job fails and keeps the previous validated file. **A live CKAN response has not been verified in this PR without a user-issued key.**

To configure: GitHub repository **Settings → Secrets and variables → Actions → New repository secret**, name it `TFNSW_CKAN_TOKEN`, paste a TfNSW Open Data Hub API token. Run **Actions → Refresh TfNSW station patronage → Run workflow** for the first authenticated fetch, and review the run and records before accepting the new data.

### Source ZIP upload procedure

On a computer with Git and an authenticated GitHub account:

```bash
git clone --branch data --single-branch https://github.com/pdomoney/nsw-rail-disruptions.git nsw-rail-data
cd nsw-rail-data
# Save the supplied import ZIP under your Downloads directory first
unzip -o ~/Downloads/NSW_Opal_patronage_import_package.zip
git add patronage/typical-periods.csv patronage/historical-monthly.csv patronage/provenance.json
git commit -m "Import verified historic TfNSW station patronage"
git push origin data
```

The current data branch does not yet have a `patronage/` folder, but the SHA-verified historical snapshots bundled on `main` are used as a fallback after merge. The ZIP upload procedure is **optional** if an independently managed data-branch copy is desired. Avoid running a source import on `main` or uploading raw API keys. Historical data and current CKAN data remain visibly distinguished.

## Rights and attribution review

The TfNSW online dataset metadata currently describes the files as Creative Commons Attribution, but the legacy workbook's own **Read me** sheet additionally says its contents may be reused for **non-commercial purposes only** with attribution. Those two notices should be reconciled with TfNSW before any commercial redistribution of the historical workbook figures. This independent public rail-monitoring app credits Transport for NSW and uses the original numbers only in a historical informational view; it does not alter the rights notices in the source document.

## Safety acceptance

1. Verify a 2023 Central and Wynyard morning/afternoon comparison against the workbook.
2. Verify 2020 pre-COVID, lockdown and later 2020 samples remain three separate selections.
3. Verify a month such as 2024-10 belongs to **historical monthly**, and 2024-11 onwards belongs to **recent monthly**.
4. Verify `Less than 50` and worksheet dashes never become zeros or estimated counts.
5. Verify line filters do not double-count transfer stations.
6. Confirm total unmatched station warnings remain visible and data can never be silently substituted from GTFS carriage occupancy.
7. Verify that CKAN secret/endpoint failures leave the last published station data intact, without blocking live train disruption collection.

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
