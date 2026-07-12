## MODIFIED Requirements

### Requirement: Manual full-history quality rebaseline

The system SHALL provide a manual operation that scans every configured source's complete uploads playlist, fetches metadata in batches of at most 50 IDs, applies embedding, duration, and minimum-view filters once, ranks eligible videos by views, applies the configured percentile once, and enforces the source's configured video cap or a 200-video default.

#### Scenario: Large SNL history

- **WHEN** SNL has more eligible videos than its configured percentage and 1,000-video cap require
- **THEN** the persisted source set contains the true highest-view 1,000 eligible videos

#### Scenario: Source without an override

- **WHEN** a source does not configure a video cap
- **THEN** the operation enforces the 200-video default
