import { describe, it, expect } from 'vitest';
import {
  formatDuration,
  getCatalogFreshness,
  getSourceFreshness,
  STALE_SOURCE_DAYS,
  pickRandom,
  getVideosForStation,
} from '../catalog';
import type { SourceMeta } from '../types';
import {
  applyPreference,
  createSmartMixProfile,
  parseSmartMixProfile,
  pickSmartMixVideo,
  scoreVideo,
  serializeSmartMixProfile,
} from '../smartmix';
import type { Video, Catalog } from '../types';

// ---------- formatDuration ----------

describe('formatDuration', () => {
  it('formats 120 seconds as 2:00', () => {
    expect(formatDuration(120)).toBe('2:00');
  });

  it('formats 3661 seconds as 1:01:01', () => {
    expect(formatDuration(3661)).toBe('1:01:01');
  });

  it('formats 0 seconds as 0:00', () => {
    expect(formatDuration(0)).toBe('0:00');
  });

  it('formats 59 seconds as 0:59', () => {
    expect(formatDuration(59)).toBe('0:59');
  });

  it('formats 3600 seconds as 1:00:00', () => {
    expect(formatDuration(3600)).toBe('1:00:00');
  });
});

describe('getCatalogFreshness', () => {
  const now = new Date('2026-05-24T12:00:00.000Z');

  it('reports loading when the catalog timestamp is not available yet', () => {
    expect(getCatalogFreshness(null, now)).toMatchObject({
      state: 'loading',
      label: 'Checking catalog freshness...',
      ageDays: null,
    });
  });

  it('reports fresh weekly catalog data', () => {
    expect(getCatalogFreshness('2026-05-20T12:00:00.000Z', now)).toMatchObject({
      state: 'fresh',
      label: 'Catalog updated 4 days ago',
      ageDays: 4,
    });
  });

  it('reports stale catalog data after the weekly grace period', () => {
    expect(getCatalogFreshness('2026-05-10T12:00:00.000Z', now)).toMatchObject({
      state: 'stale',
      label: 'Catalog updated 14 days ago',
      ageDays: 14,
    });
  });

  it('reports unknown for malformed catalog timestamps', () => {
    expect(getCatalogFreshness('not-a-date', now)).toMatchObject({
      state: 'unknown',
      label: 'Catalog freshness unknown',
      ageDays: null,
    });
  });

  it('reports incomplete refresh coverage before timestamp freshness', () => {
    expect(
      getCatalogFreshness('2026-05-20T12:00:00.000Z', now, {
        generatedAt: '2026-05-24T00:00:00.000Z',
        complete: false,
        requiredFreshCoverage: 0.8,
        freshCoverage: 0.1,
        totalSources: 10,
        liveSources: 1,
        freshSources: 1,
        staleSources: 9,
        partialSources: 0,
        fallbackSources: 9,
        emptySources: 0,
        missingSources: 0,
      })
    ).toMatchObject({
      state: 'incomplete',
      label: 'Latest refresh covered 10% of sources',
    });
  });
});

describe('Smart Mix', () => {
  it('scores videos from preferred sources and tags higher', () => {
    const profile = createSmartMixProfile({ sourceWeights: { Alpha: 2 }, tagWeights: { fun: 3 } });
    const preferred = scoreVideo(
      {
        id: 'a',
        title: 'A',
        duration: 300,
        date: '',
        tags: ['fun'],
        source: 'Alpha',
        viewCount: 100_000,
      },
      profile
    );
    const other = scoreVideo(
      {
        id: 'b',
        title: 'B',
        duration: 300,
        date: '',
        tags: ['serious'],
        source: 'Beta',
        viewCount: 100_000,
      },
      profile
    );
    expect(preferred.score).toBeGreaterThan(other.score);
    expect(preferred.reason).toContain('Alpha source match');
  });

  it('avoids disliked and recently played videos', () => {
    const catalog = makeCatalog();
    const profile = createSmartMixProfile({ dislikes: ['a', 'b'] });
    const pick = pickSmartMixVideo(catalog, profile, { recentIds: new Set(['c']) });
    expect(pick.video).toBeNull();
  });

  it('updates preference weights and round-trips exported profiles', () => {
    const video = { id: 'a', title: 'A', duration: 300, date: '', tags: ['fun'], source: 'Alpha' };
    const profile = applyPreference(createSmartMixProfile(), video, 'favorite');
    expect(profile.favorites).toContain('a');
    expect(profile.sourceWeights.Alpha).toBe(1);
    expect(parseSmartMixProfile(serializeSmartMixProfile(profile))).toEqual(profile);
  });
});

// ---------- pickRandom ----------

function makeVideo(id: string): Video {
  return { id, title: `Video ${id}`, duration: 60, date: '', tags: [] };
}

describe('pickRandom', () => {
  it('returns null for an empty array', () => {
    expect(pickRandom([])).toBeNull();
  });

  it('returns the only video when array has one element', () => {
    const video = makeVideo('v1');
    expect(pickRandom([video])).toBe(video);
  });

  it('excludes the specified video id', () => {
    const v1 = makeVideo('v1');
    const v2 = makeVideo('v2');
    const result = pickRandom([v1, v2], v1.id);
    expect(result).toBe(v2);
  });

  it('returns null when all videos are excluded', () => {
    const v1 = makeVideo('v1');
    expect(pickRandom([v1], v1.id)).toBeNull();
  });

  it('can select outside the highest-view band', () => {
    const filler = Array.from({ length: 13 }, (_, i) => ({
      ...makeVideo(`f${i}`),
      viewCount: 50_000 + i,
    }));
    const high = { ...makeVideo('high'), viewCount: 10_000_000 };
    const low = { ...makeVideo('low'), viewCount: 10_000 };
    const pool = [...filler, high, low];

    expect(pickRandom(pool, undefined, () => 0.99)?.id).toBe('low');
  });
});

// ---------- getVideosForStation ----------

function makeCatalog(): Catalog {
  const videos: Video[] = [
    { id: 'a', title: 'Alpha', duration: 100, date: '', tags: ['fun'] },
    { id: 'b', title: 'Beta', duration: 200, date: '', tags: ['serious'] },
    { id: 'c', title: 'Gamma', duration: 300, date: '', tags: ['fun'] },
  ];

  return {
    lastUpdated: '2026-01-01',
    stations: {
      testStation: {
        videos,
        categoryVideoIds: {
          fun: ['a', 'c'],
          serious: ['b'],
        },
      },
    },
  };
}

// ---------- getSourceFreshness ----------

describe('getSourceFreshness', () => {
  const now = new Date('2026-05-24T12:00:00.000Z');
  const fresh: SourceMeta = {
    fetchedAt: '2026-05-20T12:00:00.000Z',
    lastSuccessfulFetch: '2026-05-20T12:00:00.000Z',
    videoCount: 50,
  };
  const stale: SourceMeta = {
    fetchedAt: '2026-04-01T12:00:00.000Z',
    lastSuccessfulFetch: '2026-04-01T12:00:00.000Z',
    videoCount: 50,
  };
  const neverFetched: SourceMeta = {
    fetchedAt: '2026-05-20T12:00:00.000Z',
    lastSuccessfulFetch: '',
    videoCount: 0,
  };

  it('reports fresh when last successful fetch is within the stale threshold', () => {
    const result = getSourceFreshness(fresh, now);
    expect(result.state).toBe('fresh');
    expect(result.ageDays).toBe(4);
    expect(result.label).toContain('4 days ago');
  });

  it('reports stale when last successful fetch exceeds the threshold', () => {
    const result = getSourceFreshness(stale, now);
    expect(result.state).toBe('stale');
    expect(result.ageDays).toBeGreaterThan(STALE_SOURCE_DAYS);
  });

  it('falls back to fetchedAt when lastSuccessfulFetch is empty', () => {
    const result = getSourceFreshness(neverFetched, now);
    // fetchedAt is recent so should be fresh
    expect(result.state).toBe('fresh');
  });

  it('reports unknown when meta is null', () => {
    const result = getSourceFreshness(null, now);
    expect(result.state).toBe('unknown');
    expect(result.ageDays).toBeNull();
  });

  it('reports unknown when meta is undefined', () => {
    const result = getSourceFreshness(undefined, now);
    expect(result.state).toBe('unknown');
  });

  it('reports fetched today for a very recent timestamp', () => {
    const todayMeta: SourceMeta = {
      fetchedAt: now.toISOString(),
      lastSuccessfulFetch: now.toISOString(),
      videoCount: 10,
    };
    const result = getSourceFreshness(todayMeta, now);
    expect(result.state).toBe('fresh');
    expect(result.label).toContain('today');
  });
});

describe('getVideosForStation', () => {
  it('returns all videos when categoryId is "all"', () => {
    const catalog = makeCatalog();
    const result = getVideosForStation(catalog, 'testStation', 'all');
    expect(result).toHaveLength(3);
    expect(result.map((v) => v.id)).toEqual(['a', 'b', 'c']);
  });

  it('returns filtered videos for a specific category', () => {
    const catalog = makeCatalog();
    const result = getVideosForStation(catalog, 'testStation', 'fun');
    expect(result).toHaveLength(2);
    expect(result.map((v) => v.id)).toEqual(['a', 'c']);
  });

  it('returns single video for a single-entry category', () => {
    const catalog = makeCatalog();
    const result = getVideosForStation(catalog, 'testStation', 'serious');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('b');
  });

  it('returns empty array for an unknown station', () => {
    const catalog = makeCatalog();
    const result = getVideosForStation(catalog, 'nonexistent', 'all');
    expect(result).toEqual([]);
  });

  it('returns empty array for an unknown category', () => {
    const catalog = makeCatalog();
    const result = getVideosForStation(catalog, 'testStation', 'nope');
    expect(result).toEqual([]);
  });
});
