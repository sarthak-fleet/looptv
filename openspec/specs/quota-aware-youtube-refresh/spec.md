# quota-aware-youtube-refresh Specification

## Purpose
TBD - created by archiving change quota-aware-youtube-refresh. Update Purpose after archive.
## Requirements
### Requirement: Cache-first quota control

The source workflow SHALL make no YouTube Data API request for a complete source cache that is within the configured freshness window.

#### Scenario: Recent complete cache

- **WHEN** a source JSONL has sufficient rows, view counts, and an age no greater than 13 days
- **THEN** the fetcher returns cached mode with zero Data API requests

#### Scenario: Small API-verified source

- **WHEN** a source has fewer than five selected rows but every row carries successful Data API provenance
- **THEN** the cache is trusted within the freshness window instead of being fetched again on every manual run

#### Scenario: Scheduled refresh

- **WHEN** the source workflow runs on the 1st or 15th
- **THEN** only stale, incomplete, or missing sources invoke the Data API

### Requirement: Bounded incremental discovery

The Data API fetcher SHALL use upload playlists and batched video metadata without using search queries or unbounded history scans.

#### Scenario: Known uploads reached

- **WHEN** a playlist page contains only video IDs already present in the source cache
- **THEN** pagination stops before requesting older pages

#### Scenario: Missing cache

- **WHEN** no source cache exists
- **THEN** discovery retrieves no more than the configured recent-video limit, metadata requests contain no more than 50 IDs each, and the configured per-source request budget is enforced

### Requirement: Safe source preservation

The fetcher MUST NOT replace a valid source cache when the Data API fails, exhausts quota, or returns an incomplete response.

#### Scenario: API failure with cache

- **WHEN** a Data API request fails and a prior source file exists
- **THEN** the prior file is retained and the fetcher falls back without logging the credential

#### Scenario: Fallback produces no qualifying rows

- **WHEN** the Data API fails and yt-dlp returns no videos within the source duration policy
- **THEN** an existing valid source file is retained instead of being replaced by an empty file

### Requirement: Stable bounded quality selection

The fetcher SHALL apply source quality percentages exactly once against a persisted candidate baseline, the catalog builder SHALL NOT reapply a percentage to an API-preselected working set, and incremental refreshes SHALL retain a verified full-history top set while considering newly discovered uploads.

#### Scenario: Three-percent source refresh

- **WHEN** a source previously recorded 1,357 candidates and its API working set is bounded below that count
- **THEN** selection retains up to 41 highest-view qualifying videos rather than selecting 3% of the smaller working set

#### Scenario: Verified full-history source refresh

- **WHEN** a source has a full-history checkpoint and an incremental refresh discovers recent uploads
- **THEN** selection reranks the retained verified top set and recent qualifying uploads together without rescanning full history or reapplying the percentile

#### Scenario: Unverified legacy baseline

- **WHEN** a source has only a historical candidate count without a verified full-history top set
- **THEN** source health identifies that baseline as incremental-only rather than claiming a verified ranking

### Requirement: Least-privilege workflow credentials

The catalog workflows SHALL receive repository-scoped YouTube and free-AI credentials only in the steps that consume them.

#### Scenario: Static build and deployment

- **WHEN** ordinary CI or production deployment runs
- **THEN** neither catalog credential is injected

### Requirement: Incremental AI tagging

The build workflow SHALL invoke the free-AI gateway only when catalog videos remain untagged.

#### Scenario: Fully tagged catalog

- **WHEN** the pending tag count is zero
- **THEN** no AI tagging request is made

