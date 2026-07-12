# catalog-playback-diversity Specification

## Purpose
TBD - created by archiving change harden-catalog-integrity. Update Purpose after archive.
## Requirements
### Requirement: Full-pool normal playback
Normal station playback SHALL sample uniformly from the complete caller-filtered curated pool after excluding the current video.

#### Scenario: Pool contains more than twelve videos
- **WHEN** a normal station has eligible videos outside its top twelve by views
- **THEN** those videos remain selectable by the normal random picker

### Requirement: Smart Mix ranking remains personalized
Smart Mix SHALL retain score-based ranking and its existing top-band selection.

#### Scenario: Smart Mix is active
- **WHEN** the active station is Smart Mix
- **THEN** preference scores, watched filters, and recent-history exclusions continue to determine its top band

