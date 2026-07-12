import { describe, it, expect } from 'vitest';
import { derivePlaybackDiagnostic } from '../playback-diagnostics';

const now = new Date('2026-05-24T12:00:00.000Z');

describe('derivePlaybackDiagnostic', () => {
  it('returns null when playback is healthy', () => {
    expect(
      derivePlaybackDiagnostic({
        catalogLoaded: true,
        catalogLoadFailed: false,
        catalogFreshness: {
          state: 'fresh',
          label: 'Catalog updated 4 days ago',
          ageDays: 4,
          updatedAt: now,
        },
      })
    ).toBeNull();
  });

  it('surfaces catalog load failures with retry', () => {
    expect(
      derivePlaybackDiagnostic({
        catalogLoaded: false,
        catalogLoadFailed: true,
        catalogFreshness: {
          state: 'unknown',
          label: 'Catalog freshness unknown',
          ageDays: null,
          updatedAt: null,
        },
      })
    ).toMatchObject({
      kind: 'catalog_unavailable',
      action: 'retry_catalog',
    });
  });

  it('prioritizes skip streaks over stale catalog warnings', () => {
    expect(
      derivePlaybackDiagnostic({
        catalogLoaded: true,
        catalogLoadFailed: false,
        catalogFreshness: {
          state: 'stale',
          label: 'Catalog updated 14 days ago',
          ageDays: 14,
          updatedAt: now,
        },
        skipStreak: 3,
        lastSkipReason: 'embed disabled',
      })
    ).toMatchObject({
      kind: 'skip_streak',
      action: 'search',
    });
  });

  it('explains quarantined current sources', () => {
    expect(
      derivePlaybackDiagnostic({
        catalogLoaded: true,
        catalogLoadFailed: false,
        catalogFreshness: {
          state: 'fresh',
          label: 'Catalog updated today',
          ageDays: 0,
          updatedAt: now,
        },
        currentSource: 'Broken Channel',
        isQuarantined: true,
      })
    ).toMatchObject({
      kind: 'source_quarantined',
      source: 'Broken Channel',
      action: 'open_health',
    });
  });

  it('warns about stale catalog data when nothing else is wrong', () => {
    expect(
      derivePlaybackDiagnostic({
        catalogLoaded: true,
        catalogLoadFailed: false,
        catalogFreshness: {
          state: 'stale',
          label: 'Catalog updated 14 days ago',
          ageDays: 14,
          updatedAt: now,
        },
      })
    ).toMatchObject({
      kind: 'catalog_stale',
      action: 'retry_catalog',
    });
  });

  it('routes incomplete refreshes to channel health', () => {
    expect(
      derivePlaybackDiagnostic({
        catalogLoaded: true,
        catalogLoadFailed: false,
        catalogFreshness: {
          state: 'incomplete',
          label: 'Latest refresh covered 7% of sources',
          ageDays: null,
          updatedAt: null,
        },
      })
    ).toMatchObject({
      kind: 'catalog_incomplete',
      action: 'open_health',
    });
  });
});
