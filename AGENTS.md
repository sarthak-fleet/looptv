## Shared Fleet Standard

Also read and follow the shared fleet-level agent standard at `../AGENTS.md`. Treat this repository as owned product code: protect production stability, keep changes scoped, verify work, and record durable follow-up tasks when something remains incomplete or blocked.

<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes -- APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# agents.md — LoopTV

## Purpose
TV-like random YouTube player with 13 stations, 78 channels, and ~38K videos — zero API keys needed for playback or catalog building.

## Stack
- Framework: Next.js 16 (App Router, Turbopack)
- Language: TypeScript (frontend), Python (NER tagging), Bash (catalog pipeline)
- Styling: Tailwind CSS v4
- DB: None — static `public/catalog.json` served at runtime; watched history in localStorage
- Auth: None
- Testing: Vitest (unit)
- Deploy: Cloudflare Pages (static export, `output: 'export'`) — `looptv.pages.dev`. The legacy Worker at `looptv.sarthakagrawal927.workers.dev` is orphaned (no longer in the deploy path); remove with `wrangler delete --name looptv` once the Pages deploy is verified.
- Package manager: pnpm

## Repo structure
```
stations.json               # Station definitions + YouTube channel handles (primary config)
channels.config.ts          # Re-exports stations.json as typed TS
public/catalog.json         # Generated video catalog (~38K entries) — committed to repo
data/sources/               # Raw JSONL from yt-dlp (gitignored)
scripts/
  build-catalog.sh          # Full pipeline: fetch + process + NER tag
  fetch-all-sources.sh      # yt-dlp fetch → data/sources/*.jsonl
  process-catalog.mjs       # Merge JSONL into catalog.json, preserve existing NER tags
  tag-videos.mjs            # Additional tagging step
  extract-tags.py           # HuggingFace NER (dslim/bert-base-NER) tagging
  __tests__/catalog.test.ts # Vitest tests for catalog processing
requirements-ner.txt        # Python deps (transformers, torch)
src/
  app/
    page.tsx          # Entry (renders TVApp)
    layout.tsx        # Root layout (dark theme)
    [channel]/        # Dynamic per-station pages
  components/
    TVApp.tsx         # Main client-side orchestrator (station selection, playback state)
    Player.tsx        # YouTube IFrame API wrapper — auto-skips on errors 101/150
    Search.tsx        # Search overlay
  lib/
    types.ts          # Station, Video, Catalog interfaces
    catalog.ts        # Catalog loading, filtering, random selection, search
    watched.ts        # localStorage watched tracking + stats
    __tests__/        # Vitest unit tests
.github/workflows/
  update-catalog.yml  # Weekly cron: fetch new videos + NER tag + commit catalog
```

## Key commands
```bash
pnpm dev              # Next.js dev server
pnpm build            # Production build
pnpm test             # vitest run
pnpm lint             # eslint

# Catalog pipeline (requires yt-dlp: brew install yt-dlp)
pnpm run build:catalog    # Full rebuild: fetch + process + NER tag
pnpm run fetch:all        # Fetch raw JSONL for all sources
pnpm run build:ner        # Run NER tagging only

# Python NER setup
pip install -r requirements-ner.txt
python3 scripts/extract-tags.py
```

## Architecture notes
- **100% client-side playback.** `TVApp.tsx` and `Player.tsx` are `"use client"`. Server renders only the shell; `catalog.json` fetched client-side via `fetch('/catalog.json')`.
- **Static catalog committed to repo.** Weekly GH Actions cron rebuilds it — only new/untagged videos go through NER to keep CI fast.
- **Catalog pipeline**: `stations.json` → yt-dlp → JSONL → `process-catalog.mjs` (merge + dedup, preserves NER tags) → `extract-tags.py` (NER on untagged only) → `public/catalog.json`.
- **Embed error handling**: YouTube errors 101/150 (embedding blocked) caught by `Player.tsx` → auto-skip.
- **Quality filters**: per-source `minDuration`/`maxDuration` in `stations.json`; global 10K views minimum in `process-catalog.mjs`.
- **Adding a station**: add entry to `stations.json`, run `pnpm run build:catalog`, commit updated `catalog.json`.
- **Turbopack** used — has breaking changes vs webpack; check Next.js docs for Turbopack-specific behavior.
- No env vars required.

<!-- FLEET-GUIDANCE:START -->

## Fleet Guidance

### Adding Tasks
- Add durable work items in SaaS Maker Cockpit Tasks when the task affects product behavior, deployment, user feedback, or fleet maintenance.
- Include the project slug, a concise title, acceptance criteria, priority/status, and links to relevant code, issues, traces, or dashboards.
- If task discovery starts locally in an editor or agent session, mirror the durable next step back into SaaS Maker before handoff.

### Using SaaS Maker
- Treat SaaS Maker as the system of record for project metadata, feedback, tasks, analytics, testimonials, changelog, and fleet visibility.
- Prefer API-first workflows through `fnd api`, the SDK, or widgets instead of one-off scripts when interacting with SaaS Maker features.
- Keep this agent file aligned with the project record when operating rules, integrations, or deployment conventions change.

### Free AI First
- Prefer free/local AI paths for routine development and analysis: the `free-ai` gateway, local models, provider free tiers, and cached context.
- Escalate to paid models only when complexity, correctness risk, or missing capability justifies the cost.
- Note any paid-AI use in the task or handoff when it materially affects cost, reproducibility, or future maintenance.

<!-- FLEET-GUIDANCE:END -->

## Active context


<claude-mem-context>
# Memory Context

# [looptv] recent context, 2026-04-28 7:50pm GMT+5:30

Legend: 🎯session 🔴bugfix 🟣feature 🔄refactor ✅change 🔵discovery ⚖️decision 🚨security_alert 🔐security_note
Format: ID TIME TYPE TITLE
Fetch details: get_observations([IDs]) | Search: mem-search skill

Stats: 21 obs (6,897t read) | 202,155t work | 97% savings

### Apr 28, 2026
305 7:33p 🔵 looptv — current deployment stack: Next.js + OpenNext + Cloudflare Workers
306 " 🔵 looptv — partially migrated: CI uses Pages, local deploy script uses Workers
307 " ⚖️ looptv — Pages migration plan: wrangler.toml surgery + remove Workers-only bindings
308 7:34p 🔄 looptv — migrated from Cloudflare Workers (OpenNext) to Cloudflare Pages (static export)
309 " 🔵 looptv — lint broken, build succeeds for Pages migration
310 7:35p 🔵 looptv — two competing eslint configs; saas-maker/next subconfig missing @eslint/eslintrc dep
311 " 🔵 looptv — static export `out/` fully populated with 17 channel pages
312 " 🔴 looptv — ESLint fixed: replaced saas-maker config, added .open-next ignore
313 " 🔵 looptv — eslint-plugin-react@7.37.5 fundamentally incompatible with ESLint 10 flat config
314 7:36p 🔴 looptv — ESLint crash workaround: disable react/display-name to skip broken plugin rule
315 " 🔴 looptv — all eslint-plugin-react rules disabled to fix ESLint 10 flat config incompatibility
316 " ✅ looptv — lint passes; full Pages migration diff confirmed (10 files, -3026 lines)
317 " ✅ looptv — eslint.config.js deleted; single eslint.config.mjs is canonical config
318 " ✅ looptv — Pages migration verified and ready to commit
319 7:37p ✅ looptv — all checks green before commit: 23 tests pass, build succeeds, lint clean
320 7:39p 🔵 looptv — already migrated to Cloudflare Pages, uncommitted changes pending
321 " 🔵 looptv exists as both Worker script AND Pages project in Cloudflare account
322 7:41p 🔵 looptv Worker script bindings confirmed minimal — clean Pages migration
323 " 🔵 Starboard Worker uses Workers AI binding for embeddings with free-ai-gateway fallback
324 7:42p 🔵 Cloudflare PayGo billing API returns auth error 10000 — alpha endpoint restricted
325 7:50p ⚖️ looptv — delete old Cloudflare Worker, link Pages project to GitHub

Access 202k tokens of past work via get_observations([IDs]) or mem-search skill.
</claude-mem-context>
