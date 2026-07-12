## Context

The July 10 source artifacts contained 4,549 rows: 4,540 catalog-fallback rows and 9 live rows. Seven sources mixed one or two live rows with fallback data, one source was live-only, 93 were fallback-only, and 21 configured sources had no artifact. Because mixed input counted as live, `public/catalog.json.lastUpdated` advanced even though source coverage did not materially refresh. The fallback branch also reports `top 100%`, while the client health resolver maps unknown metadata to `fresh`. Separately, the normal picker ranks the station and samples only its top 12 videos.

## Goals / Non-Goals

**Goals:**

- Make refresh timestamps and source health reflect observed fetch provenance.
- Preserve the last playable catalog when YouTube blocks metadata fetches.
- Make incomplete coverage visible and enforceable in CI.
- Produce an auditable station/channel inventory from committed inputs.
- Let normal playback reach every eligible video in the selected pool.

**Non-Goals:**

- Guarantee that YouTube permits every metadata request.
- Add YouTube API keys, cookies, authentication, or paid data providers.
- Change per-source duration, view-count, percentile, or 200-video policies in this change.
- Change Smart Mix personalization ranking.
- Automatically deploy production.

## Decisions

### Keep raw source cache separate from catalog fallback

Successful fetches write only live metadata rows. A fetch response that returns fewer than a conservative completeness floor is rejected and retains the previous raw cache instead of mixing one or two rows into the checked-in catalog. The build no longer writes checked-in catalog fallback rows back into `data/sources`; `process-catalog.mjs` preserves prior catalog videos directly when an artifact is missing or unusable.

For migration from contaminated caches, `process-catalog.mjs` derives source state from artifact presence and `_looptvCatalogFallback` markers. Live-only input is `live`; mixed input is `partial`; fallback-only input is `fallback`; a present empty artifact is `empty`; and no artifact is `missing`. Missing sources retain prior timestamps/counts for diagnosis but never become fresh.

Alternative considered: add per-source sidecar files. Separating raw cache from catalog preservation plus a minimum enrichment floor removes the contamination loop without another artifact format.

### Separate generation time from successful refresh time

The catalog will expose `generatedAt` for build time and retain `lastUpdated` as the last refresh that met coverage. A refresh is complete when at least 80% of configured sources are live-only and no previously represented source is missing. The exact coverage summary is committed in `refreshStatus`.

Alternative considered: use the newest source timestamp. That repeats the current false-positive behavior because one source can make the whole catalog appear fresh.

### Preserve fallback as an already-curated set

Fallback-only and mixed artifacts contain prior catalog output, not a full candidate population. They will remain deduplicated, view-sorted, and capped without reapplying percentage cuts that would repeatedly shrink the catalog. Logs and metadata will call this preservation, not `top 100%` selection.

### Add a dedicated coverage audit

A reusable script will join `stations.json`, `catalog.json`, and source provenance into JSON/Markdown summaries grouped by station. CI will fail when coverage falls below the threshold, a represented source disappears, metadata is absent, configured duration/view invariants fail, or station totals do not match channel contributions. An explicit workflow override remains available for intentional rebaselines.

### Make the normal picker uniform

`pickRandom` will uniformly sample the complete caller-filtered pool after excluding the current item. Catalog construction already enforces quality. Smart Mix keeps its score-based top band.

## Risks / Trade-offs

- **YouTube blocks enough sources that scheduled refreshes fail more often** → Preserve artifacts and publish the audit report, but refuse to claim or ship a complete refresh without an explicit override.
- **Historical catalogs lack new provenance fields** → Treat absent provenance as `unknown` and keep types backward compatible while the next build populates fields.
- **Uniform playback surfaces lower-view curated entries** → The 10,000-view floor and per-source percentile remain the quality boundary; watched, blocked, and quarantine filters still apply.
- **Fallback sets can age indefinitely** → Health remains stale and CI coverage reports the condition rather than hiding it.

## Migration Plan

1. Add backward-compatible metadata fields and tests.
2. Generate and audit a catalog using the archived July 10 artifacts.
3. Keep the existing catalog videos if coverage is incomplete; update provenance and audit output without claiming freshness.
4. Land code without production deployment. The next manual production deploy and scheduled fetch remain separate operator actions.

## Open Questions

None blocking. Per-source editorial percentile changes, including SNL's 3% rule, remain a separate product decision after reliable fresh metadata is available.
