## Why

GitHub-hosted runners cannot reliably enrich channel metadata through yt-dlp because YouTube throttles or bot-challenges datacenter traffic. A valid YouTube Data API key already exists in Infisical, but neither the source workflow nor GitHub Actions can use it. The existing free-AI key is available to the build workflow, but its source of truth is not documented or synchronized.

## What Changes

- Add a YouTube Data API source fetcher that uses configured channel IDs, upload playlists, and batched video metadata requests.
- Keep refreshes quota-aware: honor complete source caches for 13 days, request only a bounded recent upload window, merge live metadata with cached rows, and never run source discovery during build or deploy.
- Retain yt-dlp as an automatic fallback when the API key is absent or the API request fails.
- Store `YOUTUBE_API_KEY` and `FAGW_API_KEY` as repository-scoped GitHub Actions secrets sourced from Infisical.
- Continue AI tagging only for videos that do not already have tags.
- Report fetch mode and estimated API request count in the workflow summary without exposing credentials.

## Capabilities

### New Capabilities

- `quota-aware-youtube-refresh`: Cached, bounded YouTube Data API catalog discovery with secure CI credentials and yt-dlp fallback.

### Modified Capabilities

- `catalog-refresh-integrity`: A successful Data API refresh counts as live source provenance while cache hits do not falsely advance freshness.

## Impact

- Catalog fetching scripts and focused tests.
- Fetch Catalog Sources workflow secret injection and quota reporting.
- Build Catalog workflow continues using the free-AI key only for pending tags.
- Repository GitHub Actions secret configuration; no browser/runtime secrets and no production bundle changes.

