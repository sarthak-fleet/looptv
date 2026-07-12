'use client';

import { useMemo, useState } from 'react';
import type { Catalog, StationConfig } from '@/lib/types';
import type { EmbedHealthRecord } from '@/lib/watched';
import { getSourceFreshness } from '@/lib/catalog';
import {
  countSourcesByHealth,
  getEmbedBlockRate,
  resolveSourceHealthState,
  type SourceHealthState,
} from '@/lib/source-health';

interface Props {
  visible: boolean;
  onClose: () => void;
  stations: StationConfig[];
  catalog: Catalog | null;
  embedHealth: Record<string, EmbedHealthRecord>;
  blockedSources: Set<string>;
  quarantinedSources: Set<string>;
  onToggleBlock: (source: string) => void;
  onUnquarantine: (source: string) => void;
}

const STATE_LABELS: Record<SourceHealthState, string> = {
  fresh: 'Fresh',
  stale: 'Stale',
  partial: 'Partial refresh',
  fallback: 'Fallback data',
  missing: 'Missing data',
  unhealthy: 'Embed issues',
  quarantined: 'Quarantined',
  blocked: 'Blocked',
};

const STATE_DOT_CLASSES: Record<SourceHealthState, string> = {
  blocked: 'bg-white/20',
  quarantined: 'bg-amber-400',
  missing: 'bg-red-400',
  partial: 'bg-orange-300',
  fallback: 'bg-yellow-300',
  unhealthy: 'bg-orange-400',
  stale: 'bg-yellow-400',
  fresh: 'bg-emerald-400',
};

const STATE_ROW_CLASSES: Record<SourceHealthState, string> = {
  blocked: 'bg-white/3 opacity-50',
  quarantined: 'bg-amber-500/5',
  missing: 'bg-red-500/5',
  partial: 'bg-orange-500/5',
  fallback: 'bg-yellow-500/5',
  unhealthy: 'bg-orange-500/5',
  stale: 'bg-yellow-500/5',
  fresh: 'bg-white/5',
};

export default function ChannelHealth({
  visible,
  onClose,
  stations,
  catalog,
  embedHealth,
  blockedSources,
  quarantinedSources,
  onToggleBlock,
  onUnquarantine,
}: Props) {
  const [issuesOnly, setIssuesOnly] = useState(false);

  const allSources = useMemo(
    () => stations.flatMap((st) => st.sources.map((source) => ({ station: st, source }))),
    [stations]
  );

  const counts = useMemo(
    () =>
      countSourcesByHealth(
        allSources.map(({ source }) => source),
        catalog?.sourceMeta,
        embedHealth,
        blockedSources,
        quarantinedSources
      ),
    [allSources, catalog?.sourceMeta, embedHealth, blockedSources, quarantinedSources]
  );

  const hasIssues =
    counts.stale > 0 ||
    counts.partial > 0 ||
    counts.fallback > 0 ||
    counts.missing > 0 ||
    counts.unhealthy > 0 ||
    counts.quarantined > 0 ||
    counts.blocked > 0;

  const visibleIssueCount = useMemo(() => {
    if (!catalog || !issuesOnly) return null;
    return allSources.filter(({ source }) => {
      const handle = source.handle.replace('@', '');
      const state = resolveSourceHealthState({
        sourceName: source.name,
        meta: catalog.sourceMeta?.[handle],
        embedHealth: embedHealth[source.name],
        blockedSources,
        quarantinedSources,
      });
      return state !== 'fresh';
    }).length;
  }, [allSources, catalog, embedHealth, blockedSources, quarantinedSources, issuesOnly]);

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-[200] flex flex-col bg-zinc-950 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 shrink-0">
        <div>
          <h2 className="text-white text-sm font-semibold">Channel Health</h2>
          {catalog ? (
            <p className="text-white/40 text-xs mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5">
              <span className="text-emerald-400/80">{counts.fresh} fresh</span>
              {counts.stale > 0 && <span className="text-yellow-400/80">{counts.stale} stale</span>}
              {counts.partial > 0 && (
                <span className="text-orange-300/80">{counts.partial} partial</span>
              )}
              {counts.fallback > 0 && (
                <span className="text-yellow-300/80">{counts.fallback} fallback</span>
              )}
              {counts.missing > 0 && (
                <span className="text-red-300/80">{counts.missing} missing</span>
              )}
              {counts.unhealthy > 0 && (
                <span className="text-orange-400/80">{counts.unhealthy} embed issues</span>
              )}
              {counts.quarantined > 0 && (
                <span className="text-amber-400/80">{counts.quarantined} quarantined</span>
              )}
              {counts.blocked > 0 && (
                <span className="text-white/40">{counts.blocked} blocked</span>
              )}
              {!hasIssues && <span className="text-emerald-400/80">All sources healthy</span>}
            </p>
          ) : (
            <p className="text-white/30 text-xs mt-0.5">Loading catalog...</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {hasIssues && (
            <button
              type="button"
              onClick={() => setIssuesOnly((v) => !v)}
              className={`text-xs px-2.5 py-1 rounded-full transition-colors ${
                issuesOnly
                  ? 'bg-white/15 text-white'
                  : 'bg-white/5 text-white/40 hover:bg-white/10 hover:text-white/60'
              }`}
            >
              Issues only
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition-colors"
            title="Close (Esc)"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {!catalog ? (
          <div className="flex items-center justify-center h-32">
            <p className="text-white/30 text-sm">Loading catalog data…</p>
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {stations.map((st) => {
              const stationVideos = catalog.stations[st.id]?.videos.length ?? 0;

              const visibleSources = issuesOnly
                ? st.sources.filter((s) => {
                    const handle = s.handle.replace('@', '');
                    const state = resolveSourceHealthState({
                      sourceName: s.name,
                      meta: catalog.sourceMeta?.[handle],
                      embedHealth: embedHealth[s.name],
                      blockedSources,
                      quarantinedSources,
                    });
                    return state !== 'fresh';
                  })
                : st.sources;

              if (issuesOnly && visibleSources.length === 0) return null;

              return (
                <div key={st.id} className="px-4 py-3">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-white/60 text-xs font-semibold uppercase tracking-wider">
                      {st.name}
                    </p>
                    <p className="text-white/25 text-xs">
                      {stationVideos > 0 ? `${stationVideos.toLocaleString()} videos` : 'No videos'}
                    </p>
                  </div>
                  <div className="space-y-1">
                    {visibleSources.map((source) => {
                      const handle = source.handle.replace('@', '');
                      const meta = catalog.sourceMeta?.[handle];
                      const freshness = getSourceFreshness(meta);
                      const healthRecord = embedHealth[source.name];
                      const blockRate = getEmbedBlockRate(healthRecord);
                      const state = resolveSourceHealthState({
                        sourceName: source.name,
                        meta,
                        embedHealth: healthRecord,
                        blockedSources,
                        quarantinedSources,
                      });
                      const candidateCount = meta?.videoCount ?? 0;
                      const selectedCount =
                        meta?.selectedCount ??
                        catalog.stations[st.id]?.videos.filter(
                          (video) => video.source === source.name
                        ).length ??
                        0;

                      return (
                        <div
                          key={source.handle}
                          className={`flex items-center gap-3 rounded-lg px-3 py-2 transition-colors ${STATE_ROW_CLASSES[state]}`}
                        >
                          <span
                            className={`w-2 h-2 rounded-full shrink-0 ${STATE_DOT_CLASSES[state]}`}
                          />

                          <div className="min-w-0 flex-1">
                            <p
                              className={`text-sm truncate ${
                                state === 'blocked' ? 'line-through text-white/30' : 'text-white/80'
                              }`}
                            >
                              {source.name}
                            </p>
                            <p className="text-white/30 text-xs mt-0.5">
                              {selectedCount > 0
                                ? `${selectedCount.toLocaleString()} selected${candidateCount > selectedCount ? ` of ${candidateCount.toLocaleString()} candidates` : ''}`
                                : 'No selected videos'}
                              {freshness.state !== 'unknown' && ` · ${freshness.label}`}
                              {state !== 'fresh' && ` · ${STATE_LABELS[state]}`}
                            </p>
                          </div>

                          {blockRate !== null && (
                            <span
                              className={`text-xs px-1.5 py-0.5 rounded shrink-0 ${
                                blockRate > 0.5
                                  ? 'bg-red-500/20 text-red-300'
                                  : blockRate > 0.3
                                    ? 'bg-orange-500/20 text-orange-300'
                                    : 'bg-white/5 text-white/30'
                              }`}
                            >
                              {Math.round(blockRate * 100)}% blocked
                            </span>
                          )}

                          {state === 'quarantined' && (
                            <button
                              type="button"
                              onClick={() => onUnquarantine(source.name)}
                              className="shrink-0 rounded-lg bg-emerald-500/15 px-2.5 py-1.5 text-xs text-emerald-300 transition-colors hover:bg-emerald-500/25"
                            >
                              Re-enable
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => onToggleBlock(source.name)}
                            className={`p-1.5 rounded transition-colors shrink-0 ${
                              state === 'blocked'
                                ? 'text-emerald-400 hover:bg-emerald-400/10'
                                : 'text-white/25 hover:text-red-400 hover:bg-red-400/10'
                            }`}
                            title={
                              state === 'blocked'
                                ? `Unblock ${source.name}`
                                : `Block ${source.name}`
                            }
                          >
                            {state === 'blocked' ? (
                              <svg
                                className="w-4 h-4"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                                />
                              </svg>
                            ) : (
                              <svg
                                className="w-4 h-4"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
                                />
                              </svg>
                            )}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {issuesOnly && visibleIssueCount === 0 && (
              <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                <span className="w-2 h-2 rounded-full bg-emerald-400 mb-3" />
                <p className="text-white/50 text-sm">No issues found</p>
                <p className="text-white/25 text-xs mt-1">
                  All sources are fresh and embedding correctly.
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="border-t border-white/10 px-4 py-3 shrink-0">
        <p className="text-white/25 text-xs leading-relaxed">
          Sources with sustained embed failures are auto-quarantined in this browser. Re-enable them
          here, or block a source permanently. To add a channel: edit{' '}
          <code className="bg-white/10 px-1 rounded">stations.json</code>, then run{' '}
          <code className="bg-white/10 px-1 rounded">pnpm run build:catalog</code>.
        </p>
      </div>
    </div>
  );
}
