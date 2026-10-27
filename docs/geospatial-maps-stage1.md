# Geographic rail map redesign — stage 1

## Scope and source accuracy

The two public map choices are **Network diagram · TfNSW** and **Geographic map · GTFS**. The independent legacy hand-drawn renderer and its selection control have been removed. Bookmarks using `#/map?map=legacy` or `#/map?map=diagram` open the verified published official artwork and are rewritten to the supported mode. The internal `schematic.json` model is **not deleted**: official PDF matching and station-patronage corridors still rely on its separate reference geometry.

The user-supplied [TfNSW Sydney Train Routes](https://opendata.transport.nsw.gov.au/data/dataset/sydney-train-routes) dataset consists of route paths derived from GTFS `shapes.txt`. This is already the source for geographic map route geometry in `src/lib/gtfs-static.js`, `src/build.js` and `site/geo-map.js`, so merely replacing that geometry with the portal GeoJSON would not prove an accuracy improvement. Portal GeoJSON/ZIP downloads may require a TfNSW account. Do not scrape, embed credentials in GitHub Pages or infer newer topology from the website's metadata date.

### Geographic map

- Continue using station latitude/longitude from verified GTFS stops and line-specific `shapes.txt` paths, not arbitrary PDF diagram coordinates.
- Continue plotting reported realtime coordinates without synthetic interpolation or snapping to a branch by guess.
- Make reported route paths more prominent, add a railway-focused (background desaturated) presentation and permit **Street detail** using the existing attributed OpenStreetMap tiles. No new basemap API key, vendor bill or restricted tile source is introduced.
- Clicking a geographic station uses the same persistent detail panel as clicking an official-PDF station. Existing hover tooltips, keyboard train markers, popup and mobile layout are preserved.
- A broken tile CDN keeps the existing offline geographic SVG fallback; map data does not require the tile server.
- Keep visible OSM attribution and prohibit bulk tile prefetch/offline download.

### Network diagram

The TfNSW network artwork currently comes from the **30 September 2024** official diagram. It is **schematic**, not geographically proportional. Route shape data can be used for independent comparison, but **cannot be overlaid directly in PDF pixel space**. Station symbols and overlay placements remain verified using the source edition's vector stops and restricted route matching. Unmatched vehicles remain omitted. The map now explicitly describes its source and confidence limitations.

## Outstanding accuracy work

See [Issue #45](https://github.com/pdomoney/nsw-rail-disruptions/issues/45). That phase will independently compare the currently published GeoJSON / route shapes to the existing GTFS shape importer, measure station-to-track offsets, audit per-line coverage and examine a newer official TfNSW network diagram only if one is published and its vector symbols can be calibrated. Do not present the Stage 1 UX work as completion of that geospatial audit.

## Acceptance

- Two public map modes; previously bookmarked legacy modes resolve to official
- Map select/hover, contrast, line and area filters, responsive panel and historical deep links
- Geographic map switch Rail focus / Street detail without moving a route/station/vehicle
- TfNSW sources, OSM attribution, official 2024 artwork and 2024 stop alignment unchanged
- JavaScript syntax, geographic coordinate, native diagram/Opal, official-map PDF and asset fingerprint regressions pass
