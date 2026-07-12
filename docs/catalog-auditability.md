# Catalog generation auditability

Guards the bi-weekly catalog rebuild against silent regressions: an upstream
metadata change, a broken fetch shard, or a quality-filter bug must not quietly gut
stations in an auto-committed `catalog.json`.

## Pieces

- **`catalog-manifest.json`** (repo root, checked in) — two layers of baselines:
  - **Count layer** (`stations`): per-station video counts + thresholds.
  - **Video layer** (`videos`): per-station map of `{ videoId: { t: title, d: duration } }`.
    Enables a per-video diff (added / removed / title-changed) and a churn check
    that catches silent swaps where counts stay stable but the actual video set
    changes en masse.
  Baselines equal the last shipped catalog: CI rebaselines both layers
  (`--update`) after every passing audit and commits the manifest alongside
  `catalog.json`, so each audit compares against the previous run.
- **`scripts/validate-catalog-manifest.mjs`** — compares a freshly generated
  `public/catalog.json` against the manifest. Prints a per-station count diff
  plus a concise video-level changelog, appends a markdown table (counts +
  video changes + removed titles) to the GitHub job summary, writes the compact
  diff for the commit message, and exits non-zero on violations.
- **`scripts/audit-catalog-health.mjs`** — joins `stations.json` and
  `public/catalog.json` into a station/source report. It verifies source
  membership, duration bounds, the 10K-view floor, unique video IDs,
  per-source selected counts, and fresh-source coverage.
- **Build Catalog workflow** (`.github/workflows/build-catalog.yml`) — runs the
  source-health audit before the manifest rebaseline and auto-commit. A failed audit
  fails the job; nothing is committed. The commit message body includes the
  per-station count diff and the video-level changelog.

## Rules (violations = hard fail)

| Rule | Threshold (`catalog-manifest.json` → `thresholds`) |
| --- | --- |
| Station in manifest missing from catalog | always fails |
| Station empty (0 videos) | always fails |
| Station count drop | > max(30% of baseline, 5 videos) — `maxStationDropPct` / `minStationDropAbs` |
| Total catalog drop | > 20% of baseline total — `maxTotalDropPct` |
| Station replacement churn (`2 × min(added, removed)` IDs) | > 50% of baseline — `maxVideoChurnPct` |
| Fresh configured-source coverage | < 80% — `MIN_FRESH_SOURCE_COVERAGE` |
| Video outside its configured source duration | always fails |
| Video below 10,000 views or assigned to the wrong station/source | always fails |
| Duplicate video ID across stations | always fails |

The churn rule is the key guard against silent gutting: if metadata fetch breakage
returns a different video set at the same cardinality (counts stable, videos
swapped), the per-video diff catches it even though the count audit passes.
Pure catalog growth is not replacement churn; station and total drop rules
separately guard destructive losses.

Both source-health and manifest audits run before the free-AI tagging step. A
rejected catalog therefore makes no tagging requests, and a passing rebuild tags
only videos that still lack tags.

New stations and any growth are allowed (warning only for stations not yet in
the manifest). Edit thresholds directly in `catalog-manifest.json` if the
catalog's natural churn changes; the audit script preserves them on rebaseline.

## Intentional big changes (override)

When a large drop or churn is legitimate (station removed from `stations.json`,
channel deleted upstream, quality thresholds tightened):

- **CI:** trigger *Build Catalog* via **workflow_dispatch** with the
  `override_audit` input checked. Violations are reported in the job summary
  but don't fail the job, and the manifest is rebaselined to the new catalog.
- **Local:**

  ```bash
  CATALOG_AUDIT_OVERRIDE=1 node scripts/validate-catalog-manifest.mjs --update
  ```

  Then commit `catalog-manifest.json` (and `public/catalog.json`) together, and
  say why in the commit message.

Never override without eyeballing the per-station diff first — the override
exists for reviewed, intentional swings, not for making red CI green.

## Local usage

```bash
node scripts/validate-catalog-manifest.mjs            # audit only
node scripts/validate-catalog-manifest.mjs --update   # audit, then rebaseline
node scripts/audit-catalog-health.mjs                  # grouped source audit + coverage gate
node scripts/audit-catalog-health.mjs \
  --markdown-file /tmp/catalog-health.md \
  --json-file /tmp/catalog-health.json
```

The source-health audit exits non-zero when coverage or catalog invariants fail.
`CATALOG_AUDIT_OVERRIDE=1` reports violations without failing for a reviewed,
intentional rebaseline.

Unit tests: `scripts/__tests__/validate-catalog-manifest.test.ts` and
`scripts/__tests__/audit-catalog-health.test.ts` (`pnpm test`).

## External request and secret controls

- `Fetch Catalog Sources` is the only workflow that receives `YOUTUBE_API_KEY`; it runs on the 1st and 15th or by manual dispatch.
- A complete source cache no older than 13 days makes zero YouTube requests.
- Stale or missing sources scan at most 250 recent uploads, stop paging after reaching a fully known page, batch metadata requests in groups of 50, and hard-stop at 20 requests per source.
- `Build Catalog` receives `FAGW_API_KEY`, but calls the gateway only when the pending-tag count is nonzero.
- CI, deploy, and the static browser application receive neither catalog credential.
- Both credentials are repository-scoped Actions secrets synchronized from the Fleet Infisical project. To rotate them without exposing values, pipe `infisical secrets get YOUTUBE_API_KEY --plain` into `gh secret set YOUTUBE_API_KEY`, and pipe `Free_ai` into `gh secret set FAGW_API_KEY` from an Infisical-linked directory.
- Per-shard workflow summaries report Data API request totals and fetch modes. They never report keys.
