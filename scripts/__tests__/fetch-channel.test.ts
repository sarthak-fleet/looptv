import { describe, expect, it } from 'vitest';
import {
  computeEnrichBudget,
  filterFlatByDuration,
  findSourceByHandle,
  isBotDetectionError,
  isEnrichmentComplete,
  ytDlpBaseArgs,
  ytDlpTimeoutMs,
} from '../fetch-channel.mjs';

describe('fetch-channel', () => {
  it('filters flat entries by per-source duration', () => {
    const flat = [
      { id: 'a', duration: 30 },
      { id: 'b', duration: 300 },
      { id: 'c', duration: 5000 },
    ];
    expect(filterFlatByDuration(flat, 60, 1800).map((v) => v.id)).toEqual(['b']);
  });

  it('enriches all rows for small channels', () => {
    expect(computeEnrichBudget(80, {})).toBe(80);
  });

  it('caps enrich budget for mega channels', () => {
    const snl = findSourceByHandle('@SaturdayNightLive');
    const budget = computeEnrichBudget(9000, snl);
    expect(budget).toBeGreaterThanOrEqual(250);
    expect(budget).toBeLessThan(9000);
    expect(budget).toBeLessThanOrEqual(500);
  });

  it('detects YouTube bot wall errors', () => {
    expect(isBotDetectionError("Sign in to confirm you're not a bot")).toBe(true);
    expect(isBotDetectionError('network timeout')).toBe(false);
  });

  it('rejects tiny enrichment responses as incomplete', () => {
    expect(isEnrichmentComplete(1, 98, 98)).toBe(false);
    expect(isEnrichmentComplete(60, 98, 98)).toBe(true);
    expect(isEnrichmentComplete(2, 1_000, 250)).toBe(false);
  });

  it('uses android/web player client for CI resilience', () => {
    expect(ytDlpBaseArgs()).toContain('youtube:player_client=android,web');
  });

  it('bounds yt-dlp only when a positive timeout is configured', () => {
    expect(ytDlpTimeoutMs({})).toBeUndefined();
    expect(ytDlpTimeoutMs({ YT_DLP_TIMEOUT_MS: '600000' })).toBe(600000);
    expect(ytDlpTimeoutMs({ YT_DLP_TIMEOUT_MS: 'invalid' })).toBeUndefined();
  });
});
