"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { formatDuration, loadCatalog } from "@/lib/catalog";
import type { Video } from "@/lib/types";

interface TagSummary {
  tag: string;
  total: number;
  perStation: Record<string, number>;
}

interface Match {
  video: Video;
  stationId: string;
}

export default function TagsPage() {
  const [tags, setTags] = useState<TagSummary[] | null>(null);
  const [catalog, setCatalog] = useState<Awaited<ReturnType<typeof loadCatalog>> | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    loadCatalog()
      .then((cat) => {
        if (cancelled) return;
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setCatalog(cat);
        const counts = new Map<string, TagSummary>();
        for (const [stationId, station] of Object.entries(cat.stations)) {
          for (const v of station.videos) {
            for (const t of v.tags) {
              const key = t.toLowerCase();
              const entry = counts.get(key) ?? { tag: t, total: 0, perStation: {} };
              entry.total += 1;
              entry.perStation[stationId] = (entry.perStation[stationId] ?? 0) + 1;
              counts.set(key, entry);
            }
          }
        }
        const sorted = [...counts.values()].sort((a, b) => b.total - a.total);
        setTags(sorted);
      })
      .catch(() => {
        if (!cancelled) setTags([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const visibleTags = useMemo(() => {
    if (!tags) return null;
    if (!query.trim()) return tags.slice(0, 80);
    const q = query.trim().toLowerCase();
    return tags.filter((t) => t.tag.toLowerCase().includes(q)).slice(0, 80);
  }, [tags, query]);

  const matches = useMemo<Match[] | null>(() => {
    if (!selected || !catalog) return null;
    const out: Match[] = [];
    const sel = selected.toLowerCase();
    for (const [stationId, station] of Object.entries(catalog.stations)) {
      for (const v of station.videos) {
        if (v.tags.some((t) => t.toLowerCase() === sel)) {
          out.push({ video: v, stationId });
        }
      }
    }
    return out;
  }, [selected, catalog]);

  return (
    <main className="mx-auto max-w-4xl px-6 py-12 text-zinc-300">
      <Link
        href="/"
        className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500 hover:text-zinc-300"
      >
        ← LoopTV
      </Link>
      <h1 className="mt-4 text-3xl font-medium tracking-tight text-white">Tags</h1>
      <p className="mt-3 text-xs text-zinc-500">
        Topic chips extracted from every video by HuggingFace NER. Tap a tag
        to see matching videos across all stations.
      </p>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="filter tags…"
          className="w-full max-w-xs rounded-md border border-zinc-800 bg-zinc-950 px-3 py-1.5 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-amber-500 focus:outline-none"
        />
        {selected && (
          <button
            onClick={() => setSelected(null)}
            className="rounded-md border border-zinc-800 px-2 py-1 text-xs text-zinc-400 hover:text-amber-400"
          >
            clear #{selected}
          </button>
        )}
      </div>

      {!tags && <p className="mt-6 text-sm text-zinc-500">Loading catalog…</p>}
      {visibleTags && visibleTags.length > 0 && (
        <div className="mt-6 flex flex-wrap gap-2">
          {visibleTags.map((t) => (
            <button
              key={t.tag}
              onClick={() => setSelected(t.tag)}
              className={`rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.18em] transition-colors ${
                selected === t.tag
                  ? "border-amber-500 text-amber-400"
                  : "border-zinc-800 text-zinc-400 hover:text-amber-400"
              }`}
            >
              #{t.tag} <span className="ml-1 tabular-nums text-zinc-600">{t.total}</span>
            </button>
          ))}
        </div>
      )}

      {selected && matches && (
        <section className="mt-10 border-t border-zinc-800 pt-6">
          <h2 className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">
            #{selected} · {matches.length} video{matches.length === 1 ? "" : "s"}
          </h2>
          <ul className="mt-3 divide-y divide-zinc-800">
            {matches.slice(0, 60).map((m) => (
              <li key={m.video.id} className="flex items-baseline gap-3 py-2 text-sm">
                <Link href={`/${m.stationId}`} className="font-mono text-[10px] uppercase tracking-[0.18em] text-amber-400 hover:underline">
                  {m.stationId}
                </Link>
                <a
                  href={`https://www.youtube.com/watch?v=${m.video.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 truncate text-zinc-300 hover:text-amber-400"
                >
                  {m.video.title}
                </a>
                <span className="font-mono text-xs tabular-nums text-zinc-500">
                  {formatDuration(m.video.duration)}
                </span>
              </li>
            ))}
            {matches.length > 60 && (
              <li className="py-2 text-xs text-zinc-500">
                +{matches.length - 60} more (refine in /{matches[0]?.stationId ?? ""})
              </li>
            )}
          </ul>
        </section>
      )}
    </main>
  );
}
