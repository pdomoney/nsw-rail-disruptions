# NSW Rail Disruptions

An open, read-only record of delays, outages and service interruptions on Sydney Trains, Intercity, Sydney Metro and light rail (L1–L4 and Newcastle Light Rail), shown by line and over time.

**Site:** https://pdomoney.github.io/nsw-rail-disruptions/

- **Overview:** what is disrupted right now, a calendar of disruption by line and day, and lines and causes compared.
- **Line pages:** history of unplanned disruption and planned closures, causes, the time of day incidents start, live delay trends, and every alert for the line.
- **Alert log:** every recorded alert since July 2023, searchable by line, type, cause and text.
- **Plan a trip:** pick two stations to see the lines between them, their current disruptions, today's trackwork, live delays and the last 30 days' reliability, then open the official [transportnsw.info](https://transportnsw.info) trip planner with the trip filled in. This site does not plan journeys itself: the TfNSW planner API cannot be called from a browser without exposing the API key.

It is an independent project and is not affiliated with Transport for NSW. For live travel information use [transportnsw.info](https://transportnsw.info/alerts).

## How it works

Everything runs on GitHub. There is no server or database.

1. **Collect.** About every 5 minutes, a GitHub Actions workflow (`.github/workflows/collect.yml`) runs `src/collect.js`, which reads:
   - the TfNSW Trip Planner **service alerts** feed (`/v1/tp/add_info`), the same alerts shown on transportnsw.info, and
   - the **GTFS-realtime trip updates** for Sydney Trains, Metro and the four light rail networks. It works out how far behind the timetable each running service is and records a per-line average, the share of late services, and cancelled trips.
2. **Track.** Each alert is followed from the moment it appears until it disappears from the feed, which gives it a start and an end. Alerts are sorted into *unplanned* incidents (with a cause read from the wording), *planned* trackwork and closures, *advisories*, *station* updates, and messages about *individual trips*.
3. **Store.** The results are committed to the `data` branch of this repository as plain JSON and CSV files (see below).
4. **Publish.** `src/build.js` turns the data into small JSON files and the workflow deploys the static site in `site/` to GitHub Pages.

History before collection started comes from the community archive [jxeeno/nsw-service-alerts-historical](https://github.com/jxeeno/nsw-service-alerts-historical), which saved the same alerts feed every 20–30 minutes. About 95,000 archived snapshots from July 2023 onwards were replayed through the same tracker (`src/import-archive.js`). The archive has no data between February 2022 and June 2023, and its earlier data uses a different format, so history starts in July 2023. Delay figures exist only from the day this collector started.

## Setting it up (for a fork)

1. Get a free API key from the [TfNSW Open Data Hub](https://opendata.transport.nsw.gov.au/): register, then open your profile and select **API Tokens**.
2. In the repository, go to **Settings → Secrets and variables → Actions** and add a secret named `TFNSW_API_KEY` containing the key.
3. In **Settings → Pages**, set **Source** to **GitHub Actions**.
4. Run the **Collect and publish** workflow once from the **Actions** tab, or wait for the schedule. It creates the `data` branch if it does not exist.

Notes:
- GitHub runs scheduled workflows on a best-effort basis. Gaps of 10–15 minutes between runs are normal, and on some repositories the schedule never fires. As a fallback, each run starts the next one about five minutes after it began, as long as no scheduled run has happened in the last 30 minutes. This keeps one GitHub-hosted runner busy (mostly waiting) around the clock while the fallback is active. It stops by itself once scheduled runs arrive. To turn it off, add a repository variable `SELF_SCHEDULE` with the value `off` (**Settings → Secrets and variables → Actions → Variables**).
- GitHub disables scheduled workflows in public repositories after 60 days without repository activity. The workflow's own data commits normally count as activity. If collection stops, re-enable the workflow from the Actions tab.
- Each run makes about 7 API calls (one alerts call and six realtime feeds), plus a once-a-day download of the static timetables. That is roughly 2,000 calls a day, well within TfNSW's limit of 60,000 a day.

## Data files (`data` branch)

| Path | What it holds |
| --- | --- |
| `alerts/events/YYYY-MM.jsonl` | One line per alert that has ended, filed by start month. |
| `alerts/open.json` | Alerts currently in the feed (tracking state). |
| `delays/YYYY-MM/YYYY-MM-DD.csv` | One row per line per collection run: running services, late services, mean and maximum delay in seconds, cancelled trips. |
| `cancellations/YYYY-MM.json` | Unique cancelled trip IDs per service day and line, from the realtime feed. |
| `runs/YYYY-MM.csv` | One row per collection run, showing what succeeded. Used to show gaps in the data. |
| `coverage/archive.json` | Number of archived snapshots per day for the imported history. |
| `stations/<feed>.json` | Stations and how many trips each line makes there, from the static timetables (refreshed daily). A line counts as stopping at a station when it makes at least 3% as many stops there as at its busiest station; below 25% the trip page labels it "some services". |
| `state/meta.json` | Collector state and feed diagnostics. |

Alert records use short keys:

| Key | Meaning |
| --- | --- |
| `id` | Alert ID from TfNSW (`ems-…` for editorial alerts, a 40-character hash for live incident and trip alerts). |
| `k` | Kind: `incident`, `planned`, `advisory`, `notice`, `trip` or `station`. |
| `s` | Sub-type: for planned alerts `trackwork`, `closure` or `change`; for trip messages `cancelled`, `late`, `skipped`, `altered`, `added` or `update`. |
| `c` | Cause of an incident: `industrial`, `emergency`, `security`, `weather`, `vehicle`, `infrastructure`, `operational` or `unknown`. |
| `l` | Line IDs: `T1`–`T9`, `BMT`, `CCN`, `HUN`, `SCO`, `SHL`, `M1`, `L1`–`L4`, `NLR`. |
| `t`, `x` | Title and plain-text body of the alert. |
| `cr`, `m` | Created and last-modified times, as published by TfNSW. |
| `fs`, `ls` | First and last time the alert was seen in the feed. |
| `st`, `en` | Estimated start and end. The end is midway between the last sighting and the first run where it was gone, capped at 15 minutes after the last sighting. |
| `w` | Planned alerts: the validity windows `[from, to]` published by TfNSW. |
| `src` | `archive` (imported history) or `live` (collected by this project). |

All times are UTC ISO-8601. The site shows them in Sydney time.

## Working on it locally

Requires Node.js 20 or later. There are no npm dependencies.

```sh
npm test                                    # unit tests
git worktree add data data                  # check out the data branch into ./data
TFNSW_API_KEY=... npm run collect           # one collection run (writes to ./data)
npm run build && npm run serve              # build the site into ./dist and serve it on http://localhost:8080
```

`test/mock_tfnsw.py` is a stand-in for the TfNSW API that serves a saved alerts snapshot and generated realtime feeds. Use it with `TFNSW_API_BASE=http://127.0.0.1:<port>` to test collection without a key. It needs Python 3 and the `protobuf` package.

### Re-importing the archive

```sh
git clone --filter=blob:none --single-branch --branch data \
  https://github.com/jxeeno/nsw-service-alerts-historical archive
# Download every version of the alerts file in bulk (much faster than letting git fetch them one at a time):
git -C archive log --format= --raw --no-abbrev --since=2023-07-01 data -- data/raw-ics/all.json \
  | awk '{print $4}' | sort -u | split -l 3000 - batch_
for f in batch_*; do git -C archive fetch -q --filter=blob:none origin $(cat $f); done
node src/import-archive.js --repo archive --out data --since 2023-07-01
```

The bulk download is about 4 GB and the replay takes about 25 minutes.

## How the numbers are worked out

- **Unplanned disruption hours** for a line and day are the hours covered by at least one unplanned alert for that line. A single alert counts for at most 24 hours, because operators sometimes leave alerts up after services recover.
- **Planned closure hours** come from the validity windows of trackwork and planned closure alerts. Windows longer than 16 days are treated as standing notices and left out.
- **Causes** are read from the alert text with keyword rules (`src/lib/classify.js`), so they are only as good as the wording.
- **Delays** come from GTFS-realtime trip updates. For each running service the collector takes the delay at the most recent stop it has passed. A service counts as late at 5 minutes or more (6 for Intercity), the thresholds TfNSW uses for punctuality.
- An incident that affects several lines is counted on each of them.

## Licence and attribution

The code is MIT licensed.

The data is from [Transport for NSW Open Data](https://opendata.transport.nsw.gov.au/), reused under [Creative Commons Attribution 4.0](https://creativecommons.org/licenses/by/4.0/). Archived alerts before October 2026 were collected by [jxeeno/nsw-service-alerts-historical](https://github.com/jxeeno/nsw-service-alerts-historical) from the same source.
