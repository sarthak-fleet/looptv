import type { SourceMeta } from './types';
import { getSourceFreshness } from './catalog';
import type { EmbedHealthRecord } from './watched';

/** Minimum embed samples before treating block rate as meaningful. */
export const MIN_EMBED_SAMPLES = 5;

/** Block rate above which a source is flagged unhealthy / auto-quarantined. */
export const UNHEALTHY_EMBED_BLOCK_RATE = 0.3;

export type SourceHealthState =
  | 'fresh'
  | 'stale'
  | 'partial'
  | 'fallback'
  | 'missing'
  | 'unhealthy'
  | 'quarantined'
  | 'blocked';

export function getEmbedBlockRate(record: EmbedHealthRecord | undefined): number | null {
  if (!record || record.checked < MIN_EMBED_SAMPLES) return null;
  return record.blocked / record.checked;
}

export function isEmbedUnhealthy(record: EmbedHealthRecord | undefined): boolean {
  const rate = getEmbedBlockRate(record);
  return rate !== null && rate > UNHEALTHY_EMBED_BLOCK_RATE;
}

export function shouldAutoQuarantine(record: EmbedHealthRecord | undefined): boolean {
  return isEmbedUnhealthy(record);
}

export function resolveSourceHealthState(input: {
  sourceName: string;
  meta?: SourceMeta | null;
  embedHealth?: EmbedHealthRecord;
  blockedSources: Set<string>;
  quarantinedSources: Set<string>;
}): SourceHealthState {
  const { sourceName, meta, embedHealth, blockedSources, quarantinedSources } = input;

  if (blockedSources.has(sourceName)) return 'blocked';
  if (quarantinedSources.has(sourceName)) return 'quarantined';
  if (!meta || meta.refreshState === 'missing' || meta.refreshState === 'empty') return 'missing';
  if (meta.refreshState === 'partial') return 'partial';
  if (meta.refreshState === 'fallback') return 'fallback';

  const freshness = getSourceFreshness(meta);
  if (freshness.state === 'stale') return 'stale';
  if (isEmbedUnhealthy(embedHealth)) return 'unhealthy';
  return 'fresh';
}

export function countSourcesByHealth(
  sources: { name: string; handle: string }[],
  catalogMeta: Record<string, SourceMeta> | undefined,
  embedHealth: Record<string, EmbedHealthRecord>,
  blockedSources: Set<string>,
  quarantinedSources: Set<string>
): Record<SourceHealthState, number> {
  const counts: Record<SourceHealthState, number> = {
    fresh: 0,
    stale: 0,
    partial: 0,
    fallback: 0,
    missing: 0,
    unhealthy: 0,
    quarantined: 0,
    blocked: 0,
  };

  for (const source of sources) {
    const handle = source.handle.replace('@', '');
    const state = resolveSourceHealthState({
      sourceName: source.name,
      meta: catalogMeta?.[handle],
      embedHealth: embedHealth[source.name],
      blockedSources,
      quarantinedSources,
    });
    counts[state]++;
  }

  return counts;
}
