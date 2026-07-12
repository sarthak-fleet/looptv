# catalog-refresh-integrity Specification

## Purpose
TBD - created by archiving change harden-catalog-integrity. Update Purpose after archive.
## Requirements
### Requirement: Source refresh provenance
The catalog builder SHALL record whether every configured source was live, partial, fallback, empty, or missing without advancing its successful-fetch timestamp for partial, fallback, empty, or missing input.

#### Scenario: Tiny live response merged with fallback
- **WHEN** a source artifact contains live and fallback rows
- **THEN** the source is marked partial and retains its previous successful-fetch timestamp

#### Scenario: Configured source has no artifact
- **WHEN** no artifact exists for a configured source
- **THEN** the source is marked missing and remains visible in catalog metadata

### Requirement: Truthful catalog freshness
The catalog SHALL separate build generation time from the last refresh that met configured source coverage.

#### Scenario: Incomplete refresh
- **WHEN** fewer than 80% of configured sources are live-only or a represented source is missing
- **THEN** `generatedAt` advances, `lastUpdated` does not advance, and coverage is recorded as incomplete

#### Scenario: Complete refresh
- **WHEN** at least 80% of configured sources are live-only and no represented source is missing
- **THEN** both `generatedAt` and `lastUpdated` advance and coverage is recorded as complete

### Requirement: Fallback preservation
The builder MUST preserve previously curated fallback videos without reapplying a percentile to the reduced fallback population.

#### Scenario: Fallback-only source
- **WHEN** every qualifying artifact row is a catalog fallback
- **THEN** the builder deduplicates, sorts by views, applies the per-source cap, and labels the operation as preservation

