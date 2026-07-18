---
title: New Things to Learn
description: Open learning notes — some entries are TBD pending capture.
---

# New things to learn — looptv

Zero-API-key YouTube TV player: yt-dlp for catalog, IFrame API for playback, LLM gateway for tagging, static export on CF Pages.

See also: [external-references.md](../external-references.md) for authoritative one-liners + links.

---

## yt-dlp (metadata scraping)
- What: CLI tool that fetches YouTube playlist/channel metadata as JSON without an API key
- Why here: TBD
- Gotcha (from code): CI region blocks return fewer rows than a warm local cache — `build-catalog.sh` compares new fetch count vs. cached count and keeps the larger file (`scripts/build-catalog.sh:42-52`)
- Source: https://github.com/yt-dlp/yt-dlp (verified)

---

## YouTube IFrame Player API
- What: Browser JS API for embedding and controlling YouTube playback with no server key
- Why here: TBD
- Gotcha (from code): Errors 101/150 (embed disabled by owner) are runtime-only — unpredictable from catalog; `Player.tsx` catches them via `onError` and auto-skips (`src/components/Player.tsx`)
- Source: https://developers.google.com/youtube/iframe_api_reference (verified)

---

## BERT NER (`dslim/bert-base-NER`)
- What: HuggingFace transformer model for named-entity recognition (PER/LOC/ORG/MISC), fine-tuned on CoNLL-2003
- Why here: TBD
- Gotcha (from code): NER category UI removed in commit 8203c0b ("too noisy — v2 will use zero-shot topic classification instead"); `extract-tags.py` is kept as an offline fallback but CI runs `tag-videos.mjs` instead (`.github/workflows/build-catalog.yml`); `torch` and `transformers` survive in `requirements-ner.txt` for local fallback use only, never installed in CI (only `fetch-catalog-sources.yml` installs `yt-dlp`; no CI job installs `torch`)
- Source: https://huggingface.co/dslim/bert-base-NER (verified)

---

## LLM tagging via free-AI gateway
- What: Fan-out script that sends video metadata to 7 free-tier LLM providers with 2 concurrent workers each (14 parallel workers) for topic tag generation
- Why here: TBD
- Gotcha (from code): LLM responses often wrap the JSON array in prose — regex extraction `content.match(/\[[\s\S]*\]/)` required (`scripts/tag-videos.mjs:72`); array length mismatch vs. batch size triggers retry; batches retry across all models up to `MAX_BATCH_ATTEMPTS = MODELS.length * 2`
- Source: See [external-references.md](../external-references.md)

---

## Static catalog committed to repo
- What: ~2MB `public/catalog.json` (plus `public/catalog-summary.json`) served as CDN assets; no runtime DB
- Why here: TBD
- Gotcha (from code): `process-catalog.mjs` applies a global 10K-view minimum filter and preserves existing tags on re-runs; `extract-tags.py` strips `description` fields after tagging to keep the file size down
- Source: See [external-references.md](../external-references.md)

---

## Cloudflare Pages static export (two deploy migrations)
- What: Next.js `output: 'export'` deployed via `wrangler pages deploy out`
- Why here: TBD
- Gotcha (from code): Workers (OpenNext) → Pages migration in commit `f57d656`; the Workers path added `open-next.config.ts` and OpenNext bindings — `10 files changed, 136 insertions(+), 3026 deletions(-)` — all removed for zero benefit on a 100% client-side app
- Source: https://developers.cloudflare.com/pages/framework-guides/nextjs/deploy-a-static-nextjs-site/ (verified)

---

## `next build --webpack` (Turbopack opt-out)
- What: Explicit flag to use Webpack instead of Next.js 16's default Turbopack bundler; affects both dev and production builds
- Why here: TBD
- Gotcha (from code): `package.json:7` sets `"build": "next build --webpack"`; Next.js 16 docs confirm Turbopack is the default and `--webpack` is the supported opt-out; AGENTS.md warns "Turbopack has breaking changes vs webpack" (no webpack plugins, CSS module ordering differences)
- Source: https://nextjs.org/docs/app/api-reference/turbopack (verified — `--webpack` flag documented under "Using Webpack instead")
