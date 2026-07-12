import { describe, expect, it, vi } from 'vitest';
import {
  checkpointQualifies,
  estimateFullAuditRequests,
  formatQualityAuditMarkdown,
  RequestBudget,
  selectFullHistoryRows,
  sourcePolicyKey,
} from '../full-catalog-rebaseline.mjs';

const source = { minDuration: 60, maxDuration: 1800, topPercentile: 30 };

describe('full catalog quality rebaseline', () => {
  it('estimates batched playlist and metadata requests plus channel preflight', () => {
    expect(estimateFullAuditRequests([10_280, 18, 51], 3)).toBe(1 + 206 * 2 + 1 * 2 + 2 * 2);
  });

  it('selects the true highest-view eligible set after filtering exactly once', () => {
    const rows = [
      ...Array.from({ length: 1_000 }, (_, index) => ({
        id: `eligible-${index}`,
        duration: 300,
        view_count: 1_000_000 - index,
        playable_in_embed: true,
      })),
      { id: 'short', duration: 30, view_count: 9_000_000 },
      { id: 'low', duration: 300, view_count: 9_999 },
      { id: 'blocked', duration: 300, view_count: 9_000_000, playable_in_embed: false },
    ];
    const result = selectFullHistoryRows(rows, source, {
      auditedAt: '2026-07-12T00:00:00Z',
      publicUploadCount: 1_003,
    });
    expect(result.candidateCount).toBe(1_000);
    expect(result.pct).toBe(30);
    expect(result.selected).toHaveLength(200);
    expect(result.selected[0].id).toBe('eligible-0');
    expect(result.selected.at(-1)?.id).toBe('eligible-199');
    expect(result.selected.every((row) => row._looptvFullAuditAt)).toBe(true);
  });

  it('reuses only checkpoints matching the active quality policy', () => {
    const row = {
      id: 'one',
      _looptvFetchProvider: 'youtube-data-api',
      _looptvFullAuditAt: '2026-07-12T00:00:00Z',
      _looptvCandidateCount: 10,
      _looptvPublicUploadCount: 20,
      _looptvQualityPolicy: sourcePolicyKey(source),
    };
    expect(checkpointQualifies([row], source)).toBe(true);
    expect(checkpointQualifies([row], { ...source, topPercentile: 3 })).toBe(false);
    expect(checkpointQualifies([row], { ...source, maxVideos: 1_000 })).toBe(false);
  });

  it('selects up to a source-specific cap', () => {
    const rows = Array.from({ length: 4_000 }, (_, index) => ({
      id: `eligible-${index}`,
      duration: 300,
      view_count: 10_000_000 - index,
      playable_in_embed: true,
    }));
    const result = selectFullHistoryRows(
      rows,
      { ...source, maxVideos: 1_000 },
      {
        auditedAt: '2026-07-12T00:00:00Z',
        publicUploadCount: 4_000,
      }
    );

    expect(result.selected).toHaveLength(1_000);
    expect(result.selected.at(-1)?.id).toBe('eligible-999');
    expect(result.selected[0]._looptvQualityPolicy).toBe('60:1800:30:10000:1000');
  });

  it('refuses an over-budget request and throttles accepted requests', async () => {
    const sleep = vi.fn(async () => {});
    const budget = new RequestBudget({ maxRequests: 2, requestsPerSecond: 5, sleep });
    await budget.beforeRequest();
    await budget.beforeRequest();
    await expect(budget.beforeRequest()).rejects.toThrow('budget reached (2)');
    expect(budget.requests).toBe(2);
  });

  it('renders grouped quality and quota evidence', () => {
    const markdown = formatQualityAuditMarkdown({
      requests: 0,
      baselineRequests: 412,
      sources: [
        {
          stationId: 'snl',
          source: 'Saturday Night Live',
          publicUploads: 10_280,
          candidates: 8_912,
          selected: 200,
          percentile: 30,
          minimumViews: 13_575_907,
          baselineRequests: 412,
        },
      ],
    });
    expect(markdown).toContain('## snl');
    expect(markdown).toContain('| Saturday Night Live | full-history | 10,280 | 8,912 | 200 | 30%');
    expect(markdown).toContain('Full-history baseline requests: 412');
  });
});
