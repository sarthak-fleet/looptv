## MODIFIED Requirements

### Requirement: Grouped source audit

The audit SHALL report every configured source under its station with provenance, timestamps, recorded candidates, selected videos, configured quality policy, and whether the ranking baseline was verified by a full-history scan or derived from incremental-only data.

#### Scenario: Source contributes no videos

- **WHEN** a configured source has zero selected catalog videos
- **THEN** the report includes it with a zero count and its observed provenance instead of omitting it

#### Scenario: Incremental-only ranking baseline

- **WHEN** a source has not completed a full-history quality scan
- **THEN** the report labels its quality baseline unverified instead of presenting its candidate count as complete
