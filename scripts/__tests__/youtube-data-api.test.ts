import { describe, expect, it } from 'vitest';
import {
  chunkIds,
  fetchYouTubeSource,
  parseIsoDuration,
  uploadsPlaylistId,
} from '../youtube-data-api.mjs';

const source = {
  channelId: 'UCqFzWxSCi39LnW1JKFR3efg',
  handle: '@SaturdayNightLive',
};

function response(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

describe('youtube-data-api', () => {
  it('rejects missing credentials and unavailable fetch before making a request', async () => {
    await expect(fetchYouTubeSource(source, [], { apiKey: '' })).rejects.toThrow(
      'YOUTUBE_API_KEY is not configured'
    );
    await expect(
      fetchYouTubeSource(source, [], { apiKey: 'test-key', fetchImpl: null as never })
    ).rejects.toThrow('Fetch implementation is unavailable');
  });

  it('derives an uploads playlist without another API request', () => {
    expect(uploadsPlaylistId(source.channelId)).toBe('UUqFzWxSCi39LnW1JKFR3efg');
    expect(() => uploadsPlaylistId('bad')).toThrow('invalid');
  });

  it('parses YouTube ISO durations', () => {
    expect(parseIsoDuration('PT12M34S')).toBe(754);
    expect(parseIsoDuration('PT1H2M3S')).toBe(3723);
    expect(parseIsoDuration('P1DT2H')).toBe(93_600);
    expect(parseIsoDuration('invalid')).toBe(0);
  });

  it('batches metadata IDs at 50', () => {
    expect(
      chunkIds(Array.from({ length: 121 }, (_, index) => String(index))).map((x) => x.length)
    ).toEqual([50, 50, 21]);
  });

  it('stops playlist pagination after reaching a fully known page', async () => {
    const calls: URL[] = [];
    const fetchImpl = async (input: string | URL | Request) => {
      const url = input instanceof URL ? input : new URL(String(input));
      calls.push(url);
      if (url.pathname.endsWith('/playlistItems')) {
        return response({
          nextPageToken: 'unused',
          items: [{ contentDetails: { videoId: 'known' } }],
        });
      }
      return response({
        items: [
          {
            id: 'known',
            snippet: {
              title: 'Known video',
              description: 'Description',
              channelId: source.channelId,
              channelTitle: 'SNL',
              publishedAt: '2026-07-01T00:00:00Z',
            },
            contentDetails: { duration: 'PT5M' },
            statistics: { viewCount: '12345' },
            status: { privacyStatus: 'public', embeddable: true },
          },
        ],
      });
    };

    const result = await fetchYouTubeSource(source, [{ id: 'known', view_count: 12_000 }], {
      apiKey: 'test-key',
      fetchImpl,
      fetchedAt: '2026-07-12T00:00:00Z',
    });

    expect(result.stoppedAtKnown).toBe(true);
    expect(result.apiRequests).toBe(2);
    expect(calls.filter((url) => url.pathname.endsWith('/playlistItems'))).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      id: 'known',
      duration: 300,
      view_count: 12_345,
      playable_in_embed: true,
      _looptvFetchProvider: 'youtube-data-api',
    });
  });

  it('continues past a mixed page and stops on the next fully known page', async () => {
    let playlistPage = 0;
    const fetchImpl = async (input: string | URL | Request) => {
      const url = input instanceof URL ? input : new URL(String(input));
      if (url.pathname.endsWith('/playlistItems')) {
        playlistPage += 1;
        return playlistPage === 1
          ? response({
              nextPageToken: 'page-2',
              items: ['new', 'known'].map((id) => ({ contentDetails: { videoId: id } })),
            })
          : response({
              nextPageToken: 'unused',
              items: [{ contentDetails: { videoId: 'known' } }],
            });
      }
      const ids = (url.searchParams.get('id') || '').split(',').filter(Boolean);
      return response({ items: ids.map((id) => videoFixture(id)) });
    };

    const result = await fetchYouTubeSource(source, [{ id: 'known', view_count: 50_000 }], {
      apiKey: 'test-key',
      fetchImpl,
    });
    expect(result.playlistRequests).toBe(2);
    expect(result.videoRequests).toBe(1);
    expect(result.stoppedAtKnown).toBe(true);
    expect(result.rows.map((row) => row.id).sort()).toEqual(['known', 'new']);
  });

  it('drops videos that the owner has marked non-embeddable', async () => {
    const fetchImpl = async (input: string | URL | Request) => {
      const url = input instanceof URL ? input : new URL(String(input));
      if (url.pathname.endsWith('/playlistItems')) {
        return response({ items: [{ contentDetails: { videoId: 'blocked' } }] });
      }
      return response({
        items: [
          {
            id: 'blocked',
            snippet: { title: 'Blocked', channelId: source.channelId },
            contentDetails: { duration: 'PT5M' },
            statistics: { viewCount: '50000' },
            status: { privacyStatus: 'public', embeddable: false },
          },
        ],
      });
    };

    const result = await fetchYouTubeSource(source, [], { apiKey: 'test-key', fetchImpl });
    expect(result.rows).toEqual([]);
  });

  it('bounds missing-cache discovery and sends no more than 50 IDs per metadata request', async () => {
    let page = 0;
    const videoBatchSizes: number[] = [];
    const fetchImpl = async (input: string | URL | Request) => {
      const url = input instanceof URL ? input : new URL(String(input));
      if (url.pathname.endsWith('/playlistItems')) {
        const start = page * 50;
        page += 1;
        return response({
          nextPageToken: page < 3 ? `page-${page}` : undefined,
          items: Array.from({ length: 50 }, (_, index) => ({
            contentDetails: { videoId: `v${start + index}` },
          })),
        });
      }
      const ids = (url.searchParams.get('id') || '').split(',').filter(Boolean);
      videoBatchSizes.push(ids.length);
      return response({
        items: ids.map((id) => ({
          id,
          snippet: { title: id, channelId: source.channelId },
          contentDetails: { duration: 'PT2M' },
          statistics: { viewCount: '20000' },
          status: { privacyStatus: 'public' },
        })),
      });
    };

    const result = await fetchYouTubeSource(source, [], {
      apiKey: 'test-key',
      fetchImpl,
      recentLimit: 120,
    });
    expect(result.discoveredCount).toBe(120);
    expect(result.playlistRequests).toBe(3);
    expect(videoBatchSizes).toEqual([50, 50, 20]);
  });

  it('handles private, duplicate, missing-statistics, and invalid-date metadata safely', async () => {
    const fetchImpl = async (input: string | URL | Request) => {
      const url = input instanceof URL ? input : new URL(String(input));
      if (url.pathname.endsWith('/playlistItems')) {
        return response({
          items: ['private', 'duplicate', 'missing-stats', 'invalid-date'].map((id) => ({
            contentDetails: { videoId: id },
          })),
        });
      }
      return response({
        items: [
          { ...videoFixture('private'), status: { privacyStatus: 'private', embeddable: true } },
          videoFixture('duplicate', 'not-a-date'),
          {
            ...videoFixture('duplicate'),
            snippet: { ...videoFixture('duplicate').snippet, title: 'latest' },
          },
          { ...videoFixture('missing-stats'), statistics: {} },
          videoFixture('invalid-date', 'not-a-date'),
        ],
      });
    };

    const result = await fetchYouTubeSource(source, [], { apiKey: 'test-key', fetchImpl });
    expect(result.rows.map((row) => row.id)).toEqual([
      'duplicate',
      'missing-stats',
      'invalid-date',
    ]);
    expect(result.rows[0].title).toBe('latest');
    expect(result.rows[0].timestamp).toBeTypeOf('number');
    expect(result.rows[1].view_count).toBeNull();
    expect(result.rows[2].timestamp).toBeNull();
  });

  it('does not leak the API key in errors', async () => {
    await expect(
      fetchYouTubeSource(source, [], {
        apiKey: 'super-secret-key',
        fetchImpl: async () => response({ error: { errors: [{ reason: 'quotaExceeded' }] } }, 403),
      })
    ).rejects.not.toThrow('super-secret-key');

    await expect(
      fetchYouTubeSource(source, [], {
        apiKey: 'super-secret-key',
        fetchImpl: async (input) => {
          throw new Error(`network failure for ${String(input)}`);
        },
      })
    ).rejects.toThrow('network request failed');
  });

  it('enforces the per-source API request budget', async () => {
    const fetchImpl = async (input: string | URL | Request) => {
      const url = input instanceof URL ? input : new URL(String(input));
      if (url.pathname.endsWith('/playlistItems')) {
        return response({
          items: [{ contentDetails: { videoId: 'one' } }],
          nextPageToken: 'more',
        });
      }
      return response({ items: [] });
    };

    await expect(
      fetchYouTubeSource(source, [], {
        apiKey: 'test-key',
        fetchImpl,
        recentLimit: 100,
        maxRequests: 2,
      })
    ).rejects.toThrow('request budget reached (2)');
  });

  it('clamps discovery to at least one item and tolerates malformed item collections', async () => {
    let requestedMax = '';
    const result = await fetchYouTubeSource(source, [], {
      apiKey: 'test-key',
      recentLimit: 0,
      fetchImpl: async (input) => {
        const url = input instanceof URL ? input : new URL(String(input));
        requestedMax = url.searchParams.get('maxResults') || '';
        return response({ items: { malformed: true } });
      },
    });
    expect(requestedMax).toBe('1');
    expect(result.rows).toEqual([]);
    expect(result.apiRequests).toBe(1);
  });

  it('retains only the 250 highest-view cached IDs for metadata refresh', async () => {
    const requestedIds: string[] = [];
    const cachedRows = Array.from({ length: 300 }, (_, index) => ({
      id: `cached-${index}`,
      view_count: index,
    }));
    const result = await fetchYouTubeSource(source, cachedRows, {
      apiKey: 'test-key',
      recentLimit: 250,
      fetchImpl: async (input) => {
        const url = input instanceof URL ? input : new URL(String(input));
        if (url.pathname.endsWith('/playlistItems')) return response({ items: [] });
        const ids = (url.searchParams.get('id') || '').split(',').filter(Boolean);
        requestedIds.push(...ids);
        return response({ items: ids.map((id) => videoFixture(id)) });
      },
    });

    expect(result.videoRequests).toBe(5);
    expect(requestedIds).toHaveLength(250);
    expect(requestedIds).toContain('cached-299');
    expect(requestedIds).not.toContain('cached-0');
  });
});

function videoFixture(id: string, publishedAt = '2026-07-01T00:00:00Z') {
  return {
    id,
    snippet: { title: id, channelId: source.channelId, publishedAt },
    contentDetails: { duration: 'PT5M' },
    statistics: { viewCount: '50000' },
    status: { privacyStatus: 'public', embeddable: true },
  };
}
