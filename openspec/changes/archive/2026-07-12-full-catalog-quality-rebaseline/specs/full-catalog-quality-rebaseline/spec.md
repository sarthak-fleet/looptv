## ADDED Requirements

### Requirement: Manual full-history quality rebaseline

The system SHALL provide a manual operation that scans every configured source's complete uploads playlist, fetches metadata in batches of at most 50 IDs, applies embedding, duration, and minimum-view filters once, ranks eligible videos by views, applies the configured percentile once, and enforces the 200-video source cap.

#### Scenario: Large SNL history

- **WHEN** SNL has more eligible videos than its configured percentage and cap require
- **THEN** the persisted source set contains the true highest-view 200 eligible videos

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
