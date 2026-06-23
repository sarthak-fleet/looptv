#!/usr/bin/env bash
set -euo pipefail

# Build public/catalog.json from cached data/sources JSONL
#
# Usage:
#   ./scripts/build-catalog.sh --process-only
#
# Local full pipeline:
#   ./scripts/fetch-sources.sh && ./scripts/build-catalog.sh --process-only

OUTPUT="public/catalog.json"
DATA_DIR="data/sources"

if [ "${1:-}" != "--process-only" ]; then
  echo "Run ./scripts/fetch-sources.sh first, then ./scripts/build-catalog.sh --process-only"
  echo "(Or pass --process-only after sources are cached.)"
  exit 1
fi

if [ ! -d "$DATA_DIR" ] || [ -z "$(find "$DATA_DIR" -maxdepth 1 -name '*.jsonl' -print -quit 2>/dev/null)" ]; then
  echo "No JSONL sources in $DATA_DIR — run ./scripts/fetch-sources.sh first."
  exit 1
fi

NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=24576}" node scripts/process-catalog.mjs "$DATA_DIR" "$OUTPUT"
echo "Done! Wrote $OUTPUT"
