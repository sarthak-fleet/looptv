import { describe, expect, it } from 'vitest';

import stations from '../../../stations.json';
import { StationConfigSchema, StationsConfigSchema } from '../stations-schema';

describe('stations-schema', () => {
  it('validates the committed stations.json', () => {
    const result = StationsConfigSchema.safeParse(stations);
    if (!result.success) {
      // Surface every failing path so the operator can fix in one pass.
      const issues = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n');
      throw new Error(`stations.json failed schema:\n${issues}`);
    }
  });

  it('rejects a non-kebab-case station id', () => {
    const bad = StationConfigSchema.safeParse({
      id: 'Bad ID',
      name: 'x',
      description: 'y',
      sources: [{ name: 'n', handle: '@foo' }],
    });
    expect(bad.success).toBe(false);
  });

  it('rejects a handle missing the @ prefix', () => {
    const bad = StationConfigSchema.safeParse({
      id: 'good',
      name: 'x',
      description: 'y',
      sources: [{ name: 'n', handle: 'foo' }],
    });
    expect(bad.success).toBe(false);
  });

  it('rejects minDuration > maxDuration', () => {
    const bad = StationConfigSchema.safeParse({
      id: 'good',
      name: 'x',
      description: 'y',
      sources: [{ name: 'n', handle: '@foo', minDuration: 900, maxDuration: 60 }],
    });
    expect(bad.success).toBe(false);
  });

  it('rejects a non-positive source video cap', () => {
    const bad = StationConfigSchema.safeParse({
      id: 'good',
      name: 'x',
      description: 'y',
      sources: [{ name: 'n', handle: '@foo', maxVideos: 0 }],
    });
    expect(bad.success).toBe(false);
  });

  it('rejects duplicate station ids', () => {
    const dup = StationsConfigSchema.safeParse([
      { id: 'a', name: 'x', description: 'y', sources: [{ name: 'n', handle: '@foo' }] },
      { id: 'a', name: 'x2', description: 'y2', sources: [{ name: 'n2', handle: '@bar' }] },
    ]);
    expect(dup.success).toBe(false);
  });

  it('accepts a minimal valid station', () => {
    const ok = StationConfigSchema.safeParse({
      id: 'snl',
      name: 'Saturday Night Live',
      description: 'Sketches',
      sources: [
        {
          name: 'Saturday Night Live',
          handle: '@SaturdayNightLive',
          minDuration: 60,
          maxDuration: 1800,
        },
      ],
    });
    expect(ok.success).toBe(true);
  });

  it('keeps topPercentile overrides within a strict quality band', () => {
    for (const station of stations) {
      for (const source of station.sources) {
        if (source.topPercentile == null) continue;
        expect(source.topPercentile).toBeGreaterThan(0);
        expect(source.topPercentile).toBeLessThanOrEqual(50);
      }
    }
  });
});
