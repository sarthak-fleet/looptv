import { describe, expect, it } from 'vitest';
import {
  DEFAULT_THRESHOLDS,
  buildManifest,
  compareToManifest,
  formatDiffLines,
  stationCounts,
} from '../validate-catalog-manifest.mjs';

const manifest = (stations: Record<string, number>) => ({
  thresholds: DEFAULT_THRESHOLDS,
  totalVideos: Object.values(stations).reduce((s, n) => s + n, 0),
  stations,
});

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
