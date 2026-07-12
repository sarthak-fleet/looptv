## 1. Quality Policy

- [x] 1.1 Add and test an effective per-source video-cap resolver with a 200-video default.
- [x] 1.2 Use the effective cap in processing, API working-set selection, full-audit checkpoints, reporting, and TypeScript declarations.
- [x] 1.3 Configure SNL for 1,000 videos and update operator documentation.

## 2. Fresh Catalog Delivery

- [x] 2.1 Revalidate normal catalog and summary requests while retaining a cache-busting final retry.
- [x] 2.2 Revalidate the summary when a tab becomes active and refresh the full catalog only on a version change.
- [x] 2.3 Update Pages cache headers and add client caching/update tests.

## 3. Rebuild and Verification

- [x] 3.1 Run the bounded full-history audit and verify only SNL is invalidated and selected at 1,000.
- [x] 3.2 Process and incrementally tag the catalog, then verify health, manifest changes, tests, lint, typecheck, and production build.
- [x] 3.3 Update project status, archive the specification, commit, push, deploy, and verify production SNL count and catalog freshness behavior.
