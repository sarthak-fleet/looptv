import { describe, expect, it } from 'vitest';
import { auditCatalogHealth } from '../audit-catalog-health.mjs';

const stations = [
  {
    id: 'science',
    name: 'Science',
    sources: [
      { name: 'Fresh Source', handle: '@fresh', minDuration: 60, maxDuration: 600 },
      { name: 'Missing Source', handle: '@missing', minDuration: 60, maxDuration: 600 },
    ],
  },
];

describe('catalog health audit', () => {
  it('reports configured zero-result sources and incomplete fresh coverage', () => {
    const result = auditCatalogHealth({
      stations,
      now: new Date('2026-07-12T00:00:00.000Z'),
      catalog: {
        lastUpdated: '2026-07-11T00:00:00.000Z',
        sourceMeta: {
          fresh: {
            fetchedAt: '2026-07-11T00:00:00.000Z',
            lastSuccessfulFetch: '2026-07-11T00:00:00.000Z',
            videoCount: 1,
            refreshState: 'live',
          },
        },
        stations: {
          science: {
            videos: [
              {
                id: 'ok',
                title: 'OK',
                duration: 300,
                source: 'Fresh Source',
                tags: [],
                viewCount: 20_000,
              },
            ],
            categoryVideoIds: {},
          },
        },
      },
    });

    expect(result.summary).toMatchObject({
      totalSources: 2,
      freshSources: 1,
      missingSources: 1,
      selectedVideos: 1,
    });
    expect(result.stations[0].sources[1]).toMatchObject({
      name: 'Missing Source',
      selectedCount: 0,
      health: 'missing',
    });
    expect(
      result.violations.some((message: string) =>
        message.toLowerCase().includes('fresh source coverage')
      )
    ).toBe(true);
  });

  it('detects duration, view-count, and source-membership violations', () => {
    const result = auditCatalogHealth({
      stations: [stations[0]],
      now: new Date('2026-07-12T00:00:00.000Z'),
      catalog: {
        lastUpdated: '2026-07-11T00:00:00.000Z',
        sourceMeta: {},
        stations: {
          science: {
            videos: [
              {
                id: 'bad',
                title: 'Bad',
                duration: 30,
                source: 'Unknown Source',
                tags: [],
                viewCount: 9_999,
              },
            ],
            categoryVideoIds: {},
          },
        },
      },
    });

    expect(result.violations.join('\n')).toContain('Unknown Source');
    expect(result.violations.join('\n')).toContain('10,000');
  });
});
