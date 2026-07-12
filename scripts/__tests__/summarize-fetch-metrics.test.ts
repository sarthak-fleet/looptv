import { describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFetchMetricRows, summarizeFetchMetrics } from '../summarize-fetch-metrics.mjs';

describe('summarize-fetch-metrics', () => {
  it('totals API requests and fetch modes without credentials', () => {
    expect(
      summarizeFetchMetrics([
        { mode: 'cached', count: 100, apiRequests: 0 },
        { mode: 'youtube-api', count: 80, apiRequests: 3 },
      ])
    ).toEqual({
      sources: 2,
      videos: 180,
      apiRequests: 3,
      modes: { cached: 1, 'youtube-api': 1 },
    });
  });

  it('treats empty and malformed metric lines as no results', () => {
    const root = mkdtempSync(join(tmpdir(), 'looptv-fetch-metrics-'));
    const filePath = join(root, 'metrics.jsonl');
    writeFileSync(filePath, 'not-json\n\n');

    expect(readFetchMetricRows(filePath)).toEqual([]);
    expect(summarizeFetchMetrics(readFetchMetricRows(filePath))).toEqual({
      sources: 0,
      videos: 0,
      apiRequests: 0,
      modes: {},
    });
  });
});
