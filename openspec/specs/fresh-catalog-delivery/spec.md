# fresh-catalog-delivery Specification

## Purpose
TBD - created by archiving change snl-cap-and-fresh-catalog-load. Update Purpose after archive.
## Requirements
### Requirement: Catalog assets revalidate on normal load

The client SHALL revalidate catalog and catalog-summary assets on a normal load and MUST NOT treat an arbitrarily old successful browser cache entry as current.

#### Scenario: Browser has an obsolete successful response

- **WHEN** the browser loads the app with an older catalog asset in its cache
- **THEN** it revalidates the asset and renders the currently deployed catalog version

#### Scenario: Revalidation request fails repeatedly

- **WHEN** normal catalog requests fail through the retry sequence
- **THEN** the final retry bypasses caches with a versioned no-store request

### Requirement: Active long-lived tabs detect catalog deployments

The client SHALL revalidate the catalog summary when a long-lived tab becomes active and SHALL refresh the full catalog only when the deployed summary version differs from the loaded version.

#### Scenario: Tab becomes visible after a catalog deployment

- **WHEN** the summary `generatedAt` differs from the version loaded by the tab
- **THEN** the client fetches and renders the new full catalog

#### Scenario: Tab becomes visible without a catalog deployment

- **WHEN** the summary `generatedAt` matches the loaded version
- **THEN** the client does not download the full catalog again
