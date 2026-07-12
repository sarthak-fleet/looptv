import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { auditCatalogHealth } from '../audit-catalog-health.mjs';

const catalogPath = resolve(__dirname, '../../public/catalog.json');
const raw = readFileSync(catalogPath, 'utf-8');

describe('catalog.json validation', () => {
  it('is valid JSON', () => {
    expect(() => JSON.parse(raw)).not.toThrow();
  });

  const catalog = JSON.parse(raw);

  it('has a "stations" key', () => {
    expect(catalog).toHaveProperty('stations');
    expect(typeof catalog.stations).toBe('object');
  });

  const stationEntries = Object.entries(catalog.stations) as [
    string,
    {
      videos: { id: string; title: string; duration: number; tags: string[]; viewCount?: number }[];
      categoryVideoIds: Record<string, string[]>;
    },
  ][];

  it('has at least one station', () => {
    expect(stationEntries.length).toBeGreaterThan(0);
  });

  it('every station has a videos array and categoryVideoIds object', () => {
    for (const [id, station] of stationEntries) {
      expect(Array.isArray(station.videos), `${id}: videos should be an array`).toBe(true);
      expect(typeof station.categoryVideoIds, `${id}: categoryVideoIds should be an object`).toBe(
        'object'
      );
    }
  });

  it('no station has 0 videos', () => {
    for (const [id, station] of stationEntries) {
      expect(station.videos.length, `${id} has 0 videos`).toBeGreaterThan(0);
    }
  });

  it('every video has id, title, duration, and tags fields', () => {
    for (const [stationId, station] of stationEntries) {
      for (const video of station.videos) {
        const ctx = `station=${stationId}, video=${video.id ?? 'MISSING'}`;
        expect(video, ctx).toHaveProperty('id');
        expect(typeof video.id, ctx).toBe('string');
        expect(video, ctx).toHaveProperty('title');
        expect(typeof video.title, ctx).toBe('string');
        expect(video, ctx).toHaveProperty('duration');
        expect(typeof video.duration, ctx).toBe('number');
        expect(video, ctx).toHaveProperty('tags');
        expect(Array.isArray(video.tags), `${ctx}: tags should be array`).toBe(true);
      }
    }
  });

  it('no video has duration < 30 seconds', () => {
    for (const [stationId, station] of stationEntries) {
      for (const video of station.videos) {
        expect(
          video.duration,
          `station=${stationId}, video=${video.id} has duration ${video.duration}`
        ).toBeGreaterThanOrEqual(30);
      }
    }
  });

  it('every video meets the minimum view threshold', () => {
    const hasPopulatedViewCounts = stationEntries.some(([, station]) =>
      station.videos.some((video) => (video.viewCount ?? 0) > 0)
    );
    if (!hasPopulatedViewCounts) {
      return;
    }

    for (const [stationId, station] of stationEntries) {
      for (const video of station.videos) {
        expect(
          video.viewCount,
          `station=${stationId}, video=${video.id} has viewCount ${video.viewCount ?? 'missing'}`
        ).toBeGreaterThanOrEqual(10_000);
      }
    }
  });

  it('passes structural source/station audit independently of current freshness coverage', () => {
    const stations = JSON.parse(readFileSync(resolve(__dirname, '../../stations.json'), 'utf8'));
    const result = auditCatalogHealth({ stations, catalog });
    const structuralViolations = result.violations.filter(
      (message: string) => !message.startsWith('Fresh source coverage')
    );

    expect(Object.keys(catalog.sourceMeta ?? {})).toHaveLength(
      stations.reduce(
        (total: number, station: { sources: unknown[] }) => total + station.sources.length,
        0
      )
    );
    expect(structuralViolations).toEqual([]);
  });
});
