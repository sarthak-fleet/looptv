# STATUS — LoopTV

Last updated: 2026-07-24

> Short, living view of the current objective, active work, blockers,
> unresolved questions, and next steps. Detailed feature inventory and
> timeline live in [docs/product/features.md](docs/product/features.md).
> Historical status snapshots live in [docs/archive/](docs/archive/).

## Current objective

Keep LoopTV a stable, lean-back, zero-API-key YouTube TV player. The product
surface is feature-complete for its current scope; active work is maintenance,
catalog freshness, and documentation hygiene.

## Active work

- **Static-shell consolidation:** the local source now builds with Astro and
  React islands instead of Next.js. All existing public pages, station
  permalinks, catalog assets, and machine-readable routes are preserved.
  The current production deployment remains unchanged until an explicitly
  approved Pages preview and domain cutover.
- **Bi-weekly catalog refresh:** runs on the 1st & 15th via
  `Fetch Catalog Sources` → `Build Catalog`. No manual intervention expected
  unless an audit fails (see
  [docs/operations/runbooks/catalog-audit-override.md](docs/operations/runbooks/catalog-audit-override.md)).
- **Owned-domain metadata:** `tv.significanthobbies.com` canonical target
  reverified 2026-07-17; sitemap, robots, JSON-LD, and IndexNow in place.

## Blockers

- **Catalog freshness depends on the bi-weekly GitHub Action.** Clients
  revalidate deployed assets, but there is no push notification for upstream
  refresh failures.
- **Legacy local NER rebuilds require `requirements-ner.txt`** (`torch` ~1GB).
  Scheduled CI tagging uses the free-AI gateway instead. See
  [docs/knowledge/failed-approaches/bert-ner-noise.md](docs/knowledge/failed-approaches/bert-ner-noise.md).
- **Blocked/quarantined state is per-browser** (localStorage), not portable
  across devices.

## Unresolved questions

- **ADR-004 rationale (step-function percentile brackets).** The exact bracket
  values are flagged TBD — the filter's intent is in `scripts/catalog-quality.mjs`
  but no commit records why each threshold is set where it is.
- **OpenSpec spec "Purpose" fields** are all `TBD - created by archiving
  change ...`. They should be filled in or the specs pruned if no longer
  authoritative.

## Next steps

- Consider wiring the README video count to `catalog-summary.json` at build
  time so it can't drift again (it is currently a hand-maintained figure).
- Fill the TBD ADR rationales where recoverable, or mark them permanently
  unrecoverable.
- Run an approved Cloudflare Pages preview, verify the owned-domain routes,
  then cut production from the existing Next export to the Astro `dist/`.
- Consider whether the OpenSpec specs still add value now that ADRs and
  operations docs cover the same ground; if not, archive the specs.

## Deferred (parked, not blocked)

- User accounts, cloud playlists, likes, subscriptions.
- Server-side catalog or watch sync while the static catalog stays reliable.
- Recommendation engine beyond Smart Mix local weights.

See [docs/product/overview.md#out-of-scope-parked](docs/product/overview.md#out-of-scope-parked)
for the full parked list.
