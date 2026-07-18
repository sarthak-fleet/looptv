---
title: Catalog Pipeline
description: How stations.json becomes catalog.json — fetch, process, audit, tag, commit.
---

# Catalog Pipeline

The pipeline runs only in CI (and manually by maintainers). It never runs in the
browser or at deploy time. The end-to-end chain is documented in
[operations/jobs/](../operations/jobs/); this page covers the *how and why* of
each stage.

## Stages

### 1. Fetch sources (`fetch-sources.sh` / `fetch-channel.mjs`)

Cache-first. For each source in `stations.json`:

1. If a complete source cache (`data/sources/<handle>.jsonl`) exists and is
   younger than 13 days, **zero YouTube requests** are made.
2. Otherwise, bounded incremental discovery via the YouTube Data API:
   - Read the channel's uploads playlist, at most 250 recent uploads.
   - Stop paging as soon as a page contains only already-known IDs.
   - Batch video metadata requests in groups of 50 IDs.
   - Hard-stop at 20 requests per source.
3. If the Data API is unavailable or no key is set, fall back to
   `yt-dlp --flat-playlist --dump-json` (sequential per channel to avoid
   rate-limiting the GitHub Actions IP range).
4. A valid prior cache is never replaced by a failed/incomplete fetch — the
   fetcher falls back rather than overwriting.

Each source row records its provenance (`live`, `partial`, `fallback`, `empty`,
`missing`) and the successful-fetch time is derived from row provenance, not
artifact extraction time. This prevents checkout time from hiding stale data.

### 2. Process (`process-catalog.mjs`)

- Merges all `data/sources/*.jsonl` into a single catalog.
- Preserves existing NER/LLM tags for known video IDs (key to incremental
  cheapness — only new videos need tagging).
- Applies quality filters in order:
  1. Per-source `minDuration` / `maxDuration` from `stations.json`.
  2. Global 10,000-view minimum (requires full video metadata).
  3. Per-source top-view percentile cap, chosen by a step function of the
     source's eligible video count (`calcPercentile` in
     `scripts/catalog-quality.mjs`): ≥10,000 videos → top 3%, ≥5,000 → 5%,
     ≥2,000 → 8%, ≥1,000 → 10%, ≥500 → 15%, ≥200 → 25%, ≥75 → 35%, else 50%.
     Thresholds are absolute per source size, not relative to other sources;
     overridable via `topPercentile` in `stations.json`.
  4. Per-source video cap (default 200; overridable via `maxVideos`; SNL uses
     1,000 because it occupies its own station).
- Writes `public/catalog.json` (~2MB) and `public/catalog-summary.json`
  (counts only, for fast first paint).
- Strips `description` fields after tagging to keep file size down.
- **Empty-station guard:** `process.exit(1)` if any station ends up with zero
  videos, preventing a broken catalog from being committed.

### 3. Audit (before tagging)

Two audits run *before* any AI tagging call, so a rejected catalog spends no
tagging quota:

- **Source health** (`scripts/audit-catalog-health.mjs`): joins `stations.json`
  and `catalog.json` into a station/source report. Verifies source membership,
  duration bounds, the 10K-view floor, unique video IDs, per-source selected
  counts, and fresh-source coverage (≥80%). Exits non-zero on violations.
- **Manifest** (`scripts/validate-catalog-manifest.mjs`): compares the freshly
  generated catalog against `catalog-manifest.json` baselines (per-station
  counts + per-video map). Catches silent swaps where counts stay stable but
  the actual video set changes. See
  [operations/catalog-auditability.md](../operations/catalog-auditability.md)
  for the full rule table.

### 4. Tag (only if untagged videos exist)

- `scripts/catalog-tag-status.mjs` counts videos still needing tags.
- If nonzero, `scripts/smoke-tag-gateway.mjs` pings the free-AI gateway first.
- `scripts/tag-videos.mjs` fans out across 7 free-tier LLM providers (2
  concurrent workers each = 14 parallel workers). Batches that fail (429 or
  parse error) are re-queued for another model. JSON arrays are extracted from
  prose-wrapped LLM responses via `content.match(/\[[\s\S]*\]/)`.
- One bounded retry pass for videos still pending after the first pass.
- **Shipping gate:** if any videos are still untagged after the retry, the
  workflow refuses to commit. A catalog never ships with untagged videos.
- `extract-tags.py` (HuggingFace BERT NER) is retained as a local/offline
  fallback but is **not** invoked in CI. See
  [knowledge/failed-approaches/bert-ner-noise.md](../knowledge/failed-approaches/bert-ner-noise.md)
  for why NER was retired from CI.

### 5. Commit

- `git add public/catalog.json public/catalog-summary.json catalog-manifest.json`
- Commit message includes the new total video count, a per-station count diff,
  and a per-video changelog (added/removed/title-changed, with removed titles).
- Only commits when all audits passed (or `override_audit` was set) and the
  pending-tag count is zero.

## Quota controls (why the numbers are what they are)

| Control | Value | Why |
| --- | --- | --- |
| Cache freshness gate | 13 days | Bi-weekly schedule (1st & 15th) + slack; a complete cache is trusted until then |
| Recent uploads ceiling | 250 | Bounded incremental discovery; full history is a separate manual rebaseline |
| Metadata batch size | 50 IDs | YouTube Data API `videos.list` max page size |
| Per-source request hard stop | 20 | Prevents a single broken source from burning the daily quota |
| Full rebaseline global ceiling | 4,500 | Manual-only; the verified 122-source baseline used 3,467 |
| Full rebaseline rate | 5 req/s | Polite throttle; never scheduled |
| Inter-batch tag sleep | 3.2s | Pragmatic floor to avoid 429s across all 7 free-AI models at once |

## Full quality rebaseline (manual)

`pnpm audit:catalog:full` (`scripts/full-catalog-rebaseline.mjs`) is the only
path that scans a source's *complete* upload history. It is never scheduled.
It applies embedding/duration/10K-view eligibility once, applies the source
percentile once, applies the configured cap, checkpoints each source, and
records a `full-history` baseline in catalog metadata. Normal scheduled
refreshes reuse those verified top sets and remain incremental. See
[operations/catalog-quality-audit.md](../operations/catalog-quality-audit.md)
for the verified baseline numbers per source.

## Runner cache seeding

A catalog with `full-history` source metadata can reconstruct compact verified
source checkpoints on a fresh or legacy GitHub Actions runner. This prevents an
empty or legacy Actions cache from reverting to recent-only ranking — row
provenance, not extraction mtime, controls freshness.
