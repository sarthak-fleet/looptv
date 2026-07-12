# looptv — PROJECT STATUS

Last updated: 2026-07-12

## Why/What

**Thesis:** TV-like web app for random YouTube playback from curated channels — lean-back and keyless at runtime. Maintainers edit `stations.json`; bi-weekly CI refreshes `catalog.json` through a cache-first YouTube Data API path with yt-dlp fallback and incremental AI tagging.

**In scope:** Static Next.js export on Cloudflare Pages, YouTube IFrame Player, client-side watch history, playback diagnostics, source health auto-quarantine, lean-back controls redesign.

**Out / parked:** User accounts, server-side catalog, playlists/likes/subscriptions as cloud features.

## Dependencies

### External

- **Hosting:** Cloudflare Pages `looptv.pages.dev`.
- **Playback:** YouTube IFrame Player API (free) — no YouTube Data API keys.
- **Catalog build:** cache-first YouTube Data API + yt-dlp fallback + `scripts/process-catalog.mjs` + free-AI incremental tagging.
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
| Catalog build | YouTube Data API + yt-dlp fallback + process-catalog + free-AI tagging |
| State | Browser `localStorage` only |

```bash
pnpm install
pnpm dev
pnpm build | pnpm cf:build
pnpm deploy                  # build + wrangler pages deploy out --project-name=looptv
pnpm test                    # vitest
pnpm lint | pnpm typecheck | pnpm check   # biome
bash scripts/fetch-sources.sh             # YOUTUBE_API_KEY preferred; yt-dlp fallback
bash scripts/build-catalog.sh --process-only
python3 scripts/extract-tags.py          # requires requirements-ner.txt
bash scripts/fetch-all-sources.sh
```

```
stations.json → fetch-sources.sh (cache → Data API → yt-dlp fallback)
             → process-catalog.mjs (merge, preserve NER tags)
             → extract-tags.py (HuggingFace NER: people, places, categories)
             → catalog.json (committed, served statically)
             → Next.js player (random pick, IFrame API, localStorage prefs)
```

**Stats (current):** 17 stations, 149 channels (~38K videos until next catalog rebuild); global 10K views minimum filter; per-source min/max duration in `stations.json`.

**CI:** `.github/workflows/fetch-catalog-sources.yml` (8 fetch shards, 1st/15th, cache-first) → `.github/workflows/build-catalog.yml` (merge, process, incremental tag, audit, commit); `.github/workflows/deploy.yml` on push to main.

## Timeline

- **2026-05-25:** React hydration error fix (fleet-smoke task done).
- **PRD cycle:** Playback diagnostics, source health auto-pruning, lean-back controls redesign — all shipped.
- **2026-07-12:** quota-aware YouTube Data API refresh path added; repository secrets synchronized from Infisical; yt-dlp retained as fallback.
- **Bi-weekly CI:** catalog rebuild may auto-commit on the 1st and 15th; maintainer review expected for station diffs.

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
- Diagnostics can be dismissed for the current condition and return when a new issue appears.
- Retry refreshes catalog without full page reload.

### Source health & auto-pruning

- Channel Health panel: fresh/stale/partial/fallback/missing/embed/quarantined/blocked counts; issue filters; re-enable quarantined sources.
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
- **Top-content policy:** global 10K-view minimum (requires full metadata); per-source duration filters; top-N% by views per channel plus 200-video cap (`scripts/catalog-quality.mjs`); catalog build refuses output below threshold. Normal playback samples the full curated pool; Smart Mix retains ranked top-band selection.
- **Quota-aware refresh (2026-07-12):** 13-day cache gate, 250-video discovery ceiling, known-ID pagination stop, 50-ID metadata batches, 20-request per-source hard stop, per-shard request reporting, and no YouTube calls from build/deploy. Free-AI is called only when untagged videos exist.
- **Catalog audit (2026-07-12, enhanced):** `catalog-manifest.json` baselines + `scripts/validate-catalog-manifest.mjs` hard-fail the Build Catalog workflow on suspicious swings (station disappearing/empty, per-station drop > max(30%, 5), total drop > 20%, per-station replacement churn > 50% — catches silent swaps without treating healthy growth as churn); both audits run before incremental AI tagging so a rejected catalog spends no tagging calls. Per-station count diff + per-video changelog (added/removed/title-changed, with removed titles) land in the job summary and commit message; `override_audit` dispatch input / `CATALOG_AUDIT_OVERRIDE=1` is reserved for intentional changes. Manifest stores both per-station counts and a per-video map (`{ videoId: { t, d } }`) so each audit diffs against the previous run's exact video set. See `docs/catalog-auditability.md`.
- **Catalog integrity (2026-07-12):** raw source caches are separated from checked-in fallback rows; tiny partial enrichments are rejected; catalog generation time is separate from last complete refresh; per-source provenance and 80% fresh-coverage gates prevent false-green refreshes; `scripts/audit-catalog-health.mjs` reports every configured channel grouped by station.

## Todo / Planned / Deferred / Blocked

### Planned

(none — catalog auditability + CI diff summary shipped 2026-07-03; see Quality & maintenance)

### Deferred

- User accounts, cloud playlists, likes, subscriptions.
- Server-side catalog or watch sync while static catalog stays reliable.
- Recommendation engine beyond Smart Mix local weights.

### Blocked

- Catalog freshness depends on weekly GitHub Action — stale catalog shows diagnostics banner but no push notification.
- The July 12 audit found only 1/122 fully fresh sources after rejecting partial/fallback contamination; the first bounded Data API refresh must pass catalog coverage and churn audits before freshness advances.
- Legacy local NER rebuilds require `requirements-ner.txt`; scheduled CI tagging uses the free-AI gateway.
- Blocked/quarantined state is per-browser — not portable across devices.
- Production: `looptv.pages.dev` via Cloudflare Pages static export.
