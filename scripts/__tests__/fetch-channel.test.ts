import { describe, expect, it } from 'vitest';
import {
  cacheQualifies,
  cacheAgeDays,
  computeEnrichBudget,
  filterFlatByDuration,
  findSourceByHandle,
  isBotDetectionError,
  isEnrichmentComplete,
  selectApiWorkingSet,
  sourceRowsFromCatalog,
  ytDlpBaseArgs,
  ytDlpTimeoutMs,
} from '../fetch-channel.mjs';

describe('fetch-channel', () => {
  it('uses a complete recent cache without an external request', () => {
    expect(
      cacheQualifies({ fresh: false, cachedLines: 50, hasViewCounts: true, ageDays: 12 })
    ).toBe(true);
    expect(
      cacheQualifies({ fresh: false, cachedLines: 50, hasViewCounts: true, ageDays: 14 })
    ).toBe(false);
    expect(cacheQualifies({ fresh: true, cachedLines: 50, hasViewCounts: true, ageDays: 1 })).toBe(
      false
    );
    expect(
      cacheQualifies({
        fresh: false,
        cachedLines: 1,
        hasViewCounts: true,
        ageDays: 1,
        trustedApi: true,
      })
    ).toBe(true);
    expect(
      cacheQualifies({ fresh: false, cachedLines: 50, hasViewCounts: false, ageDays: 1 })
    ).toBe(false);
    expect(cacheQualifies({ fresh: false, cachedLines: 4, hasViewCounts: true, ageDays: 1 })).toBe(
      false
    );
  });

  it('selects a bounded API working set against the prior candidate baseline', () => {
    const rows = Array.from({ length: 100 }, (_, index) => ({
      id: `video-${index}`,
      view_count: 100_000 - index,
    }));
    const cachedRows = Array.from({ length: 41 }, (_, index) => ({
      id: `old-${index}`,
      view_count: 50_000 - index,
    }));
    const result = selectApiWorkingSet(rows, { topPercentile: 3 }, cachedRows, 1_357);

    expect(result.candidateCount).toBe(1_357);
    expect(result.rows).toHaveLength(41);
    expect(result.rows.every((row) => row._looptvPreselected)).toBe(true);
    expect(result.rows.every((row) => row._looptvCandidateCount === 1_357)).toBe(true);
  });

  it('uses row provenance instead of extraction mtime for cache age', () => {
    const now = Date.parse('2026-07-20T00:00:00Z');
    expect(
      cacheAgeDays(
        [{ _looptvFetchedAt: '2026-07-10T00:00:00Z' }],
        Date.parse('2026-07-20T00:00:00Z'),
        now
      )
    ).toBe(10);
  });

  it('reconstructs a verified source checkpoint from the committed catalog', () => {
    const source = {
      stationId: 'snl',
      name: 'Saturday Night Live',
      handle: '@SaturdayNightLive',
      minDuration: 60,
      maxDuration: 1800,
      topPercentile: 30,
    };
    const rows = sourceRowsFromCatalog(
      {
        sourceMeta: {
          SaturdayNightLive: {
            qualityBaseline: 'full-history',
            fullAuditAt: '2026-07-12T00:00:00Z',
            lastSuccessfulFetch: '2026-07-12T00:00:00Z',
            videoCount: 8_912,
            publicUploadCount: 10_280,
            qualityPolicy: '60:1800:30:10000:200',
          },
        },
        stations: {
          snl: {
            videos: [
              {
                id: 'top',
                title: 'Top sketch',
                duration: 300,
                source: 'Saturday Night Live',
                viewCount: 100_000_000,
              },
            ],
          },
        },
      },
      source
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: 'top',
      _looptvCandidateCount: 8_912,
      _looptvPublicUploadCount: 10_280,
      _looptvFullAuditAt: '2026-07-12T00:00:00Z',
      _looptvQualityPolicy: '60:1800:30:10000:200',
    });
    expect(sourceRowsFromCatalog({ sourceMeta: {} }, source)).toEqual([]);
  });

  it('deduplicates, rejects low-view rows, and caps an API working set at 200', () => {
    const rows = [
      ...Array.from({ length: 250 }, (_, index) => ({
        id: `video-${index}`,
        view_count: 1_000_000 - index,
      })),
      { id: 'video-0', view_count: 2_000_000 },
      { id: 'low-view', view_count: 9_999 },
    ];
    const result = selectApiWorkingSet(rows, { topPercentile: 100 });

    expect(result.rows).toHaveLength(200);
    expect(new Set(result.rows.map((row) => row.id))).toHaveLength(200);
    expect(result.rows[0].id).toBe('video-0');
    expect(result.rows.some((row) => row.id === 'low-view')).toBe(false);
  });

  it('uses qualifying live rows as the first-run candidate baseline', () => {
    const result = selectApiWorkingSet(
      Array.from({ length: 10 }, (_, index) => ({ id: String(index), view_count: 20_000 + index })),
      {}
    );
    expect(result.candidateCount).toBe(10);
    expect(result.pct).toBe(50);
    expect(result.rows).toHaveLength(5);
  });

  it('propagates a verified full-history baseline into incremental selections', () => {
    const policy = '60:1800:30:10000:200';
    const result = selectApiWorkingSet(
      Array.from({ length: 250 }, (_, index) => ({
        id: `recent-${index}`,
        view_count: 1_000_000 - index,
      })),
      { minDuration: 60, maxDuration: 1800, topPercentile: 30 },
      [
        {
          id: 'verified',
          view_count: 2_000_000,
          _looptvCandidateCount: 8_912,
          _looptvPublicUploadCount: 10_280,
          _looptvFullAuditAt: '2026-07-12T00:00:00Z',
          _looptvQualityPolicy: policy,
        },
      ]
    );
    expect(result.rows).toHaveLength(200);
    expect(result.rows.every((row) => row._looptvFullAuditAt === '2026-07-12T00:00:00Z')).toBe(
      true
    );
    expect(result.rows.every((row) => row._looptvPublicUploadCount === 10_280)).toBe(true);
  });

  it('filters flat entries by per-source duration', () => {
    const flat = [
      { id: 'a', duration: 30 },
      { id: 'b', duration: 300 },
      { id: 'c', duration: 5000 },
    ];
    expect(filterFlatByDuration(flat, 60, 1800).map((v) => v.id)).toEqual(['b']);
  });

  it('enriches all rows for small channels', () => {
    expect(computeEnrichBudget(80, {})).toBe(80);
  });

  it('caps enrich budget for mega channels', () => {
    const snl = findSourceByHandle('@SaturdayNightLive');
    const budget = computeEnrichBudget(9000, snl);
    expect(budget).toBeGreaterThanOrEqual(250);
    expect(budget).toBeLessThan(9000);
    expect(budget).toBeLessThanOrEqual(2_000);
  });

  it('honors a source-specific cap in incremental selection', () => {
    const rows = Array.from({ length: 1_200 }, (_, index) => ({
      id: `video-${index}`,
      view_count: 2_000_000 - index,
    }));
    const result = selectApiWorkingSet(rows, { topPercentile: 100, maxVideos: 1_000 });

    expect(result.rows).toHaveLength(1_000);
  });

  it('detects YouTube bot wall errors', () => {
    expect(isBotDetectionError("Sign in to confirm you're not a bot")).toBe(true);
    expect(isBotDetectionError('network timeout')).toBe(false);
  });

  it('rejects tiny enrichment responses as incomplete', () => {
    expect(isEnrichmentComplete(1, 98, 98)).toBe(false);
    expect(isEnrichmentComplete(60, 98, 98)).toBe(true);
    expect(isEnrichmentComplete(2, 1_000, 250)).toBe(false);
  });

  it('uses android/web player client for CI resilience', () => {
    expect(ytDlpBaseArgs()).toContain('youtube:player_client=android,web');
  });

  it('bounds yt-dlp only when a positive timeout is configured', () => {
    expect(ytDlpTimeoutMs({})).toBeUndefined();
    expect(ytDlpTimeoutMs({ YT_DLP_TIMEOUT_MS: '600000' })).toBe(600000);
    expect(ytDlpTimeoutMs({ YT_DLP_TIMEOUT_MS: 'invalid' })).toBeUndefined();
  });
});
