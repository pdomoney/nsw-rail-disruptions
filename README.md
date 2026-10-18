# NSW Rail Disruptions

An open, read-only record of delays, outages and service interruptions on Sydney Trains, Intercity, Sydney Metro and light rail (L1–L4 and Newcastle Light Rail), shown by line and over time.

**Site:** https://pdomoney.github.io/nsw-rail-disruptions/

- **Overview:** what is disrupted right now, a calendar of disruption by line and day, and lines and causes compared.
- **Line pages:** history of unplanned disruption and planned closures, causes, the time of day incidents start, live delay trends, and every alert for the line.
- **Alert log:** every recorded alert since July 2023, searchable by line, type, cause and text.
- **Crowding hotspots:** line-by-hour heatmap from the last 7 or 30 days of observed carriage-level occupancy, filterable by weekdays/weekends, line mode and occupancy measure. Below the heatmap, the **Explore another line** selector and quick line buttons switch the eight busiest times and 24-hour profile to any selected line. **All lines** compares one peak hour per line, rather than letting M1 fill every slot. Lines without occupancy readings remain selectable and show an explicit no-data explanation. This is **not** Opal station patronage: values show reported carriage crowding, not passenger taps or counts. Forecasts and measurements vary between feeds; missing observations are not shown as empty carriages.
- **Service delivered:** how many timetabled trips actually ran, per line and day: trips cancelled, trips that never appeared in the live data, trips late at the end of the line, when in the day trips were lost, and a rough estimate of the people on lost trips. Each day's timetable is frozen in the morning and every trip in it is followed through the live trip data.
- **Live map:** every running train, metro and tram on a map of the network's real track (drawn from the TfNSW timetables, not the official diagram), coloured by how late it is and sized by roughly how many people are on board, with the sections named in current incidents and trackwork closures traced along the track. Positions come from the vehicle positions feeds, read every few minutes. A switch above the map shows the same trains and sections on a **network diagram** instead: straight lines at 45° steps, evenly spaced stations and lines that share track drawn side by side, in the style of the station maps. The diagram is this project's own drawing, laid out by hand in `src/lib/schematic.js`; it is not the TfNSW map artwork. Each train is placed on its line between the two stations it is between, and light rail is only on the track map.
- **Trackwork ahead:** every piece of planned trackwork TfNSW has published (usually about three weeks ahead), as one track per line with a block wherever work is planned, shaded by how much it changes journeys, then the details week by week. Taken from the planned alerts in the same alerts feed, with their exact closure windows.
- **Delay clock:** a running estimate of the passenger-hours lost to late trains and metros, and to waiting after cancelled trains, today and per line and day.
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
- GitHub runs scheduled workflows on a best-effort basis. Gaps of 10–15 minutes between runs are normal, and on some repositories the schedule never fires. As a fallback, each run starts the next one about five minutes after it began, unless another run (scheduled or manual) is already queued, in which case that run carries on the chain. This keeps one GitHub-hosted runner busy (mostly waiting) around the clock. To turn it off, add a repository variable `SELF_SCHEDULE` with the value `off` (**Settings → Secrets and variables → Actions → Variables**).
- GitHub disables scheduled workflows in public repositories after 60 days without repository activity. The workflow's own data commits normally count as activity. If collection stops, re-enable the workflow from the Actions tab.
- Each run makes about 11 API calls: one for alerts, six realtime trip feeds, and the vehicle positions of Sydney Trains, Metro, Parramatta and Newcastle light rail (which carry measured occupancy). The other two vehicle position feeds are read about once an hour, and the static timetables once a day. That is roughly 3,300 calls a day, well within TfNSW's limit of 60,000 a day.

## Data files (`data` branch)

| Path | What it holds |
| --- | --- |
| `alerts/events/YYYY-MM.jsonl` | One line per alert that has ended, filed by start month. |
| `alerts/open.json` | Alerts currently in the feed (tracking state). |
| `delays/YYYY-MM/YYYY-MM-DD.csv` | One row per line per collection run: running services, late services, mean and maximum delay in seconds, cancelled trips. |
| `cancellations/YYYY-MM.json` | Unique cancelled trip IDs per service day and line, from the realtime feed. |
| `service/YYYY-MM/YYYY-MM-DD.json.gz` | Gzipped JSON. Every timetabled trip of one service day (line, times, destination, train type and length, forecast occupancy) and what the realtime feed showed about it: whether it was seen, ran, was cancelled, replaced or added, its largest delay, its delay at the destination, skipped stops and the highest occupancy level predicted or measured. Also when each feed was being watched (`coverage`). Written at 6 am the next morning; until then the day is kept in `service/open.json` and `service/YYYY-MM/YYYY-MM-DD.sched.json` (the timetable, frozen when the day starts). Times are seconds after midnight at the start of the service day. Column meanings are in `src/lib/service.js`. |
| `network/<feed>.json` | Each line's track from the timetable shapes: simplified, snapped to a ~10 m grid and stored as chains of latitude/longitude × 10,000 (first point, then differences). Rewritten when the timetable changes. |
| `live/positions.json` | Where each running train is at the latest run, with its line, delay, carriage occupancy levels and destination. Overwritten each run. |
| `load/YYYY-MM/YYYY-MM-DD.csv` | One row per line per collection run: running services by predicted occupancy level (carriages, or whole trains where only a train-level figure is published) and the delay they carry. Only for lines whose feed publishes occupancy. |
| **Built site:** `data/crowding.json` | Last 30 Sydney calendar days of per-line, per-hour occupancy indexes. Created from the `load/` CSVs at publish time. Each hour includes the number of independent feed snapshots and reported carriages. Whole-train-only readings are excluded. Not an official patronage count. |
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
- **Sections on the maps** come from the alert wording: only the sentences that close something ("buses replace trains between Waterfall and Sutherland", "trains do not run", "suspended") or describe the trouble, not the ones saying where trains still run, so a partial closure is not drawn over the whole line (`src/lib/netmap.js`). On the track map a section follows the real track between the named stations; on the network diagram it follows the diagram, on the strands of the lines the alert names.
- **Service delivered** compares each day's timetable (frozen in the morning) with the live trip data. Trips marked cancelled in the feed, and trips that never appear in it, count as lost; everything else counts as run. Trips are only judged if they were due while the feed was being read, and only for train types that appear in the live data at least half the time (the Hunter Line's diesel railcars never do). "Empty Train" runs are left out. Late means 5 minutes or more behind at the last stop (6 for Intercity).
- **The delay clock** turns TfNSW's per-carriage occupancy levels (predicted for Sydney Trains and Intercity, measured for Metro) into people with assumed loads, from 3 people in an empty carriage to 190 in a full one (`src/lib/service-stats.js`, `src/lib/clock.js`). At each reading, a service carrying L people that is D minutes late is taken to drop off L ÷ 30 people a minute (30 minutes being an assumed average journey), each D minutes late. Services without an occupancy figure are assumed to be like those with one. People on a cancelled or missing trip wait for the next timetabled train on the line in the same direction (up to an hour), with the trip's load taken from TfNSW's occupancy forecast. Light rail is not included. All of this is an order-of-magnitude estimate; the assumed loads are still to be checked against Opal trip counts.

## Crowding data and next stage

The crowding feature is based on existing TfNSW GTFS-realtime occupancy reports, not Opal card taps. The hour heatmap shows an average occupancy category of **0 (empty) to 5 (full)** and a separate **percentage of reporting carriages at standing-room level or higher**. Each fresh feed timestamp counts once per line, even if the collector polls it repeatedly. Each snapshot contributes equally, so a line with more carriages does not automatically rank as busier. The heatmap retains low-sample warnings and unknown/no-data hours. The dataset is limited to 30 days to keep the GitHub Pages static build small.

The next stage is **measured station patronage** (entries and exits, by station and hour, with drill-down from each route). That needs a separate Opal input and verified mapping from stations to multiple shared lines. The public [TfNSW Station Entries and Exits](https://opendata.transport.nsw.gov.au/data/dataset/train-station-entries-and-exits-data) 'typical day' hourly breakdown ends in 2023, whereas the later station resource supplies monthly usage, not a current hour-by-hour estimate. The [Opal Tap Data](https://opendata.transport.nsw.gov.au/dataset/opal-patronage) offers another source with restricted download access and geographic coverage; it must be reviewed before implementation. Do not fabricate current station taps from the present vehicle load dataset, and do not assign an interchange station's entries to every line independently.

## Licence and attribution

The code is MIT licensed.

The data is from [Transport for NSW Open Data](https://opendata.transport.nsw.gov.au/), reused under [Creative Commons Attribution 4.0](https://creativecommons.org/licenses/by/4.0/). Archived alerts before October 2026 were collected by [jxeeno/nsw-service-alerts-historical](https://github.com/jxeeno/nsw-service-alerts-historical) from the same source.
