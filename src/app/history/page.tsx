"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { loadCatalog } from "@/lib/catalog";
import type { Video } from "@/lib/types";
import { getWatchedIds } from "@/lib/watched";

interface Entry {
  video: Video;
  stationId: string;
  source?: string;
}

export default function HistoryPage() {
  const [entries, setEntries] = useState<Entry[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    const watched = getWatchedIds();
    if (watched.size === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setEntries([]);
      return;
    }
    loadCatalog()
      .then((cat) => {
        if (cancelled) return;
        const out: Entry[] = [];
        for (const [stationId, station] of Object.entries(cat.stations)) {
          for (const v of station.videos) {
            if (watched.has(v.id)) {
              out.push({ video: v, stationId, source: v.source });
            }
          }
        }
        // No timestamp in localStorage — keep catalog order, surface station grouping.
        setEntries(out);
      })
      .catch(() => {
        if (!cancelled) setEntries([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="mx-auto max-w-3xl px-6 py-12 text-zinc-300">
      <Link
        href="/"
        className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500 hover:text-zinc-300"
      >
        ← LoopTV
      </Link>
      <h1 className="mt-4 text-3xl font-medium tracking-tight text-white">
        Watch history
      </h1>
      <p className="mt-3 text-xs text-zinc-500">
        Pulled from this browser&apos;s localStorage. Never sent anywhere.
      </p>

      {entries == null && <p className="mt-8 text-sm text-zinc-500">Loading…</p>}
      {entries && entries.length === 0 && (
        <p className="mt-8 text-sm text-zinc-400">
          Nothing watched yet. Try{" "}
          <Link href="/random" className="text-amber-400 hover:underline">
            /random
          </Link>
          .
        </p>
      )}
      {entries && entries.length > 0 && (
        <>
          <p className="mt-6 text-sm text-zinc-400">
            {entries.length} video{entries.length === 1 ? "" : "s"} watched.
          </p>
          <ul className="mt-3 divide-y divide-zinc-800">
            {entries.map((e) => (
              <li key={e.video.id} className="flex items-baseline gap-3 py-2 text-sm">
                <Link
                  href={`/${e.stationId}`}
                  className="font-mono text-[10px] uppercase tracking-[0.18em] text-amber-400 hover:underline"
                >
                  {e.stationId}
                </Link>
                <a
                  href={`https://www.youtube.com/watch?v=${e.video.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 truncate text-zinc-300 hover:text-amber-400"
                >
                  {e.video.title}
                </a>
                {e.source && (
                  <span className="hidden font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-600 sm:inline">
                    {e.source}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </main>
  );
}
