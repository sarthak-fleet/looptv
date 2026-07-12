import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

describe('process-catalog', () => {
  it('preserves source freshness metadata for catalog fallback rows', () => {
    const root = mkdtempSync(join(tmpdir(), 'looptv-process-catalog-'));
    const sources = join(root, 'sources');
    const stationsPath = join(root, 'stations.json');
    const outputPath = join(root, 'catalog.json');
    const sourcePath = join(sources, 'known.jsonl');
    const previousMeta = {
      fetchedAt: '2026-06-01T00:00:00.000Z',
      lastSuccessfulFetch: '2026-06-01T00:00:00.000Z',
      videoCount: 400,
    };

    mkdirSync(sources);
    writeFileSync(
      stationsPath,
      JSON.stringify([
        {
          id: 'science',
          sources: [{ handle: '@known', name: 'Known Source', topPercentile: 100 }],
        },
      ])
    );
    writeFileSync(
      outputPath,
      JSON.stringify({
        lastUpdated: '2026-06-01T00:00:00.000Z',
        sourceMeta: { known: previousMeta },
        stations: {
          science: {
            videos: [
              {
                id: 'known-video',
                title: 'Known video',
                duration: 300,
                tags: ['Known Source', 'science'],
                source: 'Known Source',
                viewCount: 42_000,
              },
            ],
            categoryVideoIds: {},
          },
        },
      })
    );
    writeFileSync(
      sourcePath,
      `${JSON.stringify({
        id: 'known-video',
        title: 'Known video',
        duration: 300,
        view_count: 42_000,
        _looptvCatalogFallback: true,
      })}\n`
    );

    const result = spawnSync(
      process.execPath,
      [resolve('scripts/process-catalog.mjs'), sources, outputPath],
      { encoding: 'utf8', env: { ...process.env, STATIONS_PATH: stationsPath } }
    );
    expect(result.status, result.stderr).toBe(0);

    const catalog = JSON.parse(readFileSync(outputPath, 'utf8'));
    expect(catalog.lastUpdated).toBe('2026-06-01T00:00:00.000Z');
    expect(catalog.generatedAt).toBeTruthy();
    expect(catalog.refreshStatus).toMatchObject({
      complete: false,
      fallbackSources: 1,
      freshSources: 0,
      totalSources: 1,
    });
    expect(catalog.sourceMeta.known).toMatchObject({
      ...previousMeta,
      refreshState: 'fallback',
      selectedCount: 1,
      liveVideoCount: 0,
      fallbackVideoCount: 1,
    });
    expect(catalog.stations.science.videos.map((video: { id: string }) => video.id)).toEqual([
      'known-video',
    ]);
  });

  it('keeps configured missing sources visible without advancing freshness', () => {
    const root = mkdtempSync(join(tmpdir(), 'looptv-process-catalog-missing-'));
    const sources = join(root, 'sources');
    const stationsPath = join(root, 'stations.json');
    const outputPath = join(root, 'catalog.json');
    mkdirSync(sources);
    writeFileSync(
      stationsPath,
      JSON.stringify([
        {
          id: 'science',
          sources: [{ handle: '@missing', name: 'Missing Source' }],
        },
      ])
    );
    writeFileSync(
      outputPath,
      JSON.stringify({
        lastUpdated: '2026-06-01T00:00:00.000Z',
        sourceMeta: {
          missing: {
            fetchedAt: '2026-06-01T00:00:00.000Z',
            lastSuccessfulFetch: '2026-06-01T00:00:00.000Z',
            videoCount: 10,
          },
        },
        stations: {
          science: {
            videos: [
              {
                id: 'preserved',
                title: 'Preserved',
                duration: 300,
                tags: ['Missing Source'],
                source: 'Missing Source',
                viewCount: 42_000,
              },
            ],
            categoryVideoIds: {},
          },
        },
      })
    );

    const result = spawnSync(
      process.execPath,
      [resolve('scripts/process-catalog.mjs'), sources, outputPath],
      { encoding: 'utf8', env: { ...process.env, STATIONS_PATH: stationsPath } }
    );
    expect(result.status, result.stderr).toBe(0);

    const catalog = JSON.parse(readFileSync(outputPath, 'utf8'));
    expect(catalog.lastUpdated).toBe('2026-06-01T00:00:00.000Z');
    expect(catalog.sourceMeta.missing).toMatchObject({
      refreshState: 'missing',
      selectedCount: 1,
    });
    expect(catalog.stations.science.videos).toHaveLength(1);
  });

  it('advances freshness only when live source coverage is complete', () => {
    const root = mkdtempSync(join(tmpdir(), 'looptv-process-catalog-live-'));
    const sources = join(root, 'sources');
    const stationsPath = join(root, 'stations.json');
    const outputPath = join(root, 'catalog.json');
    mkdirSync(sources);
    writeFileSync(
      stationsPath,
      JSON.stringify([
        {
          id: 'science',
          sources: [{ handle: '@live', name: 'Live Source', topPercentile: 100 }],
        },
      ])
    );
    writeFileSync(
      outputPath,
      JSON.stringify({
        lastUpdated: '2026-06-01T00:00:00.000Z',
        stations: { science: { videos: [], categoryVideoIds: {} } },
      })
    );
    writeFileSync(
      join(sources, 'live.jsonl'),
      `${JSON.stringify({
        id: 'live-video',
        title: 'Live video',
        duration: 300,
        view_count: 42_000,
      })}\n`
    );

    const result = spawnSync(
      process.execPath,
      [resolve('scripts/process-catalog.mjs'), sources, outputPath],
      { encoding: 'utf8', env: { ...process.env, STATIONS_PATH: stationsPath } }
    );
    expect(result.status, result.stderr).toBe(0);

    const catalog = JSON.parse(readFileSync(outputPath, 'utf8'));
    expect(catalog.refreshStatus).toMatchObject({
      complete: true,
      freshSources: 1,
      totalSources: 1,
    });
    expect(catalog.lastUpdated).not.toBe('2026-06-01T00:00:00.000Z');
  });
});
