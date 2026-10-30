#!/usr/bin/env bash
# Build official TfNSW 2026 rail map raster for the GitHub Pages application.
# The live data remains a separate, credited overlay. Fail closed on changed PDF.
set -euo pipefail
DEST="$1"
SOURCE="https://transportnsw.info/sydney-trains-network-map"
OFFICIAL_MAP_PNG_INPUT="${OFFICIAL_MAP_PNG_INPUT:-}"
OFFICIAL_MAP_PREVIEW_UNVERIFIED="${OFFICIAL_MAP_PREVIEW_UNVERIFIED:-0}"
FILE="tfnsw-sydney-rail-2026.png"
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
PDF_SHA="$(sha256sum "$TMP/map.pdf" | cut -d' ' -f1)"
echo "Official TfNSW PDF SHA256: $PDF_SHA"
# Some of the released PDF maps have only an accessibility summary in the
# text layer. An image inspection AND a pinned SHA will validate this source.
APPROVED_SHA="7877f5bed61ef5f04fbda86752ca1582732544752242ca4777e2e93b00662669"
if [[ "$PDF_SHA" != "$APPROVED_SHA" ]]; then
  if [[ "$OFFICIAL_MAP_PREVIEW_UNVERIFIED" != "1" ]]; then
    echo "::error::TfNSW PDF does not match the approved reference hash." >&2
    exit 3
  fi
  echo "::warning::CI preview of unapproved TfNSW PDF; production publication remains blocked."
fi
PAGES="$(pdfinfo "$TMP/map.pdf" | awk '/^Pages:/{print $2}')"
test "$PAGES" = 1
pdftoppm -f 1 -l 1 -scale-to-x 2048 -scale-to-y -1 -png -singlefile \
  "$TMP/map.pdf" "$TMP/map" >/dev/null 2>&1
test -s "$TMP/map.png"
cp "$TMP/map.png" "$DEST/$FILE"
if [[ "${OFFICIAL_MAP_SOURCE_AUDIT:-0}" == "1" ]]; then
  cp "$TMP/map.pdf" "$DEST/tfnsw-sydney-rail-2026.pdf"
fi
echo "Rendered checksum-verified TfNSW 2026 map: $(du -h "$DEST/$FILE" | cut -f1)"
