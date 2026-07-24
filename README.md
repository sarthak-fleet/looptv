# LoopTV

**Product:** [tv.significanthobbies.com](https://tv.significanthobbies.com)


TV-like app that plays random YouTube videos from curated channels, nonstop. Pick a station, hit play, and lean back.

**Zero API keys needed for playback or forks using the checked-in catalog.** Maintained catalog refreshes use a cache-first YouTube Data API path with yt-dlp fallback; free-AI tagging runs only for new, untagged videos.

> **Fork it, edit `stations.json` with your own YouTube channels, and deploy.** That's it.

## Deployment & External Services

| Concern | Service |
|---------|---------|
| Hosting | Cloudflare Pages (`looptv`, `tv.significanthobbies.com`) — static Astro output, deployed via `wrangler pages deploy` |
| Database | None — static `public/catalog.json` served at runtime; watched history in browser `localStorage` |
| Analytics | PostHog via `local posthog-js wrapper` |
| AI / tagging | Free-AI LLM gateway in CI (multi-model fan-out) for untagged videos; local HuggingFace NER retained as an offline fallback, not run in CI |
| CI/CD | GitHub Actions — Pages deploys plus cache-first catalog refreshes on the 1st and 15th |

## Stats

- 16 stations, 122 YouTube channels, 8,760 currently shipped videos (see `public/catalog-summary.json` for the live count)
- Topic tagging via a free-AI LLM gateway (multi-model fan-out) in CI; HuggingFace `dslim/bert-base-NER` retained as a local offline fallback only
- Quality filters: per-source minDuration/maxDuration, global 10K views minimum, per-source top-view percentile cap + 200-video default cap
- Watched tracking with localStorage

## Configuration

`stations.json` is the single config file. Each station groups one or more YouTube channels:

```json
{
  "id": "comedy",
  "name": "Comedy",
  "description": "Stand-up and sketches",
  "sources": [
    { "name": "Comedy Central", "handle": "@ComedyCentral", "minDuration": 60, "maxDuration": 1800 }
  ]
}
```

## Setup

```bash
pnpm install
pnpm dev
```

## Build Catalog

For a reliable refresh, set `YOUTUBE_API_KEY`. Without it, the fetcher falls back to [yt-dlp](https://github.com/yt-dlp/yt-dlp):

```bash
brew install yt-dlp    # or pip install yt-dlp
bash scripts/fetch-sources.sh
bash scripts/build-catalog.sh --process-only
```

Incremental AI tagging runs automatically in GitHub Actions only when new videos need tags. Local NER remains available:

```bash
pip install -r requirements-ner.txt
python3 scripts/extract-tags.py
```

## How It Works

```
stations.json          <- Add YouTube channels here
     |
fetch-sources.sh       <- recent cache, then bounded Data API fetch; yt-dlp fallback
     |
process-catalog.mjs    <- Merges with existing catalog, preserves existing tags for known videos
     |
tag-videos.mjs         <- free-AI LLM gateway tags only new/untagged videos in CI
catalog.json           <- Committed to repo, served as static JSON
     |
Astro + React islands  <- Picks random videos, plays via YouTube IFrame API
```

## Scripts

| Script | Description |
|--------|-------------|
| `scripts/build-catalog.sh` | Process cached sources into the static catalog |
| `scripts/fetch-sources.sh` | Cache-first Data API fetch with yt-dlp fallback |
| `scripts/process-catalog.mjs` | Merge raw JSONL into catalog.json, preserve existing tags |
| `scripts/tag-videos.mjs` | Free-AI LLM gateway topic tagging for untagged videos (CI tagger) |
| `scripts/extract-tags.py` | Local HuggingFace NER tagging fallback (not run in CI) |
| `scripts/fetch-all-sources.sh` | Compatibility wrapper for fetching all sources |

## Controls

| Key | Action |
|-----|--------|
| Space | Play / Pause |
| N / Right | Next random video |
| P / Left | Previous video |
| M | Mute / Unmute |
| F | Fullscreen |
| W | Hide watched videos |
| / | Search |
| 1-9 | Jump to station by number |
| Esc | Close search |

## Playback edge cases

- **Embed errors 101 / 150.** When a channel disables embedding for a
  specific video (geo-block, copyright claim, owner setting), the YouTube
  IFrame Player fires `onError` with code 101 or 150. `Player.tsx` treats
  both as auto-skip: the video is added to a session skip set and the next
  random pick fires immediately. There's no user-visible error and no
  toast — by design, so the "TV channel" feel never breaks.
- **No /catalog.json.** Catalog fetches retry twice with backoff before
  giving up. If they still fail, the landing page renders an offline
  fallback banner above the channel grid (sample channels stay visible
  because `stations.json` is bundled) with a Retry button that re-runs the
  fetch without a page reload. Dev builds show the build-catalog hint
  instead.

## Local stats

`watched.ts` keeps everything client-side in `localStorage`:

- `looptv_watched` — set of video IDs seen ≥ 50% through.
- `looptv_stats` — counts by station + source, total seconds watched.
- `looptv_blocked_sources` — sources you opted out of.
- `looptv_watch_later` — bookmarked video IDs.
- `looptv_smart_mix_profile` — Smart Mix preference weights.
- `looptv_prefs` — default station, autoplay/mute on load, hide-watched toggle.

Clearing site data wipes all of it; nothing leaves the browser.

## GitHub Actions

The source workflow runs on the 1st and 15th. Complete source caches younger than 13 days make zero YouTube requests. Stale or missing sources scan at most 250 recent uploads, stop when known IDs are reached, request video metadata in batches of 50, and hard-stop at 20 requests per source. The chained build audits coverage and replacement churn before calling AI, tags only untagged additions, retries only still-pending tags once, and commits only a passing catalog.

For an occasional complete quality rebaseline, `pnpm audit:catalog:full` scans full upload histories at five requests per second with a 4,500-request global ceiling and per-source checkpoints. It is never scheduled. The July 12 baseline used 3,467 requests for all 122 sources; an immediate rerun used zero. See [`docs/operations/catalog-quality-audit.md`](docs/operations/catalog-quality-audit.md).

## Deployment

Deployed on Cloudflare Pages as a static site: `tv.significanthobbies.com`.

```bash
pnpm build
wrangler pages deploy dist --project-name=looptv
```

## Stack

- Astro static pages + React islands + Tailwind CSS v4
- YouTube IFrame Player API (free, no key)
- YouTube Data API for maintained catalog refreshes; yt-dlp fallback
- Free-AI LLM gateway (multi-model fan-out) for CI topic tagging; HuggingFace Transformers (`dslim/bert-base-NER`) retained as a local offline fallback

## License

MIT

<!-- ACTIVE-AI-TASK-LOG:START -->
## Active AI Task Log

This section is maintained by the SaaS Maker Active-AI product/design loop so future agents do not reopen duplicate UI tasks.

- Business lane: P2 Watch / maintenance
- Rule: do not create another broad "improve the UI" task unless the acceptance criteria differ materially from the tasks listed here.
- Source of truth for task status: SaaS Maker task board. README entries are durable context only.

| Task | Status | Priority | Last known note |
| --- | --- | --- | --- |
| `4a5a6c8c` [fleet-smoke] looptv/web React hydration error | done | medium | 2026-05-25 18:55:41 |
| `fcdbf330` looptv: add clear offline catalog fallback | done | low | 2026-05-26 — landing-page banner with sample channels + Retry when `/catalog.json` fetch fails |
<!-- ACTIVE-AI-TASK-LOG:END -->
