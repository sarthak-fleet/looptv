import type { CatalogFreshness, SourceFreshness } from './catalog';
import type { EmbedHealthRecord } from './watched';
import { isEmbedUnhealthy } from './source-health';

export type DiagnosticAction = 'retry_catalog' | 'open_health' | 'search';

export type DiagnosticKind =
  | 'catalog_unavailable'
  | 'skip_streak'
  | 'source_quarantined'
  | 'source_embed'
  | 'source_stale'
  | 'catalog_incomplete'
  | 'catalog_stale';

export interface PlaybackDiagnostic {
  kind: DiagnosticKind;
  headline: string;
  detail?: string;
  source?: string;
  action?: DiagnosticAction;
}

export interface PlaybackDiagnosticInput {
  catalogLoaded: boolean;
  catalogLoadFailed: boolean;
  catalogFreshness: CatalogFreshness;
  currentSource?: string;
  sourceFreshness?: SourceFreshness;
  embedHealth?: EmbedHealthRecord;
  isQuarantined?: boolean;
  skipStreak?: number;
  lastSkipReason?: string;
}

/** Returns null when playback quality is healthy — no banner needed. */
export function derivePlaybackDiagnostic(
  input: PlaybackDiagnosticInput
): PlaybackDiagnostic | null {
  const {
    catalogLoaded,
    catalogLoadFailed,
    catalogFreshness,
    currentSource,
    sourceFreshness,
    embedHealth,
    isQuarantined,
    skipStreak = 0,
    lastSkipReason,
  } = input;

  if (!catalogLoaded && catalogFreshness.state === 'loading' && !catalogLoadFailed) {
    return null;
  }

  if (!catalogLoaded) {
    return {
      kind: 'catalog_unavailable',
      headline: "Catalog couldn't load",
      detail: 'Check your connection, then retry without reloading the page.',
      action: 'retry_catalog',
    };
  }

  if (skipStreak >= 2) {
    return {
      kind: 'skip_streak',
      headline: `Skipped ${skipStreak} unplayable videos in a row`,
      detail: lastSkipReason
        ? `Last failure: ${lastSkipReason}. LoopTV is trying the next item.`
        : 'LoopTV is trying the next item.',
      action: 'search',
    };
  }

  if (currentSource && isQuarantined) {
    return {
      kind: 'source_quarantined',
      headline: `${currentSource} is paused for embed failures`,
      detail:
        'This source was auto-hidden after repeated embed blocks. Re-enable it in Channel Health.',
      source: currentSource,
      action: 'open_health',
    };
  }

  if (currentSource && isEmbedUnhealthy(embedHealth)) {
    const rate = embedHealth!.blocked / embedHealth!.checked;
    return {
      kind: 'source_embed',
      headline: `${currentSource} is having embed issues`,
      detail: `${Math.round(rate * 100)}% of recent clips couldn't play here. Other sources in this station should still work.`,
      source: currentSource,
      action: 'open_health',
    };
  }

  if (currentSource && sourceFreshness?.state === 'stale') {
    return {
      kind: 'source_stale',
      headline: `${currentSource} catalog data is stale`,
      detail: `${sourceFreshness.label}. Playback may include older clips until the next catalog build.`,
      source: currentSource,
      action: 'open_health',
    };
  }

  if (catalogFreshness.state === 'incomplete') {
    return {
      kind: 'catalog_incomplete',
      headline: 'Channel refresh was incomplete',
      detail: `${catalogFreshness.label}. Preserved videos remain available.`,
      action: 'open_health',
    };
  }

  if (catalogFreshness.state === 'stale') {
    return {
      kind: 'catalog_stale',
      headline: 'Channel catalog may be stale',
      detail: `${catalogFreshness.label}. Retry to fetch the latest catalog, or keep watching cached videos.`,
      action: 'retry_catalog',
    };
  }

  return null;
}
