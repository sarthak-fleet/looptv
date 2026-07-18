---
title: Adding a Station
description: How to add a new station or channel to LoopTV.
---

# Adding a Station

`stations.json` is the single config file. The frontend picks up new stations
from the catalog automatically; the catalog pipeline picks them up from
`stations.json`.

## 1. Edit `stations.json`

Add a station entry. Each station groups one or more YouTube channel sources:

```json
{
  "id": "comedy",
  "name": "Comedy",
  "description": "Stand-up and sketches",
  "sources": [
    {
      "name": "Comedy Central",
      "handle": "@ComedyCentral",
      "channelId": "UCpCD...",
      "minDuration": 60,
      "maxDuration": 1800,
      "topPercentile": 25,
      "maxVideos": 200
    }
  ]
}
```

### Source fields

| Field | Required | Description |
| --- | --- | --- |
| `name` | yes | Display name (also the `source` field on `Video` records) |
| `handle` | yes | YouTube `@handle` used by yt-dlp |
| `channelId` | optional | `UC...` id — needed for RSS feed URLs (handles don't work there) |
| `minDuration` / `maxDuration` | optional | Per-source duration filter (seconds) |
| `topPercentile` | optional | Override the auto-selected percentile cap (e.g. `25` = keep top 25% by views). Default is a step function of source size — see [ADR-004](../architecture/decisions.md#adr-004). |
| `maxVideos` | optional | Override the default 200-video source cap |

The TypeScript types live in [src/lib/types.ts](../../src/lib/types.ts)
(`StationConfig`, `YouTubeSource`) and are re-exported via
`channels.config.ts`.

## 2. Rebuild the catalog

```bash
bash scripts/fetch-sources.sh
bash scripts/build-catalog.sh --process-only
```

See [catalog-rebuild.md](catalog-rebuild.md) for the full set of options.

## 3. Audit

```bash
node scripts/audit-catalog-health.mjs
node scripts/validate-catalog-manifest.mjs --update
```

A new station not yet in `catalog-manifest.json` triggers a warning only (not a
hard fail). The `--update` flag rebaselines the manifest to include the new
station.

## 4. Commit

Commit `stations.json`, `public/catalog.json`,
`public/catalog-summary.json`, and `catalog-manifest.json` together.

## 5. Deploy

Push to `main` (or merge a PR). The deploy workflow builds and ships to
Cloudflare Pages. See [operations/deployment.md](../operations/deployment.md).

## Gotchas

- **`channelId` is required for RSS-based fetch paths.** Handles alone don't
  work for the YouTube RSS feed URLs used by some fetch paths.
- **A new station with zero videos after processing fails the build.**
  `process-catalog.mjs` exits non-zero on any empty station — fix the source
  config or fetch before committing.
- **Large channels need a `topPercentile` or `maxVideos` override** or they'll
  dominate the station. SNL uses `topPercentile: 30, maxVideos: 1000` because
  it occupies its own station.
