## Context

Catalog selection currently uses one exported constant (`200`) in normal processing, cache preservation, API working-set sizing, and full-audit checkpoint fingerprints. SNL now has a verified 8,912-video eligible population, so changing only the final slice would invalidate the consistency guarantees across those paths. On the client, the first two fetch attempts use `force-cache`; because staleness is not a fetch error, a 19-day-old response can succeed forever and never reach the existing cache-busting attempt.

## Goals / Non-Goals

**Goals:**

- Use one effective-cap resolver everywhere catalog policy is evaluated.
- Give SNL a 1,000-video cap without changing the default for other sources.
- Make a normal page load observe the current deployed catalog.
- Let a long-lived tab cheaply detect a catalog deployment when it regains focus.
- Preserve request budgets, throttling, checkpoints, and incremental AI tagging.

**Non-Goals:**

- Rebalance unrelated source percentiles or caps.
- Poll continuously in the background.
- Move the static catalog to a database or runtime API.

## Decisions

1. Add optional `maxVideos` to source configuration and resolve it through `resolveMaxVideos(source)`, defaulting to 200. This keeps the policy explicit and makes processing, preservation, API selection, reporting, and checkpoint keys agree. A handle-specific exception in code was rejected because it would hide policy outside `stations.json`.
2. Include the effective cap in checkpoint fingerprints. SNL's former 200-cap checkpoint will therefore be invalidated while other source checkpoints remain reusable.
3. Fetch catalog assets with `cache: 'no-cache'` and serve them with `max-age=0, must-revalidate`. Conditional browser/CDN revalidation avoids unconditional 1.7 MB downloads while preventing `force-cache` from accepting arbitrarily old data. `no-store` was rejected for every normal load because it discards useful validators.
4. On window focus or return to visible state, revalidate only the small catalog summary. Fetch the full catalog only if `generatedAt` differs from the current full/summary version. This fixes long-lived tabs without periodic polling or repeated full downloads.
5. Re-run the bounded full-history operation after the policy change. Existing global request ceiling and five-request/second throttle remain unchanged; only SNL should require external metadata requests.

## Risks / Trade-offs

- [A proxy ignores revalidation semantics] → The retry path retains a timestamped `no-store` request as a final escape hatch.
- [Focus and visibility events fire together] → Deduplicate update checks through the existing summary in-flight promise and a component-level guard.
- [1,000 SNL videos materially enlarge the static artifact] → Verify build size and retain the requested 1,000 ceiling rather than ingesting the entire eligible history.
- [Generated catalog change triggers manifest churn protections] → Audit exact SNL membership/count changes and use the existing intentional override only after verification.

## Migration Plan

1. Land configuration, selection, cache-delivery, and tests.
2. Run the full-history audit; verify only the invalidated SNL policy consumes requests and stays under limits.
3. Process/tag the catalog, validate manifest and health reports, then commit and push.
4. Deploy the exact green commit and verify production SNL count and freshness headers.
5. Roll back the commit and redeploy if runtime validation fails; prior catalog remains available in git.

## Open Questions

None.
