## Why

Catalog refreshes currently report success and advance the global freshness timestamp when only a handful of live metadata rows were fetched, while fallback and missing sources remain stale. The same pipeline obscures fallback selection, the health UI treats unknown sources as healthy, and normal playback only samples the top 12 videos from an already-curated station.

## What Changes

- Record truthful per-source refresh states (`live`, `partial`, `fallback`, `empty`, or `missing`) and preserve the last genuinely successful fetch timestamp.
- Add catalog-level refresh coverage metadata and only advance catalog freshness when the configured source-coverage threshold is met.
- Preserve curated fallback videos without presenting them as a fresh percentile selection.
- Add a source-coverage audit that reports every configured channel grouped by station and blocks suspiciously incomplete refreshes unless explicitly overridden.
- Treat missing/unknown source metadata as a visible health problem instead of fresh.
- Make normal station playback random across the full filtered pool; retain Smart Mix ranking behavior.
- Keep health diagnostics dismissible for the current condition.

## Capabilities

### New Capabilities

- `catalog-refresh-integrity`: Truthful source provenance, refresh coverage, fallback behavior, and shipping gates.
- `catalog-health-audit`: Reproducible per-channel and per-station catalog audit output with enforceable thresholds.
- `catalog-playback-diversity`: Normal playback samples the full curated station pool rather than a top-12 subset.

### Modified Capabilities

None. This repository had no existing OpenSpec capability records.

## Impact

- Catalog pipeline: `scripts/fetch-channel.mjs`, `scripts/process-catalog.mjs`, quality and audit utilities.
- CI: fetch/build catalog workflows and job summaries.
- Runtime: catalog/source types, source health resolution, Channel Health display, and normal video selection.
- Tests and documentation: pipeline regressions, health semantics, picker behavior, auditability docs, and `PROJECT_STATUS.md`.
- No new runtime dependencies, API keys, database, or server component is introduced.
