# catalog-health-audit Specification

## Purpose
TBD - created by archiving change harden-catalog-integrity. Update Purpose after archive.
## Requirements
### Requirement: Grouped source audit
The audit SHALL report every configured source under its station with provenance, timestamps, recorded candidates, selected videos, and configured quality policy.

#### Scenario: Source contributes no videos
- **WHEN** a configured source has zero selected catalog videos
- **THEN** the report includes it with a zero count and its observed provenance instead of omitting it

### Requirement: Coverage shipping gate
CI MUST fail an incomplete source refresh unless the intentional audit override is set.

#### Scenario: Scheduled fetch is mostly fallback
- **WHEN** live-only source coverage is below 80%
- **THEN** the build publishes the audit summary and refuses to commit a freshly timestamped catalog

### Requirement: Catalog consistency
The audit MUST verify station totals, per-source totals, configured duration bounds, the minimum view count, video ID uniqueness, and source-to-station membership.

#### Scenario: Video violates its source policy
- **WHEN** a catalog video is outside its source duration range or below 10,000 views
- **THEN** the audit fails with the station, source, and video ID

