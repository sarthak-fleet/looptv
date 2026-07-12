# full-catalog-quality-rebaseline Specification

## Purpose
TBD - created by archiving change full-catalog-quality-rebaseline. Update Purpose after archive.
## Requirements
### Requirement: Manual full-history quality rebaseline

The system SHALL provide a manual operation that scans every configured source's complete uploads playlist, fetches metadata in batches of at most 50 IDs, applies embedding, duration, and minimum-view filters once, ranks eligible videos by views, applies the configured percentile once, and enforces the source's configured video cap or a 200-video default.

#### Scenario: Large SNL history

- **WHEN** SNL has more eligible videos than its configured percentage and 1,000-video cap require
- **THEN** the persisted source set contains the true highest-view 1,000 eligible videos

#### Scenario: Source without an override

- **WHEN** a source does not configure a video cap
- **THEN** the operation enforces the 200-video default

### Requirement: Globally bounded and throttled audit

The full-history operation MUST report an estimated request count, MUST refuse to exceed its configured global request budget, and MUST not exceed its configured request rate.

#### Scenario: Estimated scan exceeds budget

- **WHEN** the remaining configured sources require more requests than the global budget permits
- **THEN** the operation stops before making an over-budget request and preserves completed checkpoints

### Requirement: Resumable source checkpoints

The operation SHALL checkpoint each completed source and SHALL skip a valid completed checkpoint unless a fresh scan is explicitly requested.

#### Scenario: Interrupted audit resumes

- **WHEN** a prior run completed some sources before interruption
- **THEN** the next run makes zero requests for those completed sources and continues with the remaining sources

### Requirement: Per-source quality report

The operation SHALL report public uploads, eligible candidates, selected count, applied percentile, minimum selected view count, request count, and checkpoint status for every configured source grouped by station.

#### Scenario: Audit completes

- **WHEN** every configured source has a verified checkpoint
- **THEN** the report includes all configured sources and the aggregate quota usage

