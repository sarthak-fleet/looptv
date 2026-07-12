## Why

The bounded incremental refresh keeps quota low, but it cannot prove that its recent working set contains a channel's true highest-quality videos. SNL exposes the failure clearly: 10,280 uploads and 8,912 eligible candidates were represented by a stale 1,357-candidate baseline and a 41-video recent-biased selection with only two true top-41 videos.

## What Changes

- Add a manual, throttled full-history rebaseline that scans every configured uploads playlist, applies embed/duration/view filters once, and stores the true capped top set.
- Make the full audit resumable and guarded by a global request ceiling so interruption or accidental reruns do not repay completed work.
- Change SNL's configured percentile from 3% to 30%; the existing 200-video cap remains the effective quality boundary.
- Produce a per-source quality and quota report covering all 122 configured channels.
- Keep the scheduled 1st/15th refresh incremental and cache-first.

## Capabilities

### New Capabilities

- `full-catalog-quality-rebaseline`: Manual full-history quality audit, quota budgeting, resumability, and bounded top-set persistence.

### Modified Capabilities

- `quota-aware-youtube-refresh`: Incremental refreshes must preserve a verified full-history top set and candidate baseline rather than treating recent discovery as a complete ranking population.
- `catalog-health-audit`: Source audits must distinguish verified full-history baselines from incremental-only baselines.

## Impact

- Affects catalog fetch/audit scripts, source metadata, SNL source policy, tests, and catalog operations documentation.
- Uses the existing YouTube Data API credential and no new dependency.
- Full rebaseline is manual only; scheduled request ceilings remain unchanged.
