## Context

LoopTV has 122 configured sources, each with a stable YouTube channel ID. The checked-in catalog remains playable, but the raw metadata cache is incomplete because yt-dlp calls from shared runners are frequently blocked. YouTube Data API `playlistItems.list` and `videos.list` calls cost one quota unit per request and accept pages/batches of up to 50. The default project allocation is 10,000 units per day, but the pipeline should still minimize use.

## Goals / Non-Goals

**Goals:**

- Refresh source metadata reliably from GitHub Actions.
- Keep daily/request consumption bounded and observable.
- Reuse complete, recent cache files without any YouTube request.
- Prevent secrets from reaching artifacts, logs, the static app, or forked pull requests.
- Preserve yt-dlp as a zero-key local fallback.

**Non-Goals:**

- Run the Data API during ordinary CI, catalog processing, deploys, or page requests.
- Re-fetch every historical upload on every schedule.
- Expose either key at organization scope when only LoopTV needs it.
- Replace the client-side YouTube IFrame API.

## Decisions

### Repository-scoped secrets

Synchronize `YOUTUBE_API_KEY` and `FAGW_API_KEY` from Infisical into this repository's Actions secrets. Repository scope follows least privilege; organization scope would expose credentials to unrelated fleet repositories. Workflow expressions inject each key only into its consuming step.

### Cache-first source refresh

The fetcher retains the existing 13-day cache gate. A valid source JSONL newer than the gate produces no Data API request. The scheduled workflow runs on the 1st and 15th, so normally each source is refreshed once per scheduled run at most. Manual runs also respect cache unless explicitly invoked with `--fresh`.

### Bounded upload discovery and batched metadata

For stale or missing sources, derive the uploads playlist from the configured channel ID and retrieve at most a configurable recent window, default 250 IDs. Stop paging early when a page consists entirely of IDs already present in cache. Fetch current metadata in batches of 50 for discovered IDs plus retained cached IDs, then merge by video ID. A 20-request per-source hard stop contains bugs and unexpected pagination. This updates views and availability for the working set while discovering new uploads without scanning a channel's entire history.

Because the working set is intentionally bounded, apply the source percentile once during fetch against the prior candidate baseline from `catalog.sourceMeta`, persist that baseline on the rows, and mark the result as preselected. Catalog processing preserves this preselection instead of applying the percentage again to the smaller working set. Reading the committed metadata matters during migration because a fallback cache may contain only the 41 selected SNL rows while `sourceMeta` records the original 1,357 candidates. This prevents a 3% source from shrinking to 3% of its already-selected fallback.

Avoid `search.list`; upload playlist and video list requests are cheaper, deterministic, and sufficient.

### Failure containment

An API error, missing key, quota exhaustion, or incomplete response falls back to the existing yt-dlp path. A failed API attempt never replaces a valid cache. Secrets are never included in errors or request logs.

### AI only for incremental work

The build already counts pending catalog tags and invokes the free-AI gateway only when the count is nonzero. Preserve that gate and add a secret-presence smoke check so lack of tagging credentials is explicit without leaking the key.

## Risks / Trade-offs

- A 250-video recent window may not rediscover historically popular videos absent from cache. Existing curated cache rows are merged and re-enriched, preserving the working set.
- A manual forced refresh consumes quota. It remains opt-in and bounded, with request counts reported.
- Repository Actions secrets are a synchronized copy of Infisical. Rotation requires re-running the documented sync command until direct workload-identity integration is added.

## Verification

- Unit-test pagination stops, batch sizing, duration parsing, row mapping, cache bypass, and secret redaction.
- Run a one-source live smoke test with the Infisical key and confirm the output contains complete metadata.
- Run full tests, typecheck, formatting checks, catalog audit, and production build.
- Push, run CI, then manually run the source workflow and inspect quota/request summaries before allowing catalog build to publish.
