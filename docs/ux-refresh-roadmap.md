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
**Phase 1, PR #32 merged**: site identity, favicon, responsive header with five top-level destinations, Insights sub-navigation, shared card/control treatment, more task-focused Today above-the-fold and clearer map workspace framing. Original routes, renderers and data remain unchanged. Automated acceptance passed; user confirmed merge.

**Phase 2, PR #33 merged**: Today page composition. The Today landing page now presents current incident context, direct links to the Network Map, Trackwork and Trip Planner, and the existing line-status board. The long historical disruption calendar and ranked line/cause comparisons are moved together, unmodified, into an initially collapsed **Disruption calendar and comparisons** native disclosure at **Insights → History** (`#/log`). The original time-range, measure, accessible heatmap, chart and table interactions are reused. Chart DOM mounts only on first expansion, avoiding offscreen-width rendering issues in Safari. The full searchable alert archive continues to appear below the disclosure. No route, data or network-map code changes are made. Final mobile visual acceptance still required after merging.

**Phase 3, PR #34**: Network map presentation only. The map keeps `official-map.js`, `official-vector-stops.js`, original 2024 TfNSW image calibration and data, live overlays, SVG tap/hover behaviour and geographic fallback unchanged. The surrounding view now has a compact map-type and rail-line toolbar, optional **Display options** for area/contrast/night mode, and a contextual station/service information panel. On wide desktop widths this panel appears beside the map; on iPhone, tapping the tall PDF opens a small dismissible fixed-bottom panel, so users are not forced to scroll below the artwork. The selected panel resets on map-mode, area or line changes to prevent stale context. Zoom, pan, attribution, original service and source-colour semantics remain intact. Long source notes are kept under a native accessible **Map sources, accuracy and symbols** disclosure while attribution remains visible. CI and physical-device visual acceptance required before merging.

**Phase 4, separate PRs**: Align Trackwork, Reliability, Crowding, Station Patronage (including nine shades, combined Entries + Exits and annual totals), Alert History and Trip. Share labels, headers, filters and source badges; do not alter data semantics. Validate all existing old route URLs and mobile workflows.

**Phase 4A, PR #36 merged — Trackwork UX**: The existing page now begins with three short status summaries (published significant changes today/tonight, published weekend closures, and the source publication horizon); it places filterable full notice cards before the optional line-by-line timeline. The shared rail-line selector drives both the cards and the timeline and preserves `#/trackwork?line=...` deep links. The SVG timeline remains intact with all keyboard, hover and notice drilldown behaviours but renders only when its native disclosure is opened, preventing collapsed-container sizing bugs on mobile Safari. Existing severity colours, weekly groups, line detail pages and refresh logic remain unchanged. Statements are explicitly scoped to **published notices**, avoiding any unwarranted assertion that a line is clear. The original Network Map files and verified stop calibration are not modified.

**Phase 4B, PR #37 — Insights UI consolidation**: The existing `#/service`, `#/crowding`, `#/stations` and `#/log` pages remain independent renderers with separate units, source quality and meaningful H1 headings. They now share a full-width four-way Insights switcher, visible current-view measurement statement, and optional **Compare these measures** explanation of what each dataset does and does not tell the user. The surrounding filter rows, chart cards and responsive spacing use a shared design layer scoped to Insights only; station heatmaps, annual and monthly Opal computations, crowding occupancy roll-ups, alert history, service delivery and modelled delay estimates are not changed. Preserve `#/insights` alias to Reliability and all preexisting deep links and query parameters. The previous PR #35 whole-browser-module syntax gate and verified official-map checks remain required.

**Phase 4D, Issue #40 / PR #41 — Navigation reliability before visual acceptance**: Prevent slower data requests for Reliability, Crowding, Station Patronage, Trackwork, Network Map and line details from repainting the shared page after the user chooses another destination. Each navigation receives a monotonic route identity; asynchronous views verify that identity before rendering and outdated exceptions cannot replace the current section. History's year/search list also rejects superseded requests. Slow-loading Reliability/Map/Trackwork pages display a short loading status while preserving all data and map engines. This is a code-level regression improvement, not proof of physical Safari acceptance. Complete the Issue #40 visual and interaction checklist on devices after this PR is merged.

**Phase 4E, Issue #40 / PR #42 — Browser history, deep links and live refresh**: Preserve query-only `hashchange` routing for external direct links and browser Back within Reliability, Trackwork, Map and History. In-page filters still use `history.replaceState`, so they do not trigger a new route. Same-page navigation preserves reader scroll and focus. Fix `#/insights` so it is never mistaken for Today during periodic data refresh. On an offline/missing History year file, show an accessible retry option retaining selected filters and guard against superseded requests. No Trip Planner edits or map engine changes. Runtime Node tests simulate actual hashchange callbacks. **Device acceptance under Issue #40 remains required**.

**Trip Planning — final stage only**: Product owner deferred Trip Planner UX until all other sections are accepted. PR #39 was closed **unmerged**; its branch is preserved for future re-review. Leave the current production `#/trip` implementation unchanged until the end of the programme.

### Acceptance
- Responsive header with five destinations; Insight sections are accessible by keyboard and touch (>=44px targets as a design goal)
- Independent logo legible at favicon and header sizes; no Government marks
- Page-specific title, original data, chart/map interactions remain available
- Existing network map, geographical fallback and verified PDF geometry untouched
- Automated regression and Pages build green; Safari on a physical iPhone still requires user visual acceptance after merge
