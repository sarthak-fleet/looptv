## MODIFIED Requirements

### Requirement: Source refresh provenance

The catalog builder SHALL record whether every configured source was live, partial, fallback, empty, or missing and SHALL derive successful-fetch time from source-row provenance rather than artifact extraction time. Partial, fallback, empty, missing, and cache-only input MUST NOT advance that source timestamp.

#### Scenario: Tiny live response merged with fallback

- **WHEN** a source artifact contains live and fallback rows
- **THEN** the source is marked partial and retains its previous successful-fetch timestamp

#### Scenario: Configured source has no artifact

- **WHEN** no artifact exists for a configured source
- **THEN** the source is marked missing and remains visible in catalog metadata

#### Scenario: Successful Data API source refresh

- **WHEN** the Data API returns a complete source artifact with current video metadata
- **THEN** the source is live and its successful-fetch timestamp advances

#### Scenario: Recent cache bypasses external fetch

- **WHEN** a complete source cache is within the freshness window
- **THEN** no external request occurs and the existing successful-fetch time remains authoritative
