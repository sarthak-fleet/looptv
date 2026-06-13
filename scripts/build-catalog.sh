#!/usr/bin/env bash
set -euo pipefail

# Build video catalog for all LoopTV stations
# Reads station config from stations.json
# Uses cached data from data/sources/ if available, otherwise fetches fresh
#
# Usage:
#   ./scripts/build-catalog.sh              # Use cached + fetch missing
#   ./scripts/build-catalog.sh --fresh      # Re-fetch everything

OUTPUT="public/catalog.json"
DATA_DIR="data/sources"
TEMP_DIR=$(mktemp -d)
trap 'rm -rf "$TEMP_DIR"' EXIT
FRESH="${1:-}"
MIN_CACHE_ROWS_TO_TRUST="${MIN_CACHE_ROWS_TO_TRUST:-5}"

mkdir -p "$DATA_DIR"

# Extract unique YouTube handles from stations.json
HANDLES=$(node -e "
  const stations = require('./stations.json');
  const handles = new Set();
  for (const s of stations) for (const src of s.sources) handles.add(src.handle);
  console.log([...handles].join(' '));
")

echo "Stations need handles: $(echo $HANDLES | wc -w | tr -d ' ') channels"
echo ""

for handle in $HANDLES; do
  SAFE=$(echo "$handle" | tr -d '@')
  CACHED="$DATA_DIR/${SAFE}.jsonl"

  if [ "$FRESH" != "--fresh" ] && [ -f "$CACHED" ] && [ -s "$CACHED" ]; then
    COUNT=$(wc -l < "$CACHED" | tr -d ' ')
    if [ "$COUNT" -lt "$MIN_CACHE_ROWS_TO_TRUST" ]; then
      printf "  @%-30s cached only %s videos, refetching..." "$SAFE" "$COUNT"
      yt-dlp --flat-playlist --dump-json --no-warnings \
        "https://www.youtube.com/$handle/videos" > "$TEMP_DIR/${SAFE}.jsonl" 2>/dev/null || true
      FRESH_COUNT=$(wc -l < "$TEMP_DIR/${SAFE}.jsonl" | tr -d ' ')
      if [ "$FRESH_COUNT" -gt "$COUNT" ]; then
        printf " %s videos\n" "$FRESH_COUNT"
        cp "$TEMP_DIR/${SAFE}.jsonl" "$CACHED"
      else
        printf " keeping cached %s videos\n" "$COUNT"
        cp "$CACHED" "$TEMP_DIR/${SAFE}.jsonl"
      fi
    else
      printf "  @%-30s CACHED (%s videos)\n" "$SAFE" "$COUNT"
      cp "$CACHED" "$TEMP_DIR/${SAFE}.jsonl"
    fi
  else
    printf "  @%-30s fetching..." "$SAFE"
    yt-dlp --flat-playlist --dump-json --no-warnings \
      "https://www.youtube.com/$handle/videos" > "$TEMP_DIR/${SAFE}.jsonl" 2>/dev/null || true
    COUNT=$(wc -l < "$TEMP_DIR/${SAFE}.jsonl" | tr -d ' ')
    if [ "$COUNT" -gt 0 ]; then
      printf " %s videos\n" "$COUNT"
      # Save successful fetches to cache.
      cp "$TEMP_DIR/${SAFE}.jsonl" "$CACHED"
    elif [ -f "$CACHED" ] && [ -s "$CACHED" ]; then
      CACHED_COUNT=$(wc -l < "$CACHED" | tr -d ' ')
      printf " fetch failed, keeping cached %s videos\n" "$CACHED_COUNT"
      cp "$CACHED" "$TEMP_DIR/${SAFE}.jsonl"
    else
      printf " fetch failed, no cache available\n"
    fi
  fi
done

echo ""
node scripts/process-catalog.mjs "$TEMP_DIR" "$OUTPUT"
echo "Done!"
