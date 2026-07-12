#!/usr/bin/env bash
set -uo pipefail

# Fetch JSONL metadata for LoopTV sources into data/sources/
#
# Fast path per channel:
#   1) complete recent cache (zero requests)
#   2) bounded YouTube Data API fetch when configured
#   3) yt-dlp fallback
#
# Usage:
#   ./scripts/fetch-sources.sh              # all handles (respect cache)
#   ./scripts/fetch-sources.sh --fresh      # ignore cache age
#
# Sharding (for parallel CI jobs):
#   SHARD_INDEX=0 SHARD_TOTAL=8 ./scripts/fetch-sources.sh

DATA_DIR="data/sources"
FRESH="${1:-}"
FETCH_CONCURRENCY="${FETCH_CONCURRENCY:-3}"
SHARD_INDEX="${SHARD_INDEX:-}"
SHARD_TOTAL="${SHARD_TOTAL:-}"
RETRY_SLEEP_SECONDS="${RETRY_SLEEP_SECONDS:-12}"
RETRY_MISSING="${RETRY_MISSING:-true}"
FETCH_METRICS_FILE="${FETCH_METRICS_FILE:-${RUNNER_TEMP:-/tmp}/looptv-fetch-${SHARD_INDEX:-all}-$$.jsonl}"

mkdir -p "$DATA_DIR"
: > "$FETCH_METRICS_FILE"

if [ -n "$SHARD_INDEX" ] && [ -n "$SHARD_TOTAL" ]; then
  HANDLES=$(node scripts/shard-handles.mjs "$SHARD_INDEX" "$SHARD_TOTAL")
  SHARD_LABEL="shard ${SHARD_INDEX}/${SHARD_TOTAL}"
else
  HANDLES=$(node -e "
    const stations = require('./stations.json');
    const handles = new Set();
    for (const s of stations) for (const src of s.sources) handles.add(src.handle);
    console.log([...handles].sort().join('\n'));
  ")
  SHARD_LABEL="all handles"
fi

HANDLE_COUNT=$(echo "$HANDLES" | sed '/^$/d' | wc -l | tr -d ' ')
FRESH_FLAG=""
if [ "$FRESH" = "--fresh" ]; then
  FRESH_FLAG="--fresh"
fi

echo "Fetch scope: $SHARD_LABEL ($HANDLE_COUNT channels)"
echo "Concurrency: $FETCH_CONCURRENCY"
echo ""

export FRESH_FLAG
export FETCH_METRICS_FILE

echo "$HANDLES" | sed '/^$/d' | xargs -P "$FETCH_CONCURRENCY" -I {} bash -c 'echo "[$(date -u +%H:%M:%S)] $1"; node scripts/fetch-channel.mjs "$1" '"$FRESH_FLAG"' || true' _ {} || true

MISSING=0
RETRIED=0
while IFS= read -r handle; do
  [ -z "$handle" ] && continue
  safe=$(echo "$handle" | tr -d '@')
  file="$DATA_DIR/${safe}.jsonl"
  if [ ! -s "$file" ]; then
    MISSING=$((MISSING + 1))
    if [ "$RETRY_MISSING" = "true" ]; then
      echo "Retrying missing @${safe} sequentially..."
      sleep "$RETRY_SLEEP_SECONDS"
      export YT_DLP_SLEEP_INTERVAL="${YT_DLP_SLEEP_INTERVAL:-2}"
      node scripts/fetch-channel.mjs "$handle" $FRESH_FLAG || true
      RETRIED=$((RETRIED + 1))
    fi
    if [ ! -s "$file" ]; then
      echo "WARN: @${safe} still missing after fetch"
    fi
  fi
done <<< "$HANDLES"

OK=0
while IFS= read -r handle; do
  [ -z "$handle" ] && continue
  safe=$(echo "$handle" | tr -d '@')
  if [ -s "$DATA_DIR/${safe}.jsonl" ]; then
    OK=$((OK + 1))
  fi
done <<< "$HANDLES"

echo ""
echo "Fetch done: ${OK}/${HANDLE_COUNT} channels have source JSONL (missing=${MISSING}, retried=${RETRIED})."
node scripts/summarize-fetch-metrics.mjs "$FETCH_METRICS_FILE"

if [ "$OK" -eq 0 ]; then
  echo "ERROR: no source files produced for this shard."
  exit 1
fi

if [ "$OK" -lt "$HANDLE_COUNT" ]; then
  echo "WARN: shard incomplete — build may fail if handles stay missing after merge."
fi
