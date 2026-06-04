# Project Status

Last updated: 2026-06-04

## Current Scope

LoopTV is a TV-like web app for watching random YouTube videos from curated channels. It is intentionally API-key-free: the app ships a generated static catalog and deploys as a Cloudflare Pages static export.

## Done

- Thirteen stations are defined in `stations.json`.
- The committed catalog contains roughly 38K videos across 78 curated channels.
- The static Next.js export serves the player without a database, auth system, or YouTube API key.
- YouTube embed errors such as 101 and 150 auto-skip to keep playback moving.
- `/catalog.json` offline fallback behavior and a visible fallback banner are implemented.
- A weekly GitHub Action refreshes the catalog with `yt-dlp` and local/CI enrichment tooling.
- Cloudflare Pages deployment is documented for `looptv.pages.dev`.

## Planned Next

1. Improve station quality by pruning dead, low-signal, or repetitive channels.
2. Add lightweight playback diagnostics for skipped videos and catalog freshness.
3. Make catalog generation easier to audit so station changes show expected video-count deltas.
4. Refine the TV controls for lean-back use on large screens and mobile.

## Deferred / Parked

- User accounts, playlists, likes, and subscriptions are deferred.
- YouTube Data API usage is deferred; the current constraint is zero API keys.
- Server-side catalog storage is parked while the static catalog remains reliable.
