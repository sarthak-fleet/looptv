# Project Recommendation Context

Generated: 2026-06-06T21:14:19.576Z

This file is a CodeVetter Repo Unpacked-inspired audit written for Starboard recommendations. It is intentionally local, evidence-oriented, and safe to commit: it records product context, feature areas, stack inventory, and recommendation guidance without secrets or environment values.

## Project Identity

- Slug: `looptv`
- Registry description: TV-like app for YouTube curated channels.
- Product grouping: `public-ready`
- Source path: `looptv`

## Product Context

TV-like app for YouTube curated channels.

- Thirteen stations are defined in stations.json . - The committed catalog contains roughly 38K videos across 78 curated channels. - YouTube embed errors such as 101 and 150 auto-skip to keep playback moving. - /catalog.json offline fallback behavior and a visible fallback banner are implemented. - A weekly GitHub Action refreshes the catalog with yt-dlp and local/CI enrichment tooling. - Cloudflare Pages deployment is documented for looptv.pages.dev .

LoopTV TV-like app that plays random YouTube videos from curated channels, nonstop. Pick a station, hit play, and lean back. Zero API keys needed. Uses yt-dlp for catalog building and YouTube's free IFrame Player for playback. HuggingFace NER auto-tags videos with people, places, and topics. Fork it, edit stations.json with your own YouTube channels, and deploy. That's it. Deployment & External Services Concern Service --------- --------- Hosting Cloudflare Pages looptv , looptv.pages.dev — static Next.js export, deployed via wrangler pages deploy Database None — static public/catalog.json served at runtime; watched history in browser localStorage Analytics PostHog via local posthog-js wrapp

## Feature Map

- **AI agents**: Agents, tool use, workflows, orchestration, RAG, evals, and model integration. Keywords: ai, agent, agents, llm, rag, embedding, eval, model.
- **Cloudflare and deploy**: Workers, Pages, edge runtime, queues, storage, and deploy automation. Keywords: cloudflare, worker, workers, pages, edge, deploy, wrangler, queue.
- **Content and media**: Content production, video, reels, documents, markdown, and publishing workflows. Keywords: content, media, video, reel, markdown, document, publish, editor.
- **Testing and quality**: Unit tests, browser tests, evals, CI quality gates, and regression checks. Keywords: test, testing, quality, vitest, playwright, ci, eval, benchmark.
- **UI workflows**: Dashboards, tables, forms, component systems, charts, and user workflows. Keywords: ui, ux, dashboard, table, component, react, next, tailwind.
- **Database and storage**: SQL, document storage, migrations, cache, queues, vectors, and persistence. Keywords: database, db, sql, sqlite, postgres, turso, libsql, drizzle.
- **Analytics and intelligence**: Signal analysis, forecasting, monitoring, trends, metrics, and decision support. Keywords: analytics, intelligence, signal, forecast, monitoring, metric, trend, insight.

## Runtime Surfaces and Entrypoints

- `src/app/.well-known/security.txt/route.ts`
- `src/app/[channel]/page.tsx`
- `src/app/about/page.tsx`
- `src/app/blocked/page.tsx`
- `src/app/channels/page.tsx`
- `src/app/export.opml/route.ts`
- `src/app/history/page.tsx`
- `src/app/humans.txt/route.ts`
- `src/app/layout.tsx`
- `src/app/page.tsx`
- `src/app/playlist/page.tsx`
- `src/app/privacy/page.tsx`
- `src/app/random/page.tsx`
- `src/app/stations.json/route.ts`
- `src/app/stats/page.tsx`
- `src/app/tags.json/route.ts`
- `src/app/tags/page.tsx`
- `src/app/terms/page.tsx`
- `src/app/watchlater/page.tsx`

## Current Stack

- Languages: `Python`, `TypeScript`
- Frameworks/tools: `Cloudflare Workers`, `Next.js`, `Playwright`, `React`, `Tailwind CSS`, `Vitest`
- Config files:
- `next.config.ts`
- `playwright.config.ts`
- `vitest.config.ts`
- `wrangler.toml`

## OSS Already In Use

Direct dependencies:
- `@saas-maker/changelog-widget`
- `@saas-maker/feedback`
- `@saas-maker/testimonials`
- `next`
- `posthog-js`
- `react`
- `react-dom`
- `zod`

Development dependencies:
- `@playwright/test`
- `@saas-maker/eslint-config`
- `@saas-maker/prettier-config`
- `@saas-maker/test-config`
- `@saas-maker/tsconfig`
- `@tailwindcss/postcss`
- `@types/node`
- `@types/react`
- `@types/react-dom`
- `@types/youtube`
- `@vitejs/plugin-react`
- `eslint`
- `eslint-config-next`
- `tailwindcss`
- `typescript`
- `vitest`
- `wrangler`

Package scripts:
- `build`
- `build:catalog`
- `build:ner`
- `cf:build`
- `deploy`
- `dev`
- `fetch:all`
- `lint`
- `start`
- `test`
- `typecheck`

## Testing and Quality Signals

- `playwright.config.ts`
- `scripts/__tests__/catalog.test.ts`
- `src/lib/__tests__/catalog.test.ts`
- `src/lib/__tests__/station-builder.test.ts`
- `src/lib/__tests__/stations-schema.test.ts`
- `src/lib/__tests__/watched.test.ts`
- `src/lib/__tests__/yt-errors.test.ts`
- `tests/example.spec.ts`
- `tests/mobile.spec.ts`
- `vitest.config.ts`

## Recommendation Guidance

Good matches:
- Repos that strengthen ai agents without replacing already-installed libraries.
- Repos that strengthen cloudflare and deploy without replacing already-installed libraries.
- Repos that strengthen content and media without replacing already-installed libraries.
- Repos that strengthen testing and quality without replacing already-installed libraries.
- Repos that strengthen ui workflows without replacing already-installed libraries.
- Repos that strengthen database and storage without replacing already-installed libraries.
- Repos that strengthen analytics and intelligence without replacing already-installed libraries.
- Tools with concrete support for src, catalog, page.tsx, youtube, looptv, videos, yt-dlp, channels.
- Implementation repos, SDKs, CLIs, testing utilities, adapters, and focused libraries are higher value than generic awesome lists.

Avoid recommending:
- Do not recommend packages already listed under direct or development dependencies unless the task is migration research.
- Do not recommend broad framework replacements unless the project context explicitly calls for a rewrite.
- Downrank curated lists, archived repos, stale demos, and generic UI kits that do not map to the feature catalog.

## Evidence Read

Primary docs and handoff files:
- `AGENTS.md`
- `PROJECT_STATUS.md`
- `README.md`

Package manifests:
- `package.json`

Inventory notes:
- Files scanned: 199
- This pass uses deterministic repo inventory plus local documentation/source-path evidence. It does not claim a full manual line-by-line review of every source file.

## Confidence

Confidence: **high**

Why:
- PROJECT_STATUS.md present
- README.md present
- 19 entrypoint/runtime files identified
- package dependencies inventoried
- 10 test/quality files identified

Refresh command:

```bash
cd /Users/sarthak/Desktop/fleet/starboard
pnpm fleet:audit-recommendation-context
pnpm fleet:extract-projects
```
