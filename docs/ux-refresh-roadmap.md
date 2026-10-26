# NSW Rail UX refresh — approved direction and implementation gates

## Approved direction
The public-facing design consolidates nine primary destinations into five task-based areas: **Today**, **Network map**, **Trackwork**, **Insights**, **Plan a trip**. This structure is approved as a design direction following a standalone desktop/mobile prototype review. The public data feeds remain independent and the map rendering engines are protected.

### Original independent identity
An original compact **rail-route junction** mark was designed in navy (`#15364d`), white and teal (`#78d8dc`). Two joining paths and station dots represent network connectivity and information. It is purposefully **not** the TfNSW transport roundel, Sydney Trains branding or NSW Government Waratah. The wordmark explicitly calls the site **NSW Rail Disruptions**, with **Independent network information** immediately below it. The same geometry appears in the SVG favicon and responsive header. The SVG is created in source control and scales to small app-icon sizes. Do not use the NSW Government logo or imply endorsement.

Research supporting these decisions:
- [NSW Government branding and brand framework](https://www.nsw.gov.au/branding): government-controlled logos belong to NSW Government services
- [NSW Design System — logo](https://designsystem.nsw.gov.au/core/logo/index.html): official Waratah usage is a specific Government identity
- [NSW DCJ Design System — header/navigation](https://designsystem.dcj.nsw.gov.au/components/header-and-main-navigation.html): primary navigation should ideally have no more than six top-level items
- [WCAG 2.2](https://www.w3.org/TR/WCAG22/): target sizes, focus visibility, keyboard access and colour-independent communication
- Independent transit-map branding reviews: emphasize legible junction/stop abstractions rather than copying transit authority glyphs or maps

### Information architecture

| Destination | Original routes | Content boundary |
| --- | --- | --- |
| Today | `#/` and `#/line/<id>` | Current notices, status by line, freshness, current reliability, clear actions |
| Network map | `#/map` | Verified TfNSW 2024 artwork, live position overlays, geographical alternatives and line filter |
| Trackwork | `#/trackwork` | Planned works, current/next weekend, visual timeline, line filter |
| Insights | `#/service`, `#/crowding`, `#/stations`, `#/log` | Reliability, carriage occupancy, Opal station patronage, archival alerts in four tabs |
| Plan a trip | `#/trip` | From/to station selection, relevant impacts, handoff to official journey planner |
| Utility | `#/about` | Complete source notes, provenance, assumptions, attribution and methodology, accessible from footer |

Historical deep links, selected query strings, route IDs, data periods and exports must continue to work. Do **not** coalesce station Opal taps, predicted carriage occupancy, train lateness, historic alerts or modelled passenger hours into one numeric series.

### Rollout sequencing
**Phase 1, this PR**: site identity, favicon, responsive header with five top-level destinations, Insights sub-navigation, shared card/control treatment, more task-focused Today above-the-fold and clearer map workspace framing. Routes/rendering/data remain unchanged. First-pass accessibility and regression tests are required.

**Phase 2, separate PR**: Today page composition. Current incident list and line status first; move historical disruption calendar and ranked historic causes into an appropriate Insights subsection or expandable historical analysis panel without losing data. Preserve link back to detailed line pages.

**Phase 3, separate PR**: Network map presentation only. Keep `official-map.js`, `official-vector-stops.js`, original TfNSW 2024 image calibration and data, live overlays, SVG tap/hover behaviour and geographic map engine intact. Rework map selector, filter controls and selected train/station details into a contextual desktop side panel and compact mobile panel. Check iPhone Safari, map zoom/drag, current stop positions, fallback offline map, screen reader and keyboard.

**Phase 4, separate PRs**: Align Trackwork, Reliability, Crowding, Station Patronage (including nine shades, combined Entries + Exits and annual totals), Alert History and Trip. Share labels, headers, filters and source badges; do not alter data semantics. Validate all existing old route URLs and mobile workflows.

### Acceptance
- Responsive header with five destinations; Insight sections are accessible by keyboard and touch (>=44px targets as a design goal)
- Independent logo legible at favicon and header sizes; no Government marks
- Page-specific title, original data, chart/map interactions remain available
- Existing network map, geographical fallback and verified PDF geometry untouched
- Automated regression and Pages build green; Safari on a physical iPhone still requires user visual acceptance after merge
