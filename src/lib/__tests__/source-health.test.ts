import { describe, it, expect } from 'vitest';
import {
  getEmbedBlockRate,
  isEmbedUnhealthy,
  resolveSourceHealthState,
  countSourcesByHealth,
} from '../source-health';
import type { EmbedHealthRecord } from '../watched';

describe('source-health', () => {
  const healthyRecord: EmbedHealthRecord = {
    blocked: 1,
    checked: 10,
    sampledAt: '2026-05-01T00:00:00.000Z',
  };

  const unhealthyRecord: EmbedHealthRecord = {
    blocked: 4,
    checked: 10,
    sampledAt: '2026-05-01T00:00:00.000Z',
  };

  it('returns null block rate until enough samples exist', () => {
    expect(getEmbedBlockRate({ blocked: 2, checked: 3, sampledAt: '' })).toBeNull();
  });

  it('flags unhealthy embed rates above the threshold', () => {
    expect(isEmbedUnhealthy(unhealthyRecord)).toBe(true);
    expect(isEmbedUnhealthy(healthyRecord)).toBe(false);
  });

  it('prioritizes blocked and quarantined over stale/unhealthy', () => {
    expect(
      resolveSourceHealthState({
        sourceName: 'Alpha',
        meta: {
          fetchedAt: '2026-04-01T00:00:00.000Z',
          lastSuccessfulFetch: '2026-04-01T00:00:00.000Z',
          videoCount: 10,
        },
        embedHealth: unhealthyRecord,
        blockedSources: new Set(['Alpha']),
        quarantinedSources: new Set(),
      })
    ).toBe('blocked');

    expect(
      resolveSourceHealthState({
        sourceName: 'Beta',
        meta: {
          fetchedAt: '2026-04-01T00:00:00.000Z',
          lastSuccessfulFetch: '2026-04-01T00:00:00.000Z',
          videoCount: 10,
        },
        embedHealth: unhealthyRecord,
        blockedSources: new Set(),
        quarantinedSources: new Set(['Beta']),
      })
    ).toBe('quarantined');
  });

  it('counts sources by resolved health state', () => {
    const recent = new Date(Date.now() - 86_400_000).toISOString(); // 1 day ago
    const counts = countSourcesByHealth(
      [
        { name: 'Fresh', handle: '@fresh' },
        { name: 'Quarantined', handle: '@bad' },
      ],
      {
        fresh: {
          fetchedAt: recent,
          lastSuccessfulFetch: recent,
          videoCount: 10,
        },
        bad: {
          fetchedAt: recent,
          lastSuccessfulFetch: recent,
          videoCount: 10,
        },
      },
      { Quarantined: unhealthyRecord },
      new Set(),
      new Set(['Quarantined'])
    );

    expect(counts.fresh).toBe(1);
    expect(counts.quarantined).toBe(1);
  });
});
