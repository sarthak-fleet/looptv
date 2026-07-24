---
title: Deployment
description: How LoopTV ships to Cloudflare Pages.
---

# Deployment

## Target

- **Host:** Cloudflare Pages, project `looptv`.
- **Domain:** `tv.significanthobbies.com` (canonical).
- **Preview URLs:** `pr-<N>.looptv.pages.dev` per pull request.
- **Build output:** `dist/` (Astro static build).

## Workflows

| Workflow | Trigger | What it does |
| --- | --- | --- |
| [`deploy.yml`](jobs/deploy.md) | `workflow_dispatch` (prod) + `pull_request` (preview) | Build + `wrangler pages deploy` + smoke prod / comment preview URL |
| [`ci.yml`](jobs/ci.md) | push/PR to `main`/`master` | `pnpm lint` + `pnpm test` |
| [`fetch-catalog-sources.yml`](jobs/fetch-catalog-sources.md) | cron `0 6 1,15 * *` + manual | 8-shard cache-first source fetch |
| [`build-catalog.yml`](jobs/build-catalog.md) | on `Fetch Catalog Sources` completion + manual | Process + audit + tag + commit catalog |
| [`weekly.yml`](jobs/weekly-quality.md) | cron `0 9 * * 1` + manual | lint + typecheck + test + build |
| `docs.yml` | push/PR touching docs, `AGENTS.md`, `STATUS.md`, `CLAUDE.md`, or `validate-docs.mjs` (+ manual) | `node scripts/validate-docs.mjs --strict` |

## Manual deploy

```bash
pnpm deploy    # = pnpm cf:build && wrangler pages deploy dist --project-name=looptv
```

Or step-by-step:

```bash
pnpm build
wrangler pages deploy dist --project-name=looptv
```

`wrangler.toml` sets `pages_build_output_dir = "dist"` and the project name.

## Secrets

Repository Actions secrets (synchronized from the Fleet Infisical project —
never committed):

- `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` — Pages deploy.
- `YOUTUBE_API_KEY` — only `Fetch Catalog Sources` receives this.
- `FAGW_API_KEY` — only `Build Catalog` receives this, and only when untagged
  videos exist.

To rotate without exposing values, pipe `infisical secrets get <NAME> --plain`
into `gh secret set <NAME>` from an Infisical-linked directory. See
[runbooks/rotate-secrets.md](runbooks/rotate-secrets.md).

**Build, deploy, and the static browser app never receive `YOUTUBE_API_KEY` or
`FAGW_API_KEY`.** This is enforced by workflow job boundaries, not just
documentation.

## Caching

Astro emits content-hashed client assets under `/_astro/`. Generated endpoints
set their own content types and caching headers where applicable.
`public/_headers` sets `/catalog.json` and `/catalog-summary.json` to
`public, max-age=0, must-revalidate` so an old successful browser cache entry
cannot outlive a newer deployment — this is the
[fresh-catalog-delivery](https://tv.significanthobbies.com) spec requirement.

## Smoke check

`deploy.yml` runs `curl --fail ... https://tv.significanthobbies.com` after a
production deploy. A non-200 fails the workflow.
