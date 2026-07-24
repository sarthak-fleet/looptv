---
title: Product Overview
description: What LoopTV is, who it's for, and what's in or out of scope.
---

# Product Overview

## Thesis

TV-like web app for random YouTube playback from curated channels — lean-back
and keyless at runtime. Maintainers edit `stations.json`; bi-weekly CI refreshes
`catalog.json` through a cache-first YouTube Data API path with yt-dlp fallback
and incremental AI tagging.

## Who it's for

- **Lean-back viewers** who want a "channel-surf YouTube like it's TV"
  experience: pick a station, hit play, let random clips run nonstop.
- **Maintainers / forkers** who want a zero-API-key, static-hosted YouTube
  player they can retune by editing one JSON file.
- **The fleet** — LoopTV is one of the public-ready products in the fleet and
  follows the shared fleet agent standard at `../AGENTS.md`.

## In scope

- Static Astro pages with React islands on Cloudflare Pages.
- YouTube IFrame Player API playback (free, no key).
- Client-side watch history, playback diagnostics, source health
  auto-quarantine, lean-back controls redesign.
- Maintainer-edited `stations.json` + automated catalog refresh pipeline.

## Out of scope (parked)

- User accounts.
- Server-side catalog or watch sync while the static catalog stays reliable.
- Playlists, likes, and subscriptions as cloud features.
- Recommendation engine beyond Smart Mix local weights.

## Products

| Product | Surface | Role |
| --- | --- | --- |
| LoopTV player | Station grid + random picker | Lean-back YouTube playback from curated catalog |
| Catalog pipeline | `stations.json` → `catalog.json` | Maintainer-edited stations + automated metadata/NER refresh |
| Client stats | `localStorage` keys | Per-browser watch history, Smart Mix, quarantine state |

## Current stats

- **16 stations, 122 YouTube channels, 8,760 curated videos** (per
  `public/catalog-summary.json`, generated 2026-07-15).
- Global 10K-view minimum filter.
- Per-source duration, percentile, and optional cap controls in `stations.json`.

## Fork-friendly positioning

Edit `stations.json` with your own YouTube channels and deploy — that's the
whole fork story. The checked-in `catalog.json` works with zero API keys; only
catalog refreshes need (repository-scoped, CI-only) credentials. See
[development/adding-station.md](../development/adding-station.md).

## Shipped features

See [features.md](features.md) for the full shipped-feature inventory.
