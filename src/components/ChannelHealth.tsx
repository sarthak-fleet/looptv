"use client";

import { useState } from "react";
import type { Catalog, StationConfig } from "@/lib/types";
import type { EmbedHealthRecord } from "@/lib/watched";
import { getSourceFreshness } from "@/lib/catalog";

interface Props {
  visible: boolean;
  onClose: () => void;
  stations: StationConfig[];
  catalog: Catalog | null;
  embedHealth: Record<string, EmbedHealthRecord>;
  blockedSources: Set<string>;
  onToggleBlock: (source: string) => void;
}

export default function ChannelHealth({
  visible,
  onClose,
  stations,
  catalog,
  embedHealth,
  blockedSources,
  onToggleBlock,
}: Props) {
  const [issuesOnly, setIssuesOnly] = useState(false);

  if (!visible) return null;

  const allSources = stations.flatMap((st) =>
    st.sources.map((s) => ({ station: st, source: s }))
  );

  const staleSources = allSources.filter(({ source }) => {
    const handle = source.handle.replace("@", "");
    return getSourceFreshness(catalog?.sourceMeta?.[handle]).state === "stale";
  });
  const unhealthySources = allSources.filter(({ source }) => {
    const h = embedHealth[source.name];
    return h && h.checked >= 5 && h.blocked / h.checked > 0.3;
  });
  const blockedCount = allSources.filter(({ source }) =>
    blockedSources.has(source.name)
  ).length;

  const hasIssues =
    staleSources.length > 0 ||
    unhealthySources.length > 0 ||
    blockedCount > 0;

  return (
    <div className="fixed inset-0 z-[200] flex flex-col bg-zinc-950 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 shrink-0">
        <div>
          <h2 className="text-white text-sm font-semibold">Channel Health</h2>
          {catalog ? (
            <p className="text-white/40 text-xs mt-0.5">
              {staleSources.length > 0 && (
                <span className="text-yellow-400/80">
                  {staleSources.length} stale
                </span>
              )}
              {staleSources.length > 0 &&
                (unhealthySources.length > 0 || blockedCount > 0) &&
                " · "}
              {unhealthySources.length > 0 && (
                <span className="text-orange-400/80">
                  {unhealthySources.length} embed issues
                </span>
              )}
              {unhealthySources.length > 0 && blockedCount > 0 && " · "}
              {blockedCount > 0 && (
                <span className="text-white/40">
                  {blockedCount} blocked
                </span>
              )}
              {!hasIssues && (
                <span className="text-emerald-400/80">All sources healthy</span>
              )}
            </p>
          ) : (
            <p className="text-white/30 text-xs mt-0.5">Loading catalog...</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {hasIssues && (
            <button
              onClick={() => setIssuesOnly((v) => !v)}
              className={`text-xs px-2.5 py-1 rounded-full transition-colors ${
                issuesOnly
                  ? "bg-white/15 text-white"
                  : "bg-white/5 text-white/40 hover:bg-white/10 hover:text-white/60"
              }`}
            >
              Issues only
            </button>
          )}
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition-colors"
            title="Close (Esc)"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
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

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        {!catalog ? (
          <div className="flex items-center justify-center h-32">
            <p className="text-white/30 text-sm">
              Loading catalog data…
            </p>
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {stations.map((st) => {
              const stationVideos =
                catalog.stations[st.id]?.videos.length ?? 0;

              const visibleSources = issuesOnly
                ? st.sources.filter((s) => {
                    const handle = s.handle.replace("@", "");
                    const isStale =
                      getSourceFreshness(catalog.sourceMeta?.[handle])
                        .state === "stale";
                    const h = embedHealth[s.name];
                    const isUnhealthy =
                      h && h.checked >= 5 && h.blocked / h.checked > 0.3;
                    return (
                      isStale || isUnhealthy || blockedSources.has(s.name)
                    );
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
                      {stationVideos > 0
                        ? `${stationVideos.toLocaleString()} videos`
                        : catalog
                        ? "No videos"
                        : ""}
                    </p>
                  </div>
                  <div className="space-y-1">
                    {visibleSources.map((source) => {
                      const handle = source.handle.replace("@", "");
                      const meta = catalog.sourceMeta?.[handle];
                      const freshness = getSourceFreshness(meta);
                      const h = embedHealth[source.name];
                      const blockRate =
                        h && h.checked >= 5
                          ? h.blocked / h.checked
                          : null;
                      const isUnhealthy =
                        blockRate !== null && blockRate > 0.3;
                      const isStale = freshness.state === "stale";
                      const isBlocked = blockedSources.has(source.name);
                      const videoCount = meta?.videoCount ?? 0;

                      let dotColor = "bg-emerald-400";
                      if (isBlocked) dotColor = "bg-white/20";
                      else if (isUnhealthy) dotColor = "bg-orange-400";
                      else if (isStale) dotColor = "bg-yellow-400";

                      return (
                        <div
                          key={source.handle}
                          className={`flex items-center gap-3 rounded-lg px-3 py-2 transition-colors ${
                            isBlocked
                              ? "bg-white/3 opacity-50"
                              : isUnhealthy
                              ? "bg-orange-500/5"
                              : isStale
                              ? "bg-yellow-500/5"
                              : "bg-white/5"
                          }`}
                        >
                          {/* Status dot */}
                          <span
                            className={`w-2 h-2 rounded-full shrink-0 ${dotColor}`}
                          />

                          {/* Name + meta */}
                          <div className="min-w-0 flex-1">
                            <p
                              className={`text-sm truncate ${
                                isBlocked
                                  ? "line-through text-white/30"
                                  : "text-white/80"
                              }`}
                            >
                              {source.name}
                            </p>
                            <p className="text-white/30 text-xs mt-0.5">
                              {videoCount > 0
                                ? `${videoCount.toLocaleString()} videos`
                                : "No videos fetched"}
                              {freshness.state !== "unknown" &&
                                ` · ${freshness.label}`}
                            </p>
                          </div>

                          {/* Embed health badge */}
                          {blockRate !== null && (
                            <span
                              className={`text-xs px-1.5 py-0.5 rounded shrink-0 ${
                                blockRate > 0.5
                                  ? "bg-red-500/20 text-red-300"
                                  : blockRate > 0.3
                                  ? "bg-orange-500/20 text-orange-300"
                                  : "bg-white/5 text-white/30"
                              }`}
                            >
                              {Math.round(blockRate * 100)}% blocked
                            </span>
                          )}

                          {/* Block / unblock toggle */}
                          <button
                            onClick={() => onToggleBlock(source.name)}
                            className={`p-1.5 rounded transition-colors shrink-0 ${
                              isBlocked
                                ? "text-emerald-400 hover:bg-emerald-400/10"
                                : "text-white/25 hover:text-red-400 hover:bg-red-400/10"
                            }`}
                            title={
                              isBlocked
                                ? `Unblock ${source.name}`
                                : `Block ${source.name}`
                            }
                          >
                            {isBlocked ? (
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

            {/* Empty state when issues-only filter is active */}
            {issuesOnly && (
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

      {/* Footer */}
      <div className="border-t border-white/10 px-4 py-3 shrink-0">
        <p className="text-white/25 text-xs leading-relaxed">
          To add a channel: edit{" "}
          <code className="bg-white/10 px-1 rounded">stations.json</code>, then
          run{" "}
          <code className="bg-white/10 px-1 rounded">
            pnpm run build:catalog
          </code>
          . Stale and embed-blocked sources update automatically on next catalog
          build.
        </p>
      </div>
    </div>
  );
}
