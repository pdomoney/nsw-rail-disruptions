# TfNSW 2026 diagram: all-line coverage and geographic portrait layout

## Source limitation
The verified TfNSW **Sydney rail network PDF** is a portrait schematic of the Sydney Trains and M1 system, not the geographic Intercity/Hunter or Sydney light rail network. The Geographic Map is based on actual current TfNSW GTFS line shapes, stops and reported vehicle coordinates, including SCO, SHL, BMT, CCN, HUN and light rail. We should not invent regional extensions or traces on the printed Sydney rail artwork.

## PR69 shared-trackage approach
- All T1–T9 and M1 remain eligible for the 2026 diagram where their exact station-pair source circles were vetted in prior PRs. The gaps in unverified pairs remain intentionally omitted.
- SCO on **T4 printed trackage** (including Oatley, Como, Jannali and Sutherland), BMT on verified **T1/T2** shared trackage, CCN on verified **T1/T9**, SHL on verified **T8/T4**. Each uses exact approved PDF station-circle positions. Both endpoints must also be associated with that actual Intercity line in current TfNSW GTFS. No copied or invented Intercity PDF coordinates.
- Where multiple source-line alignments give nearly equally plausible train projections, the icon is withheld rather than guessed (within 120m of best match). The normal 250m geographic segment tolerance remains enforced.
- HUN and the light-rail lines L1–L4/NLR have **no 2026 Sydney rail PDF depiction**. All modes still appear in the line-selection control, with a clear source-coverage note directing the user to the actual Geographic Map.
- The geography view becomes a responsive portrait 1024:1447 aspect-ratio canvas, max 1020px wide, consistent with the official network map. Leaflet maintains its GPS projection, panning, zooming, clustering, street tiles, incident layers, and accessible hover information.

## Verification / acceptance
Run the source GTFS / timetable operator cross-check (PR67) for a point-in-time independent review of exact trip IDs, static GTFS shapes, service calendars and station-pair sequence. Its past success status is **not** proof every vehicle is corroborated; classification counts and evidence exceptions must be examined. UI + test fixtures verify that SCO near Como renders on a T4 source-paired section and no unsupported line is plotted, but full browser review is still required, including Intercity express movements and major transfer junctions.

This project must continue reviewing the intercity line coverage through the exact source PDF and GTFS shape topology, rather than loosening proximity guards to produce more icons. Issue #45 remains open.
