import { describe, expect, it } from 'vitest';
import {
  DEFAULT_THRESHOLDS,
  buildManifest,
  compareToManifest,
  diffStationVideos,
  formatDiffLines,
  formatVideoDiffLines,
  stationCounts,
  stationVideos,
} from '../validate-catalog-manifest.mjs';

const manifest = (stations: Record<string, number>) => ({
  thresholds: DEFAULT_THRESHOLDS,
  totalVideos: Object.values(stations).reduce((s, n) => s + n, 0),
  stations,
});

const vids = (entries: Array<[string, string, number]>) =>
  Object.fromEntries(entries.map(([id, t, d]) => [id, { t, d }]));

type VideoMap = Record<string, { t: string; d: number }>;

describe('catalog manifest audit', () => {
  it('extracts per-station counts from a catalog', () => {
    const counts = stationCounts({
      stations: { snl: { videos: [{ id: 'a' }, { id: 'b' }] }, tech: { videos: [] } },
    });
    expect(counts).toEqual({ snl: 2, tech: 0 });
  });

  it('passes when counts match or grow', () => {
    const result = compareToManifest({ snl: 45, tech: 1200 }, manifest({ snl: 41, tech: 1144 }));
    expect(result.violations).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it('fails when a station disappears', () => {
    const result = compareToManifest({ tech: 1144 }, manifest({ snl: 41, tech: 1144 }));
    expect(result.violations.some((v: string) => v.includes('"snl" disappeared'))).toBe(true);
  });

  it('fails when a station empties out', () => {
    const result = compareToManifest({ snl: 0, tech: 1144 }, manifest({ snl: 41, tech: 1144 }));
    expect(result.violations.some((v: string) => v.includes('"snl" is empty'))).toBe(true);
  });

  it('fails when a station drops beyond the percentage threshold', () => {
    // 1144 * 30% = 343 allowed; a drop of 400 must fail
    const result = compareToManifest({ snl: 41, tech: 744 }, manifest({ snl: 41, tech: 1144 }));
    expect(result.violations.some((v: string) => v.includes('"tech" dropped 400'))).toBe(true);
  });

  it('tolerates drops within the threshold', () => {
    // 1144 * 30% = 343 allowed; a drop of 300 is fine (science stays stable so total holds)
    const result = compareToManifest(
      { science: 3000, tech: 844 },
      manifest({ science: 3000, tech: 1144 })
    );
    expect(result.violations).toEqual([]);
  });

  it('gives small stations absolute slack before the percentage rule bites', () => {
    // talks baseline 17: 30% = 5 rounded, floor is minStationDropAbs = 5 → 12 passes, 11 fails
    expect(
      compareToManifest({ talks: 12, tech: 1144 }, manifest({ talks: 17, tech: 1144 })).violations
    ).toEqual([]);
    expect(
      compareToManifest({ talks: 11, tech: 1144 }, manifest({ talks: 17, tech: 1144 })).violations
        .length
    ).toBeGreaterThan(0);
  });

  it('fails when the total catalog drops beyond the total threshold', () => {
    // Two stations each losing just under 30% can still gut >20% of the catalog
    const result = compareToManifest({ a: 710, b: 710 }, manifest({ a: 1000, b: 1000 }));
    expect(result.violations.some((v: string) => v.includes('total catalog dropped'))).toBe(true);
  });

  it('warns (not fails) on new stations missing from the manifest', () => {
    const result = compareToManifest({ snl: 41, film: 119 }, manifest({ snl: 41 }));
    expect(result.violations).toEqual([]);
    expect(result.warnings.some((w: string) => w.includes('"film"'))).toBe(true);
  });

  it('formats a compact diff of changed stations only', () => {
    const result = compareToManifest({ snl: 45, tech: 1144 }, manifest({ snl: 41, tech: 1144 }));
    const diff = formatDiffLines(result);
    expect(diff).toContain('snl: 41 → 45 (+4)');
    expect(diff).not.toContain('tech:');
  });

  it('rebuilds manifest baselines from current counts, sorted', () => {
    const built = buildManifest({ tech: 10, ai: 5 }, DEFAULT_THRESHOLDS);
    expect(built.totalVideos).toBe(15);
    expect(Object.keys(built.stations)).toEqual(['ai', 'tech']);
  });
});

describe('video manifest extraction', () => {
  it('extracts per-station video manifests with compact keys', () => {
    const out = stationVideos({
      stations: {
        ai: { videos: [{ id: 'a', title: 'Alpha', duration: 100 }] },
        tech: { videos: [{ id: 'b', title: 'Beta', duration: 200 }, { id: 'c' }] },
      },
    });
    expect(out.ai).toEqual({ a: { t: 'Alpha', d: 100 } });
    expect(out.tech.b).toEqual({ t: 'Beta', d: 200 });
    // missing title/duration default to '' / 0
    expect(out.tech.c).toEqual({ t: '', d: 0 });
  });

  it('handles empty stations gracefully', () => {
    expect(stationVideos({ stations: {} })).toEqual({});
    expect(stationVideos({ stations: { x: { videos: [] } } })).toEqual({ x: {} });
  });
});

describe('video diff (diffStationVideos)', () => {
  it('reports added and removed video IDs', () => {
    const diff = diffStationVideos(
      vids([
        ['a', 'Alpha', 100],
        ['b', 'Beta', 200],
      ]),
      vids([
        ['b', 'Beta', 200],
        ['c', 'Gamma', 300],
      ])
    );
    expect(diff.added).toEqual(['c']);
    expect(diff.removed).toEqual(['a']);
    expect(diff.titleChanged).toEqual([]);
  });

  it('reports title changes with from/to', () => {
    const diff = diffStationVideos(
      vids([['a', 'Old Title', 100]]),
      vids([['a', 'New Title', 100]])
    );
    expect(diff.added).toEqual([]);
    expect(diff.removed).toEqual([]);
    expect(diff.titleChanged).toEqual([{ id: 'a', from: 'Old Title', to: 'New Title' }]);
  });

  it('carries removed titles for the audit log', () => {
    const diff = diffStationVideos(
      vids([
        ['a', 'Gone', 100],
        ['b', 'Kept', 200],
      ]),
      vids([['b', 'Kept', 200]])
    );
    expect(diff.removedTitles).toEqual({ a: 'Gone' });
  });

  it('treats null/undefined inputs as empty', () => {
    const diff = diffStationVideos(undefined, vids([['a', 'A', 1]]));
    expect(diff.added).toEqual(['a']);
    expect(diff.removed).toEqual([]);
  });
});

describe('video churn audit (compareToManifest with videos)', () => {
  const manifestWithVideos = (
    stations: Record<string, number>,
    videos: Record<string, VideoMap>
  ) => ({
    thresholds: DEFAULT_THRESHOLDS,
    totalVideos: Object.values(stations).reduce((s, n) => s + n, 0),
    stations,
    videos,
  });

  it('does not churn-violate when only a few videos change', () => {
    // 100 videos, 10 swapped → 10% churn, well under 50% threshold
    const baseline = vids(Array.from({ length: 100 }, (_, i) => [`v${i}`, `T${i}`, 100]));
    const current: VideoMap = { ...baseline };
    delete current.v0;
    delete current.v1;
    current.new1 = { t: 'New', d: 100 };
    current.new2 = { t: 'New2', d: 100 };
    const result = compareToManifest(
      { ai: 100 },
      manifestWithVideos({ ai: 100 }, { ai: baseline }),
      { ai: current }
    );
    expect(result.violations).toEqual([]);
    expect(result.videoDiffs.ai.added).toEqual(['new1', 'new2']);
    expect(result.videoDiffs.ai.removed).toEqual(['v0', 'v1']);
  });

  it('churn-violates when >50% of videos silently swap with stable counts', () => {
    // 100 videos, 60 swapped (30 removed + 30 added) → counts stable at 100,
    // 60% churn > 50% threshold. This is the silent-swap case the count audit misses.
    const baseline = vids(Array.from({ length: 100 }, (_, i) => [`v${i}`, `T${i}`, 100]));
    const current: VideoMap = {};
    // keep 70, drop 30, add 30 new → count stays 100, churn = 60
    for (let i = 0; i < 70; i++) current[`v${i}`] = baseline[`v${i}`];
    for (let i = 0; i < 30; i++) current[`new${i}`] = { t: `New${i}`, d: 100 };
    const result = compareToManifest(
      { ai: 100 },
      manifestWithVideos({ ai: 100 }, { ai: baseline }),
      { ai: current }
    );
    expect(result.violations.some((v: string) => v.includes('"ai" churned 60'))).toBe(true);
  });

  it('does not treat healthy catalog growth as replacement churn', () => {
    const baseline = vids(Array.from({ length: 100 }, (_, i) => [`v${i}`, `T${i}`, 100]));
    const current: VideoMap = { ...baseline };
    delete current.v0;
    for (let i = 0; i < 60; i++) current[`new${i}`] = { t: `New${i}`, d: 100 };

    const result = compareToManifest(
      { ai: 159 },
      manifestWithVideos({ ai: 100 }, { ai: baseline }),
      { ai: current }
    );

    expect(result.violations).toEqual([]);
    expect(result.videoDiffs.ai.added).toHaveLength(60);
    expect(result.videoDiffs.ai.removed).toEqual(['v0']);
  });

  it('skips video diff when manifest has no videos field (backward compatible)', () => {
    const result = compareToManifest({ ai: 100 }, manifest({ ai: 100 }), {
      ai: { x: { t: 'X', d: 1 } },
    });
    expect(result.violations).toEqual([]);
    expect(result.videoDiffs).toEqual({});
  });
});

describe('video diff formatting', () => {
  it('formatVideoDiffLines collapses stations with no changes', () => {
    const result = compareToManifest(
      { ai: 2, tech: 2 },
      {
        thresholds: DEFAULT_THRESHOLDS,
        totalVideos: 4,
        stations: { ai: 2, tech: 2 },
        videos: {
          ai: vids([
            ['a', 'A', 1],
            ['b', 'B', 1],
          ]),
          tech: vids([
            ['c', 'C', 1],
            ['d', 'D', 1],
          ]),
        },
      },
      {
        ai: vids([
          ['a', 'A', 1],
          ['b', 'B', 1],
        ]),
        tech: vids([
          ['c', 'C', 1],
          ['d', 'D2', 1],
        ]),
      }
    );
    const lines = formatVideoDiffLines(result);
    expect(lines).toContain('tech:');
    expect(lines).not.toContain('ai:');
  });

  it('formatDiffLines includes the video changelog section', () => {
    const result = compareToManifest(
      { ai: 3 },
      {
        thresholds: DEFAULT_THRESHOLDS,
        totalVideos: 3,
        stations: { ai: 3 },
        videos: {
          ai: vids([
            ['a', 'A', 1],
            ['b', 'B', 1],
            ['c', 'C', 1],
          ]),
        },
      },
      {
        ai: vids([
          ['a', 'A', 1],
          ['b', 'B', 1],
          ['d', 'D', 1],
        ]),
      }
    );
    const diff = formatDiffLines(result);
    expect(diff).toContain('Video changes:');
    expect(diff).toContain('ai: +1 -1');
    expect(diff).toContain('removed c "C"');
  });

  it('buildManifest includes videos when provided', () => {
    const built = buildManifest({ ai: 1 }, DEFAULT_THRESHOLDS, { ai: vids([['x', 'X', 10]]) });
    expect(built.videos).toBeDefined();
    expect(built.videos.ai.x).toEqual({ t: 'X', d: 10 });
  });

  it('buildManifest omits videos when not provided (backward compatible)', () => {
    const built = buildManifest({ ai: 1 }, DEFAULT_THRESHOLDS);
    expect(built.videos).toBeUndefined();
  });
});
