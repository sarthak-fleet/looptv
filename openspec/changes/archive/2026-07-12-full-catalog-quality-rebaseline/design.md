## Context

Scheduled refreshes inspect at most 250 recent uploads and refresh the retained top set. This is cheap, but a stale candidate count cannot substitute for ranking the full history. A one-time SNL scan proved that the current recent-biased set has poor overlap with the true view-ranked top set.

## Goals / Non-Goals

**Goals:**

- Produce a verified eligible-candidate count and true view-ranked top set for all 122 sources.
- Stay below a configurable global request ceiling and a conservative requests-per-second limit.
- Resume after interruption without rescanning completed sources.
- Let normal incremental refreshes merge recent uploads into the verified top set.

**Non-Goals:**

- Run full-history scans on the normal schedule.
- Store every eligible video in the committed catalog.
- Remove duration, view, embedding, or per-source cap quality rules.

## Decisions

1. Add a manual Node rebaseline script using upload playlists and 50-ID `videos.list` batches. This reuses the same API shape as incremental refresh without weakening its hard limits.
2. Throttle requests to five per second and refuse to exceed a global request budget. A preflight `channels.list` estimate is reported before scanning.
3. Checkpoint each completed source as a compact JSONL containing only its selected top set, true candidate count, full-audit timestamp, upload count, and provenance. Existing valid checkpoints are skipped unless `--fresh` is passed.
4. Keep selection view-ranked after existing embed, duration, and 10K-view filters. Percentile policy is applied exactly once, followed by the 200-video cap.
5. Set SNL to 30%. With 8,912 eligible videos, both 3% and 30% exceed the cap, so the effective output is the true top 200 while the configuration expresses the intended tolerance.

## Risks / Trade-offs

- API quota exhaustion → preflight estimate, global ceiling, five-RPS throttle, and per-source checkpoints.
- Mid-run interruption → completed source JSONL files remain valid and are skipped on resume.
- View rankings drift → scheduled refresh continues refreshing retained IDs and recent uploads; operators can manually rebaseline later.
- Large catalog churn → existing catalog manifest and source-health audits remain shipping gates.

## Migration Plan

1. Implement and test the manual rebaseline path.
2. Run it once for all configured sources and inspect the generated quota/quality summary.
3. Rebuild, tag only new videos, and pass source-health and manifest audits.
4. Commit and deploy only the audited catalog. Rollback is the prior catalog commit.

## Open Questions

None. The user selected 30% for SNL and retained top quality as the primary constraint.
