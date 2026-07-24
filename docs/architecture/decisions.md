---
title: Architecture Decision Records
description: ADRs for LoopTV — the why behind each active architectural choice.
---

# Architecture Decision Records — LoopTV

<!-- ADRs in reverse-chronological order. Flag unknowable rationale as TBD. -->

---

<a id="adr-008"></a>
## ADR-008 — Astro static pages with React islands

**Date:** 2026-07-24
**Status:** Active

### Context
LoopTV has no server runtime, database, authentication, or request-time data
requirements. Next.js was used only to export static routes around an
interactive React player and local-browser utilities.

### Decision
Use Astro for static routing, metadata, and generated text/JSON/XML outputs.
Keep the existing React player and browser-state surfaces as hydrated islands.
Cloudflare Pages serves the generated `dist/` directory.

### Rationale
- Matches the product's static hosting boundary directly.
- Keeps content pages HTML-first while preserving the tested React player.
- Removes Next-specific routing, metadata, and export configuration.

### Tradeoffs
- React islands still ship React to interactive routes.
- A future request-time feature would require a separate service or an
  explicitly approved Astro server adapter.

---

<a id="adr-007"></a>
## ADR-007 — `next build --webpack` instead of Turbopack

**Date:** 2026-05-28 (inferred from "Align TypeScript config" commit)  
**Status:** Superseded by ADR-008

### Context
Next.js 16 ships with Turbopack as the default bundler for `next build`. The project moved to `output: 'export'` on Cloudflare Pages and needed a reliable static-export build.

### Decision
`package.json` production build script is `next build --webpack`, explicitly opting out of Turbopack.

### Rationale
TBD: capture rationale — no commit message explains it. Likely: Turbopack's static-export support was incomplete or produced different bundle characteristics at the time.

### Tradeoffs
- Slower cold builds vs Turbopack.
- Avoids Turbopack edge cases with static export (noted in AGENTS.md: "Turbopack — has breaking changes vs webpack; check Next.js docs for Turbopack-specific behavior").

---

<a id="adr-006"></a>
## ADR-006 — Dual tagging pipeline: BERT NER (local) + LLM gateway (CI)

**Date:** 2026-04-05 (commit `70350e3`)  
**Status:** Active

### Context
The original pipeline ran `dslim/bert-base-NER` locally and in CI to produce tags. NER categories were quickly found to be too noisy (commit `8203c0b`: "too noisy — v2 will use zero-shot topic classification instead") and were disabled. A new LLM-based tagging script (`tag-videos.mjs`) was introduced alongside the retained NER script.

### Decision
CI now runs `tag-videos.mjs` (LLM gateway, multi-model fan-out) for new-video tagging. `extract-tags.py` (BERT NER) is retained as a local/fallback tool but is no longer invoked in the weekly catalog workflow.

### Rationale
- LLM tagging produces topic-oriented tags (e.g. "black holes", "stoicism") vs. NER's entity tags (person/place names). Topic tags are more useful for browse/search.
- The free-AI gateway (a Cloudflare Worker) fans out across 7 free-tier models simultaneously, so 0 cost per run.
- BERT NER requires `torch` (~1GB install) in CI; removing it shrank the GH Actions job.

### Alternatives
- Keep BERT NER: cheaper locally, zero network, but produces entity tags not topic tags.
- YouTube Data API categories: not pursued; API-key-free constraint is a hard requirement.

### Tradeoffs
- LLM tagging is non-deterministic; same video may get different tags on re-runs.
- Network dependency on the free-AI gateway; `extract-tags.py` kept as offline fallback.
- `requirements-ner.txt` (transformers, torch) still committed but not used in CI.

---

<a id="adr-005"></a>
## ADR-005 — Cloudflare Workers (OpenNext) → Cloudflare Pages (static export)

**Date:** 2026-04-28 (commit `872175b`)  
**Status:** Active

### Context
LoopTV was initially deployed as a Cloudflare Worker using OpenNext (server-side Next.js on Workers). The app is 100% client-side — no API routes, no SSR, no server-only logic — making a Worker bundle unnecessary overhead.

### Decision
Switched to `output: 'export'` (static Next.js export) deployed via `wrangler pages deploy out`. Worker kept live temporarily; Pages is the canonical target.

### Rationale
- No SSR needed: `TVApp.tsx` and `Player.tsx` are `"use client"`; catalog.json is fetched client-side.
- Pages CDN is simpler, faster for static assets, and has no Worker cold-start.
- OpenNext required custom bindings and an incremental cache setup (commit `opennext: add static-assets incremental cache`) that added complexity for zero benefit.
- Removing the Worker also removed an `ImageResponse` OG-image route (incompatible with static export) — acceptable tradeoff.

### Alternatives
- Stay on Workers: only makes sense if API routes or SSR are added later.
- Vercel: was the default from `create-next-app`; references removed 2026-04-27 (`chore: drop vercel.app refs`). Not formally evaluated.

### Tradeoffs
- Static export: no server-side rendering, no API routes possible without a separate Worker.
- `opengraph-image.tsx` dropped; static OG image committed to `public/` instead.

---

<a id="adr-004"></a>
## ADR-004 — Step-function percentile filter per source

**Date:** 2026-04-05 (commit `70350e3`)  
**Status:** Active

### Context
Larger channels (e.g. 2,000+ videos) would dominate a station if all videos were included. Smaller channels (50 videos) would barely appear.

### Decision
The shared filter (`calcPercentile` in `scripts/catalog-quality.mjs`, applied by `process-catalog.mjs`) picks a top-view percentile by a **step function** of the source's eligible video count: ≥10,000 → top 3%, ≥5,000 → 5%, ≥2,000 → 8%, ≥1,000 → 10%, ≥500 → 15%, ≥200 → 25%, ≥75 → 35%, else 50%. View count is the sort key; thresholds are absolute per source size, not relative to other sources. Sources can override with `topPercentile` in `stations.json`.

### Rationale
TBD: no commit message records the exact bracket values. The intent is documented in `scripts/catalog-quality.mjs` ("keep top videos per source, stable when channels are added") — the tighter percentile for larger channels prevents big channels from crowding out small ones while keeping small channels well represented.

### Alternatives
- Hard per-source cap (e.g. max 200 videos): simpler but arbitrary; doesn't adapt to channel size.
- No cap: large channels crowd out small ones.

### Tradeoffs
- A top-8% cut of a 2,000-video channel keeps only the highest view-count videos — may miss recent/niche content.
- The step-function threshold means a source's cut can tighten by one bracket as it grows past a boundary (e.g. crossing 2,000 videos drops it from 10% to 8%).

---

<a id="adr-003"></a>
## ADR-003 — Static catalog committed to repo (`public/catalog.json`)

**Date:** 2026-04-04 (initial commit, present from day one)  
**Status:** Active

### Context
The app needs the full curated video set at runtime (currently 8,760 records; ~1.9MB). Options: runtime DB query, on-demand API calls, or a static file served from CDN.

### Decision
`public/catalog.json` (~2MB) is committed to the repo and served as a static CDN asset. No database or server-side catalog query.

### Rationale
- Zero API keys required — the entire "zero API keys" positioning depends on this.
- Cloudflare Pages CDN serves the file globally with low latency.
- Bi-weekly rebuild via GH Actions (1st & 15th) keeps it fresh without runtime infrastructure.
- Watched history and preferences live in `localStorage`; nothing requires a backend.

### Alternatives
- Runtime DB (Cloudflare D1, Turso, etc.): adds infra cost, query latency, and key management.
- YouTube Data API: rate-limited, requires an API key, and has quota costs.
- KV or R2: possible but adds complexity for a read-only dataset.

### Tradeoffs
- Catalog is stale between bi-weekly rebuilds (max ~14-day lag). Mitigated by `getCatalogFreshness()` surfacing stale state to the user.
- 2MB cold load on first visit; mitigated by `force-cache` fetch strategy and a separate `catalog-summary.json` for fast initial render.
- Adding a station requires a full catalog rebuild + commit + deploy.

---

<a id="adr-002"></a>
## ADR-002 — YouTube IFrame Player API instead of YouTube Data API

**Date:** 2026-04-04 (present from initial build)  
**Status:** Active

### Context
Playback needs to be embedded in the web app. Two routes: YouTube Data API (requires OAuth/API key, returns metadata + stream URLs) or the free IFrame embed API (no key, browser-based).

### Decision
YouTube IFrame Player API (`https://www.youtube.com/iframe_api`) loaded dynamically in `Player.tsx`. No YouTube API key anywhere in the codebase.

### Rationale
- Zero API key requirement is a core product constraint and a fork-ability feature.
- IFrame API supports all needed controls: autoplay, mute, skip, state events, error codes.
- Error codes 101/150 (embedding disabled) handled explicitly: auto-skip with no user-visible error (TV-channel feel preserved).

### Alternatives
- YouTube Data API: quota costs, key required, not forkable without a key.
- Direct `<iframe>` embed without the JS API: no `onError` / `onEnded` events; can't auto-skip.

### Tradeoffs
- Embedding depends on video owners allowing embeds; ~X% of videos silently fail with 101/150 (tracked via `recordEmbedAttempt`).
- Autoplay requires `muted: true` in some browser policies; `playsinline: 1` set for iOS.
- If YouTube blocks the `iframe_api` script (e.g. ad-blocker), a 12-second timeout fires and shows a graceful fallback UI.

---

<a id="adr-001"></a>
## ADR-001 — yt-dlp for catalog building instead of YouTube Data API

**Date:** 2026-04-04 (present from initial build)  
**Status:** Active

### Context
Building the video catalog requires fetching video IDs, titles, durations, view counts, and descriptions for every configured YouTube channel (currently 122 sources across 16 stations).

### Decision
`yt-dlp --flat-playlist --dump-json` fetches all metadata locally. No YouTube API key needed.

### Rationale
- Consistent with the zero-API-key constraint (ADR-002).
- `--flat-playlist` avoids downloading video content; only JSON metadata is fetched.
- yt-dlp is maintained, supports all YouTube channel URL formats (`@handle/videos`), and handles pagination automatically.
- Local cache (`data/sources/*.jsonl`) means subsequent runs are fast.

### Alternatives
- YouTube Data API v3 (playlistItems): 10,000 quota units/day; a full 122-source rebuild would likely exceed the free quota. (The later cache-first Data API path in ADR-002/ADR-001-successor work made this viable within quota — see [catalog-pipeline.md](catalog-pipeline.md).)
- `pytube` / `youtube-dl` (archived): less maintained, worse handle support.

### Tradeoffs
- yt-dlp scrapes YouTube's internal API; can break with YouTube changes.
- Rate-limited by YouTube: aggressive parallel fetching risks temporary blocks. Current script is sequential per channel.
- Region blocks: some channels return 0 videos in CI (Ubuntu/GitHub Actions IP). Handled by keeping the local cache when a fresh fetch returns fewer results.
- CI environment: yt-dlp installed via `pip install -q yt-dlp` at run time (not in Node dependencies).
