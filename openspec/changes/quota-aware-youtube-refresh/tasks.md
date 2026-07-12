## 1. Secure credentials

- [x] 1.1 Synchronize the Infisical YouTube and free-AI credentials into repository-scoped GitHub Actions secrets without printing values.
- [x] 1.2 Inject each credential only into its consuming workflow step and document the rotation/sync boundary.

## 2. Quota-aware source fetch

- [x] 2.1 Add tests for cache-first behavior, bounded upload pagination, batching, ISO duration conversion, API row mapping, and safe errors.
- [x] 2.2 Implement a YouTube Data API client using configured channel IDs, upload playlists, bounded recent discovery, and 50-ID metadata batches.
- [x] 2.3 Integrate API-first fetching with cache merge and yt-dlp fallback without replacing a good cache on failure.
- [x] 2.4 Report per-shard API/cache/fallback modes and request counts in the Actions summary.

## 3. Incremental AI and operations

- [x] 3.1 Verify free-AI tagging remains gated to untagged videos and make missing credentials explicit.
- [x] 3.2 Update catalog operations documentation and project status with quota/cadence behavior.

## 4. Verification and shipment

- [x] 4.1 Run focused tests and a one-source live API smoke test.
- [x] 4.2 Run full tests, typecheck, formatting checks, catalog audits, and production build.
- [ ] 4.3 Validate and archive the OpenSpec change, commit, push, and verify CI.
- [ ] 4.4 Trigger one manual source refresh, inspect coverage/quota summaries, and allow the chained catalog build only if audits pass.
