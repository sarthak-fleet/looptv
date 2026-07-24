---
title: Architecture Overview
description: System shape, data flow, and the boundaries that define LoopTV.
---

# Architecture Overview

## One-paragraph shape

LoopTV is a static Astro site. Content routes are prerendered and interactive
playback or browser-state surfaces hydrate as React islands; `catalog.json` is
fetched client-side and the YouTube IFrame Player API does all playback. A
separate, CI-only catalog pipeline rebuilds
`public/catalog.json` on a bi-weekly schedule from `stations.json` using a
cache-first YouTube Data API path with yt-dlp fallback and incremental free-AI
tagging. There is no database, no auth, and no server runtime.

## Data flow

```
stations.json
     │
     ▼  (CI only — fetch-catalog-sources.yml, 1st & 15th)
fetch-sources.sh ── cache-first ──► YouTube Data API (bounded)
                                   └── yt-dlp fallback
     │
     ▼  (build-catalog.yml)
process-catalog.mjs ── merge + dedup, preserve existing tags
     │                   apply duration / 10K-view / percentile / cap filters
     ▼
audit-catalog-health.mjs ── source coverage + invariant gates
validate-catalog-manifest.mjs ── count + per-video churn gates
     │
     ▼  (only if untagged videos exist)
tag-videos.mjs ── free-AI gateway, multi-model fan-out, retry once
     │
     ▼
public/catalog.json + public/catalog-summary.json + catalog-manifest.json
     │  (committed to repo, served as static CDN assets)
     ▼
Astro + React islands ── fetch /catalog.json client-side
     │              pick random video per station
     ▼
YouTube IFrame Player API ── onError 101/150 → auto-skip
                              onEnded → next random pick
     │
     ▼
watched.ts ── localStorage: watched, stats, blocked, watch-later, smart-mix, prefs
```

## Boundaries (why this shape)

- **No server runtime.** `astro build` prerenders static `dist/` output for
  Cloudflare Pages. This is a deliberate choice — see
  [ADR-008](decisions.md#adr-008). Anything requiring an on-request server
  adapter is out of scope.
- **No database.** The "zero API keys for playback/forks" positioning depends
  on a committed static catalog. Watched history lives in `localStorage`. See
  [ADR-003](decisions.md#adr-003).
- **No YouTube API key in the browser.** Playback uses the free IFrame Player
  API. The YouTube Data API key is repository-scoped and CI-only — it never
  reaches a build, deploy, or the static app. See
  [ADR-002](decisions.md#adr-002) and
  [ADR-001](decisions.md#adr-001).
- **Catalog is stale between rebuilds (max ~14-day lag).** Mitigated by
  `getCatalogFreshness()` surfacing stale state to the user and a separate
  `catalog-summary.json` for fast first paint.

## Key modules

| Area | Files | Notes |
| --- | --- | --- |
| Player | `src/components/Player.tsx` | YouTube IFrame API wrapper, auto-skip on 101/150, 12s API-load timeout |
| Orchestrator | `src/components/TVApp.tsx` | Station selection, playback state, watched/smart-mix wiring |
| Catalog client | `src/lib/catalog.ts` | Load, filter, random pick, search, freshness |
| Watched state | `src/lib/watched.ts` | localStorage keys, embed health, quarantine |
| Source health | `src/lib/source-health.ts` | Embed-block rate, quarantine decisions |
| Diagnostics | `src/lib/playback-diagnostics.ts` | Degraded-state banner signal |
| Smart Mix | `src/lib/smartmix.ts` | Preference-weighted ranking |
| Stations config | `stations.json` → `channels.config.ts` | Single source of station/source definitions |
| Catalog types | `src/lib/types.ts` | `Video`, `StationConfig`, `Catalog`, `CatalogRefreshStatus` |
| Catalog pipeline | `scripts/*.mjs`, `scripts/*.sh` | See [catalog-pipeline.md](catalog-pipeline.md) |

## Deeper docs

- [catalog-pipeline.md](catalog-pipeline.md) — how the CI catalog pipeline
  works end-to-end, including quota controls and audit gates.
- [client-playback.md](client-playback.md) — client-side playback, embed-error
  handling, and offline fallback behavior.
- [decisions.md](decisions.md) — Architecture Decision Records (ADRs).
