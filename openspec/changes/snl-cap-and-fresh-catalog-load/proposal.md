## Why

The global 200-video source cap is too restrictive for SNL, which occupies its own station and has thousands of eligible uploads. Separately, the client accepts a successfully returned browser-cached catalog indefinitely, allowing a deployed catalog with 200 SNL videos to still render an obsolete 41-video catalog.

## What Changes

- Allow a source to override the default 200-video quality cap.
- Configure Saturday Night Live with a 1,000-video cap and rebuild its verified full-history selection.
- Require catalog and catalog-summary requests to revalidate rather than accepting an arbitrarily old successful browser cache.
- Check for a newly deployed catalog when a long-lived tab becomes active, downloading the full catalog only when the summary version changes.
- Keep all external catalog-building work bounded by the existing request budget and rate limit.

## Capabilities

### New Capabilities

- `fresh-catalog-delivery`: Browser catalog loading and long-lived-tab update behavior.

### Modified Capabilities

- `full-catalog-quality-rebaseline`: Quality caps become configurable per source while retaining the 200-video default.
- `catalog-refresh-integrity`: Fallback preservation uses the effective per-source cap.

## Impact

This affects `stations.json`, shared catalog-quality selection, fetch/rebaseline policy fingerprints, catalog client caching, Cloudflare Pages cache headers, catalog tests, generated catalog artifacts, and catalog audit documentation. No new dependency or runtime API is introduced.
