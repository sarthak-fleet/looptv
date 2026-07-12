import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { handleEmptyDurationResult, refreshFromYouTubeApi } from '../fetch-channel.mjs';

const source = {
  channelId: 'UCqFzWxSCi39LnW1JKFR3efg',
  handle: '@SaturdayNightLive',
  topPercentile: 10,
};

function response(body: unknown) {
  return { ok: true, status: 200, json: async () => body } as Response;
}

function video(id: string, viewCount = 50_000) {
  return {
    id,
    snippet: {
      title: id,
      description: `${id} description`,
      channelId: source.channelId,
      channelTitle: 'SNL',
      publishedAt: '2026-07-01T00:00:00Z',
    },
    contentDetails: { duration: 'PT5M' },
    statistics: { viewCount: String(viewCount) },
    status: { privacyStatus: 'public', embeddable: true },
  };
}

describe('refreshFromYouTubeApi', () => {
  it('persists a timestamped, preselected API working set and request metrics', async () => {
    const root = mkdtempSync(join(tmpdir(), 'looptv-api-refresh-'));
    const outputPath = join(root, 'source.jsonl');
    writeFileSync(outputPath, `${JSON.stringify({ id: 'known', view_count: 40_000 })}\n`);

    const fetchImpl = async (input: string | URL | Request) => {
      const url = input instanceof URL ? input : new URL(String(input));
      if (url.pathname.endsWith('/playlistItems')) {
        return response({ items: [{ contentDetails: { videoId: 'new' } }] });
      }
      const ids = (url.searchParams.get('id') || '').split(',').filter(Boolean);
      return response({ items: ids.map((id) => video(id)) });
    };

    const { selection, apiResult } = await refreshFromYouTubeApi({
      source,
      outputPath,
      minDur: 60,
      maxDur: 1_800,
      previousCandidateCount: 20,
      apiKey: 'test-key',
      fetchImpl,
    });
    const persisted = readFileSync(outputPath, 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));

    expect(apiResult.apiRequests).toBe(2);
    expect(selection.candidateCount).toBe(20);
    expect(persisted).toHaveLength(2);
    expect(
      persisted.every(
        (row) =>
          row._looptvPreselected === true &&
          row._looptvCandidateCount === 20 &&
          row._looptvFetchProvider === 'youtube-data-api' &&
          typeof row._looptvFetchedAt === 'string'
      )
    ).toBe(true);
  });

  it('does not erase a good cache when live rows fail quality filters', async () => {
    const root = mkdtempSync(join(tmpdir(), 'looptv-api-preserve-'));
    const outputPath = join(root, 'source.jsonl');
    const original = `${JSON.stringify({ id: 'known', view_count: 40_000, duration: 300 })}\n`;
    writeFileSync(outputPath, original);

    const fetchImpl = async (input: string | URL | Request) => {
      const url = input instanceof URL ? input : new URL(String(input));
      if (url.pathname.endsWith('/playlistItems')) {
        return response({ items: [{ contentDetails: { videoId: 'new' } }] });
      }
      const ids = (url.searchParams.get('id') || '').split(',').filter(Boolean);
      return response({ items: ids.map((id) => video(id, 100)) });
    };

    await expect(
      refreshFromYouTubeApi({
        source,
        outputPath,
        minDur: 60,
        maxDur: 1_800,
        previousCandidateCount: 20,
        apiKey: 'test-key',
        fetchImpl,
      })
    ).rejects.toThrow('no qualifying replacement rows');
    expect(readFileSync(outputPath, 'utf8')).toBe(original);
  });

  it('does not erase a good cache when the yt-dlp fallback has no qualifying rows', () => {
    const root = mkdtempSync(join(tmpdir(), 'looptv-empty-fallback-'));
    const outputPath = join(root, 'source.jsonl');
    const original = `${JSON.stringify({ id: 'known', view_count: 40_000, duration: 300 })}\n`;
    writeFileSync(outputPath, original);

    const result = handleEmptyDurationResult({
      safe: 'known',
      outputPath,
      minDur: 60,
      maxDur: 1_800,
      flatCount: 0,
      apiRequests: 2,
    });

    expect(result).toMatchObject({ mode: 'cache-fallback', count: 1, apiRequests: 2 });
    expect(readFileSync(outputPath, 'utf8')).toBe(original);
  });
});
