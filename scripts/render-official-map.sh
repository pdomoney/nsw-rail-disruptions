#!/usr/bin/env bash
# Build official TfNSW 2024 rail map raster for the GitHub Pages application.
# The live data remains a separate, credited overlay. Fail closed on changed PDF.
set -euo pipefail
DEST="$1"
SOURCE="https://transportnsw.info/sydney-trains-network-map"
FILE="tfnsw-sydney-rail-2024.png"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$DEST"
if [[ -n "$OFFICIAL_MAP_PNG_INPUT" ]]; then
  test -s "$OFFICIAL_MAP_PNG_INPUT"
  cp "$OFFICIAL_MAP_PNG_INPUT" "$DEST/$FILE"
  exit 0
fi
if ! command -v pdftoppm >/dev/null || ! command -v pdftotext >/dev/null; then
  echo "::warning::Cannot render TfNSW PDF without poppler-utils" >&2
  exit 2
fi
curl --fail --location --silent --show-error --retry 2 --max-time 30 --max-filesize 12000000 \
  -A 'NSW-Rail-Disruptions/1.0 (+https://github.com/pdomoney/nsw-rail-disruptions)' \
  "$SOURCE" -o "$TMP/map.pdf"
test "$(head -c4 "$TMP/map.pdf")" = "%PDF"
pdftotext -layout -f 1 -l 1 "$TMP/map.pdf" "$TMP/map.txt"
if ! grep -iq 'Sydney rail network' "$TMP/map.txt" || \
   ! grep -Eq 'APXP_SRM_20240701|2024 Transport for NSW' "$TMP/map.txt"; then
   echo "::error::Official map PDF edition is not validated for this overlay." >&2
   exit 3
fi
PAGES="$(pdfinfo "$TMP/map.pdf" | awk '/^Pages:/{print $2}')"
test "$PAGES" = 1
pdftoppm -f 1 -l 1 -scale-to-x 2048 -scale-to-y -1 -png -singlefile \
  "$TMP/map.pdf" "$TMP/map" >/dev/null 2>&1
test -s "$TMP/map.png"
cp "$TMP/map.png" "$DEST/$FILE"
echo "Rendered approved TfNSW 2024 map: $(du -h "$DEST/$FILE" | cut -f1)"
