# looptv — PROJECT STATUS

Last updated: 2026-07-03

## Why/What

**Thesis:** TV-like web app for random YouTube playback from curated channels — lean-back, zero API keys. Maintainers edit `stations.json`; bi-weekly CI refreshes `catalog.json` with yt-dlp + AI gateway tagging.

**In scope:** Static Next.js export on Cloudflare Pages, YouTube IFrame Player, client-side watch history, playback diagnostics, source health auto-quarantine, lean-back controls redesign.

**Out / parked:** User accounts, server-side catalog, YouTube Data API (hard constraint: zero API keys), playlists/likes/subscriptions as cloud features.

## Dependencies

### External

- **Hosting:** Cloudflare Pages `looptv.pages.dev`.
- **Playback:** YouTube IFrame Player API (free) — no YouTube Data API keys.
- **Catalog build:** yt-dlp + `scripts/process-catalog.mjs` + `scripts/extract-tags.py` (dslim/bert-base-NER).
- **Analytics:** PostHog via local wrapper (optional; no PII beyond analytics config).
- **State:** Browser `localStorage` only — no DB, no auth.

### Internal fleet

- **@saas-maker/feedback:** in-app feedback widget integration.

### Stack & commands

| Concern | Technology |
| --- | --- |
| Frontend | Next.js 16 static export + Tailwind v4 |
| Hosting | Cloudflare Pages `looptv.pages.dev` |
| Catalog | `public/catalog.json` (static); config `stations.json` |
| Playback | YouTube IFrame Player API (free) |
| Catalog build | yt-dlp + process-catalog + extract-tags (HuggingFace NER) |
| State | Browser `localStorage` only |

```bash
pnpm install
pnpm dev
pnpm build | pnpm cf:build
pnpm deploy                  # build + wrangler pages deploy out --project-name=looptv
pnpm test                    # vitest
pnpm lint | pnpm typecheck | pnpm check   # biome
bash scripts/build-catalog.sh            # requires yt-dlp
python3 scripts/extract-tags.py          # requires requirements-ner.txt
bash scripts/fetch-all-sources.sh
```

```
stations.json → build-catalog.sh (yt-dlp metadata)
             → process-catalog.mjs (merge, preserve NER tags)
             → extract-tags.py (HuggingFace NER: people, places, categories)
             → catalog.json (committed, served statically)
             → Next.js player (random pick, IFrame API, localStorage prefs)
```

**Stats (current):** 17 stations, 149 channels (~38K videos until next catalog rebuild); global 10K views minimum filter; per-source min/max duration in `stations.json`.

**CI:** `.github/workflows/fetch-catalog-sources.yml` (4 parallel fetch shards, bi-weekly) → `.github/workflows/build-catalog.yml` (merge, process, tag, commit); `.github/workflows/deploy.yml` on push to main.

## Timeline

- **2026-05-25:** React hydration error fix (fleet-smoke task done).
- **PRD cycle:** Playback diagnostics, source health auto-pruning, lean-back controls redesign — all shipped.
- **Weekly CI:** catalog rebuild may auto-commit on the 1st and 15th; maintainer review expected for station diffs.

## Products

| Product | Surface | Role |
| --- | --- | --- |
| LoopTV player | Station grid + random picker | Lean-back YouTube playback from curated catalog |
| Catalog pipeline | `stations.json` → `catalog.json` | Maintainer-edited stations + automated metadata/NER refresh |
| Client stats | `localStorage` keys | Per-browser watch history, Smart Mix, quarantine state |

## Features (shipped)

### Core player

- Station grid landing; random video picker per station.
- YouTube IFrame API embed; auto-skip on embed errors 101/150 (geo/copyright/owner disable).
- Keyboard shortcuts: Space play/pause, N/P or arrows next/prev, M mute, F fullscreen, W hide-watched, `/` search, 1–9 station jump, Esc close search.
- Smart Mix preference weights in localStorage.

### Catalog & offline

- `/catalog.json` fetch with retry + backoff; offline fallback banner on landing with Retry (no full reload).
- Sample channels visible from bundled `stations.json` when catalog unavailable.
- Dev hint for build-catalog when fetch fails in development.

### Playback diagnostics

- Compact banner when degraded: catalog age, source age, skip streaks, embed issue counts.
- Retry refreshes catalog without full page reload.

### Source health & auto-pruning

- Channel Health panel: fresh/stale/unhealthy/quarantined/blocked counts; issue filters; re-enable quarantined sources.
- Auto-quarantine on sustained embed failures; decisions persist in localStorage.

### Lean-back controls redesign

- Primary control rail: play/pause, next/previous, search, watch later, station switch.
- Secondary actions in More drawer; mobile-safe tap targets; keyboard shortcuts preserved.

### Client-side stats (`watched.ts`)

- `looptv_watched` — ≥50% viewed IDs.
- `looptv_stats` — per-station/source counts, total seconds.
- `looptv_blocked_sources`, `looptv_watch_later`, `looptv_smart_mix_profile`, `looptv_prefs`.
- Clearing site data wipes all; nothing leaves browser.

### Quality & maintenance

- Fork-friendly: edit `stations.json` and deploy.
- **Top-content policy:** global 10K-view minimum (requires full yt-dlp metadata — no `--flat-playlist`); per-source duration filters; top-N% by views per channel plus 200-video cap (`scripts/catalog-quality.mjs`); catalog build refuses output below threshold; playback picks from top-12 view band (same as Smart Mix).
- **Catalog audit (2026-07-03):** `catalog-manifest.json` baselines + `scripts/validate-catalog-manifest.mjs` hard-fail the Build Catalog workflow on suspicious swings (station disappearing/empty, per-station drop > max(30%, 5), total drop > 20%); per-station +/- diff lands in job summary and commit message; `override_audit` dispatch input / `CATALOG_AUDIT_OVERRIDE=1` for intentional changes. See `docs/catalog-auditability.md`.

## Todo / Planned / Deferred / Blocked

### Planned

(none — catalog auditability + CI diff summary shipped 2026-07-03; see Quality & maintenance)

### Deferred

- User accounts, cloud playlists, likes, subscriptions.
- YouTube Data API — zero API keys remains a hard constraint.
- Server-side catalog or watch sync while static catalog stays reliable.
- Recommendation engine beyond Smart Mix local weights.

### Blocked

- Catalog freshness depends on weekly GitHub Action — stale catalog shows diagnostics banner but no push notification.
- NER tagging requires Python + HuggingFace in CI; local rebuild needs `requirements-ner.txt`.
- Blocked/quarantined state is per-browser — not portable across devices.
- Production: `looptv.pages.dev` via Cloudflare Pages static export.
