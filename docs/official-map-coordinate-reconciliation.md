# TfNSW Sydney rail network: PDF coordinate reconciliation

## Scope and source

The user-supplied `sydney-trains-network-map.pdf` is the **Sydney rail network** artwork credited to Transport for NSW, copyright 2024. It is a 1-page vector PDF (A4; 595.276 × 841.89 PDF points). Its SHA-256 is `f1ec1d8a14612382b084ebeccd3bb30506113002bddca325ae91cd9a9d95f121`, which matches the existing GitHub Pages asset-rendering gate. Source: https://transportnsw.info/sydney-trains-network-map.

The source map is *schematic*, not geospatial, and is valid for its publication period, not necessarily for today's operating routes. The geographic map and GTFS location data are separate.

## Root cause

The previous **Custom diagram** used a hand-positioned network with station coordinates measured in arbitrary diagram units and with generated 45-degree bends. Consequently, even where all underlying station names were correct, the lines' geometry could not reliably resemble the TfNSW network diagram. Cosmetic palette, typography or zoom changes could not fix that.

## Corrective design

The main **Network diagram · TfNSW** option now shows the exact original PDF artwork, rasterized with its aspect ratio preserved. It does **not** redraw its coloured routes. All positioned train and station selection overlays share its 1024 × 1447 source-image coordinate system.

* `site/official-vector-stops.js` stores compact coordinate packets for **277 printed train / Metro station symbols** directly extracted from the PDF's vector paths (white station circles and the Metro's larger rings). They are grouped by T1–T9/M1 source stroke colour and decoded to PDF page coordinates.
* `site/official-map.js` maps **175 of 176 named stations** in the 2024 printed route inventory to the PDF coordinate system. The reconciliation comprises small-circle vector matches, evidence-backed intermediate stops and a small, explicitly identified set of visually calibrated terminal/special glyphs.
* `REFERENCE_2024_ROUTES` preserves printed route order. Only neighbouring points that are both verified on the same printed line can support an approximate live train overlay. Both must be associated with GTFS station coordinates.
* The train symbols use the official source line palette: T1 orange, T2 cyan, T3 burnt orange, T4 blue, T5 magenta, T6 brown, T7 grey, T8 green, T9 red, M1 teal. A **separate small status indicator** conveys delay; fixed stations cannot be mistaken for vehicles.
* The map has user-selectable Original colours or Enhanced contrast. All original printed labels remain readable without layering duplicate labels on top.
* Existing `#/map?map=diagram` deep links and preferences now open the exact official network diagram. The old hand-laid drawing remains accessible as **Legacy hand-drawn**; it is not presented as an accurate representation of the published TfNSW layout. The street map remains **Geographic map**.

## Auditable coordinate differences

GitHub Actions generates the **official-station-coordinate-audit** artifact. It includes:

* `station-coordinate-reconciliation.csv`: one row per printed-network station, showing name, line membership, original legacy schematic X/Y, new TfNSW PDF X/Y, previous manual X/Y where present, the previous-manual-to-PDF displacement in pixels and evidence class.
* `confirmed-station-overlay.svg`: the original source image with an independent visible ring at each successfully reconciled name, for human review. This preview's rings are not part of the production map. The production station targets are unobtrusive and appear on focus/tap.
* `tfnsw-sydney-rail-2024.png`: the original PDF rendition, unaltered, for side-by-side comparison.
* `review-metrics.json`: overall coverage and verified line-specific positions.

The original arbitrary schematic coordinates and the new PDF X/Y are **different coordinate systems**. They must not be subtracted directly or interpreted as metre-scale distances. The `manual_anchor_delta_px` field compares two locations **within the PDF coordinate system** only.

**Accepted source matching result:** 175/176 station names with coordinates; 277 extracted individual line station symbols. The sole outstanding station is **Harris Park**. Its station name remains printed on the unaltered official background, but its independent clickable anchor and live section matching are deliberately withheld rather than guessed. The 277-symbol count does not mean 277 distinct stations, because multiple printed line-coloured dots may represent the same interchange.

## Acceptance and safety gates

- Regression tests validate PDF symbol decoding, source-coordinate bounds, line colours, absence of duplicate named coordinates, deterministic name matching, and minimum 170 confirmed matches.
- Train movement is plotted **approximately** only between confirmed adjacent names with corresponding real-world station coordinates, and only if the reported live position is sufficiently near that section. Missing or out-of-scope line segments generate no train marker.
- A printed 2024 line is **not evidence of a current operating route**. Never interpolate across an unverified gap or infer GPS directly on the schematic PDF.
- No code changes to the TfNSW data collector, location projection, incident evidence, geographic map, crowding or patronage.
- The original PDF asset is SHA pinned and published under TfNSW attribution / Creative Commons. An unexpected map change should fail the asset check rather than silently break alignment.

**Before merge:** Review the generated overlay in the PR's latest Tests artifact, confirm network labels and markers on iPhone Safari / Home Screen app, verify moving train marker visibility and scroll/zoom interactions, then explicitly accept the release. Unit tests alone are not a visual-acceptance sign-off.
