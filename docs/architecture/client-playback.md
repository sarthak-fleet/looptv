---
title: Client Playback
description: How the browser loads the catalog, plays videos, and degrades gracefully.
---

# Client Playback

## Load path

1. `src/app/page.tsx` (server, static) renders the landing shell with
   `catalog-summary.json` bundled for the station grid.
2. `TVApp.tsx` (`"use client"`) mounts and fetches `/catalog.json` with
   `force-cache`, retry (twice with backoff), and a final no-store retry.
3. On success, the full catalog is held in state; a random video is picked per
   active station and handed to `Player.tsx`.
4. Long-lived tabs revalidate `/catalog-summary.json` on visibility change and
   fetch the full catalog only when the deployed summary `generatedAt` differs
   from the loaded version.

## Offline fallback

If `/catalog.json` fetches fail through the retry sequence:

- The landing page renders an **offline fallback banner** above the channel
  grid. Sample channels stay visible because `stations.json` is bundled into
  the build.
- A **Retry** button re-runs the fetch without a full page reload.
- Dev builds show a `build-catalog` hint instead of the banner.

## YouTube IFrame Player (`Player.tsx`)

- Loads `https://www.youtube.com/iframe_api` dynamically (once, shared across
  mounts via module-level `apiLoaded` / `apiReady` / `apiFailed` flags).
- **Autoplay + muted + playsinline:** browsers block unmuted programmatic
  autoplay; `playsinline: 1` is required for iOS to avoid fullscreen-only
  playback.
- **`loadVideoById` over re-mount:** when the station or video changes, the
  player calls `playerRef.current.loadVideoById(videoId)` instead of destroying
  and re-creating the component. This avoids re-injecting the `<script>` tag
  and the visible flash of a fresh IFrame.
- **12-second API-load timeout:** if `onYouTubeIframeAPIReady` never fires
  (ad-blocker, network filter, offline), `apiFailed` is set and a graceful
  fallback UI renders.

## Embed errors 101 / 150

Error 101/150 fires when a channel owner has disabled embedding for a video
(copyright claim, geo-restriction, owner setting). These are **runtime-only** —
they cannot be predicted from the catalog.

`Player.tsx` treats both as **auto-skip**:

- The video is added to a session skip set.
- `recordEmbedAttempt()` records the failure for source-health diagnostics.
- The next random pick fires immediately.
- **No user-visible error, no toast** — by design, so the "TV channel" feel
  never breaks.

If the `iframe_api` script is blocked entirely, the 12s timeout fires and a
graceful fallback UI renders instead of an infinite spinner.

## Source health & quarantine

`src/lib/source-health.ts` + `src/lib/watched.ts`:

- `getEmbedBlockRate()` computes the embed failure rate from sampled
  `onError` outcomes per source.
- `isEmbedUnhealthy()` flags sources whose sustained embed failure rate crosses
  the quarantine threshold.
- Quarantined sources are excluded from random playback for that browser.
- The `ChannelHealth` panel exposes fresh/stale/partial/fallback/missing/embed/
  quarantined/blocked counts and a one-tap re-enable action.
- All decisions persist in `localStorage` — **per-browser, not portable across
  devices** (see [STATUS.md](../../STATUS.md#unresolved-questions)).

## Watched state (`watched.ts`)

All client state is `localStorage`-only. Clearing site data wipes everything;
nothing leaves the browser.

Keys are defined in `src/lib/watched.ts` (and `looptv_quarantined_sources` /
`looptv_embed_health` are read/written via `source-health.ts`):

| Key | Contents |
| --- | --- |
| `looptv_watched` | Set of video IDs seen ≥50% through |
| `looptv_stats` | Per-station/source counts, total seconds watched |
| `looptv_blocked_sources` | Sources the user opted out of |
| `looptv_watch_later` | Bookmarked video IDs |
| `looptv_saved_for_playback` | Videos saved to play in the current session |
| `looptv_smart_mix_profile` | Smart Mix preference weights |
| `looptv_prefs` | Default station, autoplay/mute on load, hide-watched toggle |
| `looptv_embed_health` | Sampled per-source embed success/failure outcomes |
| `looptv_quarantined_sources` | Sources auto-quarantined for sustained embed failures |

## Smart Mix

`src/lib/smartmix.ts` applies preference-weighted ranking to produce a
top-band selection. Normal station playback samples the full curated pool
uniformly; Smart Mix is the only path that ranks. See
[ADR-004](decisions.md#adr-004) for the percentile-cap rationale that shapes
the pool Smart Mix ranks over.
