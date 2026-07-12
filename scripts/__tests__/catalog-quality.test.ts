import { describe, expect, it } from 'vitest';
import {
  MAX_VIDEOS_PER_SOURCE,
  MIN_VIEW_COUNT,
  applySourceQualityFilter,
  calcPercentile,
  hasViewCountsInJsonl,
  qualifiesRawVideo,
  resolveTopPercentile,
  validateCatalog,
  validateCatalogVideo,
} from '../catalog-quality.mjs';

describe('catalog quality', () => {
  it('requires a global minimum view count', () => {
    expect(MIN_VIEW_COUNT).toBe(10_000);
    expect(MAX_VIDEOS_PER_SOURCE).toBe(200);
  });

  it('uses tighter percentiles for larger sources', () => {
    expect(calcPercentile(20)).toBe(50);
    expect(calcPercentile(100)).toBe(35);
    expect(calcPercentile(500)).toBe(15);
    expect(calcPercentile(2_000)).toBe(8);
    expect(calcPercentile(8_000)).toBe(5);
    expect(calcPercentile(12_000)).toBe(3);
  });

  it('does not shift when unrelated channels are added to the fleet', () => {
    const mediumChannel = calcPercentile(400);
    expect(mediumChannel).toBe(25);
    expect(calcPercentile(400)).toBe(mediumChannel);
  });

  it('honors explicit topPercentile overrides from stations.json', () => {
    expect(resolveTopPercentile({ topPercentile: 3 }, 12_000)).toBe(3);
    expect(resolveTopPercentile({}, 12_000)).toBe(3);
  });

  it('rejects raw videos without view counts', () => {
    expect(qualifiesRawVideo({ duration: 300 }, 60, 3600)).toBe(false);
    expect(qualifiesRawVideo({ duration: 300, view_count: 9_999 }, 60, 3600)).toBe(false);
    expect(qualifiesRawVideo({ duration: 300, view_count: 10_000 }, 60, 3600)).toBe(true);
  });

  it('does not trust catalog fallback rows as a fresh live cache', () => {
    const fakeFs = {
      readFileSync: () =>
        `${JSON.stringify({ view_count: 42_000, _looptvCatalogFallback: true })}\n`,
    };

    expect(hasViewCountsInJsonl('fallback.jsonl', fakeFs)).toBe(false);
  });

  it('caps each source after percentile filtering', () => {
    const sourceVideos = Array.from({ length: 5_000 }, (_, i) => ({
      id: `v${i}`,
      duration: 300,
      view_count: 10_000_000 - i,
    }));
    const { filtered } = applySourceQualityFilter(sourceVideos, {});
    expect(filtered.length).toBe(MAX_VIDEOS_PER_SOURCE);
    expect(filtered[0].view_count).toBeGreaterThan(filtered.at(-1)?.view_count ?? 0);
  });

  it('does not filter a checked-in catalog fallback a second time', () => {
    const sourceVideos = Array.from({ length: 200 }, (_, index) => ({
      id: `fallback-${index}`,
      view_count: 1_000_000 - index,
      _looptvCatalogFallback: true,
    }));

    const { filtered, pct } = applySourceQualityFilter(sourceVideos, {});

    expect(filtered).toHaveLength(200);
    expect(pct).toBeNull();
  });

  it('preserves fallback rows while admitting live rows', () => {
    const sourceVideos = [
      { id: 'fallback', view_count: 20_000, _looptvCatalogFallback: true },
      { id: 'live', view_count: 30_000 },
    ];

    const { filtered, pct } = applySourceQualityFilter(sourceVideos, {});

    expect(filtered.map((video) => video.id)).toEqual(['live', 'fallback']);
    expect(pct).toBeNull();
  });

  it('labels fallback preservation separately from percentile selection', () => {
    const sourceVideos = [{ id: 'fallback', view_count: 20_000, _looptvCatalogFallback: true }];

    expect(applySourceQualityFilter(sourceVideos, {})).toMatchObject({
      mode: 'preserved',
      pct: null,
    });
  });

  it('deduplicates, sorts, and caps API-preselected rows without another percentile', () => {
    const sourceVideos = [
      ...Array.from({ length: 205 }, (_, index) => ({
        id: `api-${index}`,
        view_count: 100_000 - index,
        _looptvPreselected: true,
      })),
      { id: 'api-0', view_count: 200_000, _looptvPreselected: true },
    ];
    const result = applySourceQualityFilter(sourceVideos, { topPercentile: 3 });

    expect(result.mode).toBe('preselected');
    expect(result.pct).toBeNull();
    expect(result.filtered).toHaveLength(200);
    expect(result.filtered[0].id).toBe('api-0');
  });

  it('refuses to ship catalog entries below the view threshold', () => {
    expect(() => validateCatalogVideo({ id: 'x', viewCount: 0 })).toThrow();
    expect(() =>
      validateCatalog({
        stations: {
          science: {
            videos: [{ id: 'ok', viewCount: 10_000 }],
            categoryVideoIds: {},
          },
        },
      })
    ).not.toThrow();
  });
});
