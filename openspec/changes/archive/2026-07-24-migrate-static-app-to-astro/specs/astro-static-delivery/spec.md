## ADDED Requirements

### Requirement: Astro static output
LoopTV SHALL build as an Astro static site and MUST NOT require a server runtime
for playback, catalog browsing, or personal state.

#### Scenario: Production build
- **WHEN** the production build runs
- **THEN** it emits a `dist/` directory suitable for Cloudflare Pages

### Requirement: Public route parity
The Astro site SHALL preserve the current landing, station, catalog, channels,
tags, stats, history, playlist, watch-later, blocked, random, about, privacy,
and terms URLs.

#### Scenario: Guest opens a station
- **WHEN** a guest opens a configured station permalink
- **THEN** the page contains station-specific metadata and hydrates the player for that station

#### Scenario: Guest opens a browser-state screen
- **WHEN** a guest opens history, playlist, watch-later, or blocked
- **THEN** the matching React surface hydrates against the existing localStorage state

### Requirement: Machine-readable route parity
The static build SHALL publish the existing sitemap, robots, manifest,
security, humans, station JSON, tag JSON, and OPML resources at their current
URLs.

#### Scenario: Client requests an export
- **WHEN** a client requests a current machine-readable URL
- **THEN** the generated artifact returns equivalent content at that URL

### Requirement: Catalog and playback compatibility
The Astro application SHALL continue reading the checked-in catalog assets and
MUST preserve player controls, embed-error skipping, search, preferences, and
watched-state behavior.

#### Scenario: Guest starts playback
- **WHEN** the player loads a station with an available catalog
- **THEN** it selects and plays catalog entries using the existing client logic

### Requirement: Static metadata
The build SHALL emit canonical, Open Graph, Twitter, structured-data, icon, and
route metadata without requiring runtime rendering.

#### Scenario: Crawler requests a public page
- **WHEN** a crawler fetches a generated public route
- **THEN** the returned HTML contains that route's static title and description
