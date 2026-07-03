# Catalog generation auditability

Guards the bi-weekly catalog rebuild against silent regressions: a yt-dlp API
change, a broken fetch shard, or a quality-filter bug must not quietly gut
stations in an auto-committed `catalog.json`.

## Pieces

- **`catalog-manifest.json`** (repo root, checked in) — per-station baseline
  video counts + thresholds. Baselines equal the last shipped catalog: CI
  rebaselines it (`--update`) after every passing audit and commits it
  alongside `catalog.json`, so each audit compares against the previous run.
- **`scripts/validate-catalog-manifest.mjs`** — compares a freshly generated
  `public/catalog.json` against the manifest. Prints a per-station diff,
  appends a markdown table to the GitHub job summary, writes a compact diff
  for the commit message, and exits non-zero on violations.
- **Build Catalog workflow** (`.github/workflows/build-catalog.yml`) — runs the
  audit after processing + tagging and before the auto-commit. A failed audit
  fails the job; nothing is committed.

## Rules (violations = hard fail)

| Rule | Threshold (`catalog-manifest.json` → `thresholds`) |
| --- | --- |
| Station in manifest missing from catalog | always fails |
| Station empty (0 videos) | always fails |
| Station count drop | > max(30% of baseline, 5 videos) — `maxStationDropPct` / `minStationDropAbs` |
| Total catalog drop | > 20% of baseline total — `maxTotalDropPct` |

New stations and any growth are allowed (warning only for stations not yet in
the manifest). Edit thresholds directly in `catalog-manifest.json` if the
catalog's natural churn changes; the audit script preserves them on rebaseline.

## Intentional big changes (override)

When a large drop is legitimate (station removed from `stations.json`, channel
deleted upstream, quality thresholds tightened):

- **CI:** trigger *Build Catalog* via **workflow_dispatch** with the
  `override_audit` input checked. Violations are reported in the job summary
  but don't fail the job, and the manifest is rebaselined to the new counts.
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
```

Unit tests: `scripts/__tests__/validate-catalog-manifest.test.ts` (`pnpm test`).
