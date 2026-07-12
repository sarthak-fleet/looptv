## MODIFIED Requirements

### Requirement: Fallback preservation
The builder MUST preserve previously curated fallback videos without reapplying a percentile to the reduced fallback population.

#### Scenario: Fallback-only source
- **WHEN** every qualifying artifact row is a catalog fallback
- **THEN** the builder deduplicates, sorts by views, applies the source's configured video cap or the 200-video default, and labels the operation as preservation
