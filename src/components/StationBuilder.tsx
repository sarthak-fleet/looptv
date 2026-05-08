"use client";

import { useMemo, useState } from "react";
import type { Catalog, StationConfig } from "@/lib/types";
import {
  buildCatalogPreview,
  createStationConfigSnippet,
  createStationDraft,
  createStationPrExport,
} from "@/lib/station-builder";

interface StationBuilderProps {
  catalog: Catalog | null;
  stations: StationConfig[];
  visible: boolean;
  onClose: () => void;
}

export default function StationBuilder({ catalog, stations, visible, onClose }: StationBuilderProps) {
  const [name, setName] = useState("My Station");
  const [description, setDescription] = useState("");
  const [sourcesText, setSourcesText] = useState("Veritasium | @veritasium\nKurzgesagt | @kurzgesagt");
  const [minDuration, setMinDuration] = useState(60);
  const [maxDuration, setMaxDuration] = useState(1800);
  const [copied, setCopied] = useState<"json" | "pr" | null>(null);

  const draft = useMemo(
    () => createStationDraft({ name, description, sourcesText, minDuration, maxDuration }),
    [description, maxDuration, minDuration, name, sourcesText]
  );
  const preview = useMemo(
    () => buildCatalogPreview(catalog, draft, stations),
    [catalog, draft, stations]
  );
  const jsonSnippet = useMemo(() => createStationConfigSnippet(draft), [draft]);
  const prExport = useMemo(() => createStationPrExport(draft, preview), [draft, preview]);

  if (!visible) return null;

  const copyText = async (kind: "json" | "pr", text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(kind);
    setTimeout(() => setCopied(null), 1800);
  };

  return (
    <div className="fixed inset-0 z-[400] overflow-y-auto bg-black/85 backdrop-blur-sm">
      <div className="min-h-full px-4 py-8">
        <div className="mx-auto w-full max-w-6xl rounded-xl border border-white/10 bg-zinc-950 shadow-2xl">
          <div className="flex items-start justify-between gap-4 border-b border-white/10 px-5 py-4">
            <div>
              <h2 className="text-lg font-semibold text-white">Station Builder</h2>
              <p className="mt-1 text-sm text-white/40">
                Draft a station, preview existing catalog coverage, and export a PR-ready payload.
              </p>
            </div>
            <button
              onClick={onClose}
              className="rounded-lg p-2 text-white/50 transition-colors hover:bg-white/10 hover:text-white"
              title="Close station builder"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="grid gap-0 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <div className="space-y-4 border-b border-white/10 p-5 lg:border-b-0 lg:border-r">
              <label className="block">
                <span className="text-xs font-medium uppercase tracking-wide text-white/40">Station name</span>
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  className="mt-2 w-full rounded-lg border border-white/10 bg-black px-3 py-2 text-sm text-white outline-none transition-colors placeholder:text-white/20 focus:border-white/30"
                />
              </label>

              <label className="block">
                <span className="text-xs font-medium uppercase tracking-wide text-white/40">Description</span>
                <input
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="Optional. Auto-filled from the first sources."
                  className="mt-2 w-full rounded-lg border border-white/10 bg-black px-3 py-2 text-sm text-white outline-none transition-colors placeholder:text-white/20 focus:border-white/30"
                />
              </label>

              <label className="block">
                <span className="text-xs font-medium uppercase tracking-wide text-white/40">Sources</span>
                <textarea
                  value={sourcesText}
                  onChange={(event) => setSourcesText(event.target.value)}
                  rows={8}
                  spellCheck={false}
                  className="mt-2 w-full resize-none rounded-lg border border-white/10 bg-black px-3 py-2 font-mono text-sm text-white outline-none transition-colors placeholder:text-white/20 focus:border-white/30"
                />
                <span className="mt-2 block text-xs text-white/30">
                  One source per line: <code>Name | @handle</code>. YouTube channel URLs also work.
                </span>
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-xs font-medium uppercase tracking-wide text-white/40">Min seconds</span>
                  <input
                    type="number"
                    min={0}
                    value={minDuration}
                    onChange={(event) => setMinDuration(Number(event.target.value))}
                    className="mt-2 w-full rounded-lg border border-white/10 bg-black px-3 py-2 text-sm text-white outline-none transition-colors focus:border-white/30"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-medium uppercase tracking-wide text-white/40">Max seconds</span>
                  <input
                    type="number"
                    min={0}
                    value={maxDuration}
                    onChange={(event) => setMaxDuration(Number(event.target.value))}
                    className="mt-2 w-full rounded-lg border border-white/10 bg-black px-3 py-2 text-sm text-white outline-none transition-colors focus:border-white/30"
                  />
                </label>
              </div>

              <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-white">{draft.name}</p>
                    <p className="mt-1 text-xs text-white/40">ID: {draft.id}</p>
                  </div>
                  <p className="text-right text-sm text-white/50">
                    {draft.sources.length} source{draft.sources.length === 1 ? "" : "s"}
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-5 p-5">
              <section>
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-white">Catalog Preview</h3>
                    <p className="mt-1 text-xs text-white/40">
                      {catalog
                        ? `${preview.totalVideos.toLocaleString()} existing videos match these sources.`
                        : "Catalog is still loading."}
                    </p>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  {preview.sourcePreviews.map((source) => (
                    <div key={source.source.handle} className="rounded-lg border border-white/10 bg-black p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-white">{source.source.name}</p>
                          <p className="mt-0.5 text-xs text-white/35">{source.source.handle}</p>
                        </div>
                        <span className="shrink-0 rounded-full bg-white/10 px-2 py-1 text-xs text-white/60">
                          {source.videoCount.toLocaleString()}
                        </span>
                      </div>
                      {source.matchedStations.length > 0 && (
                        <p className="mt-2 text-xs text-white/35">
                          Already appears in {source.matchedStations.join(", ")}
                        </p>
                      )}
                      {source.sampleVideos.length > 0 ? (
                        <ul className="mt-3 space-y-1.5">
                          {source.sampleVideos.map((video) => (
                            <li key={video.id} className="truncate text-xs text-white/45">
                              {video.title}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="mt-3 text-xs text-white/25">
                          No committed catalog matches yet. The PR catalog build can add this source.
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </section>

              <section className="grid gap-4 xl:grid-cols-2">
                <div>
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <h3 className="text-sm font-semibold text-white">stations.json</h3>
                    <button
                      onClick={() => copyText("json", jsonSnippet)}
                      className="rounded-lg bg-white/10 px-3 py-1.5 text-xs text-white transition-colors hover:bg-white/15"
                    >
                      {copied === "json" ? "Copied" : "Copy JSON"}
                    </button>
                  </div>
                  <textarea
                    readOnly
                    value={jsonSnippet}
                    rows={12}
                    className="w-full resize-none rounded-lg border border-white/10 bg-black p-3 font-mono text-xs text-white/70 outline-none"
                  />
                </div>

                <div>
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <h3 className="text-sm font-semibold text-white">PR Export</h3>
                    <button
                      onClick={() => copyText("pr", prExport)}
                      className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-red-500"
                    >
                      {copied === "pr" ? "Copied" : "Copy PR"}
                    </button>
                  </div>
                  <textarea
                    readOnly
                    value={prExport}
                    rows={12}
                    className="w-full resize-none rounded-lg border border-white/10 bg-black p-3 font-mono text-xs text-white/70 outline-none"
                  />
                </div>
              </section>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
