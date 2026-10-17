#!/usr/bin/env bash
# Rebuild data/addresses-london.tsv (the quote form's postcode → address lookup) from the latest Greater London
# OpenStreetMap extract (Geofabrik, free, ODbL). Safe to rerun: builds a new file and swaps it in only if it looks
# complete; the running server picks it up within a minute (no restart). ~130 MB download, ~1 min, ~550 MB RAM peak.
set -euo pipefail
cd "$(dirname "$0")/.."
WORK=${ADDRESS_WORK:-$HOME/.cache/lcc-addresses}
OUT=${ADDRESS_DATA:-data/addresses-london.tsv}
URL=https://download.geofabrik.de/europe/united-kingdom/england/greater-london-latest.osm.pbf
mkdir -p "$WORK" "$(dirname "$OUT")"
[ -x "$WORK/venv/bin/python" ] || { python3 -m venv "$WORK/venv" && "$WORK/venv/bin/pip" install -q osmium; }
curl -fsSL --retry 3 -o "$WORK/london.osm.pbf" "$URL"
"$WORK/venv/bin/python" -I scripts/import-addresses.py "$WORK/london.osm.pbf" "$OUT.new"
rm -f "$WORK/london.osm.pbf"
lines=$(wc -l < "$OUT.new")
if [ "$lines" -lt 100000 ]; then echo "only $lines addresses — keeping the old file" >&2; rm -f "$OUT.new"; exit 1; fi
mv "$OUT.new" "$OUT"
