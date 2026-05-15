"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { getStats, getWatchedIds, type WatchStats } from "@/lib/watched";

function formatSeconds(s: number): string {
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

export default function StatsPage() {
  const [stats, setStats] = useState<WatchStats | null>(null);
  const [uniqueWatched, setUniqueWatched] = useState(0);

  useEffect(() => {
    setStats(getStats());
    setUniqueWatched(getWatchedIds().size);
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
        Your watch stats
      </h1>
      <p className="mt-3 text-xs text-zinc-500">
        Pulled from this browser&apos;s localStorage. Never sent anywhere.
      </p>

      {!stats ? (
        <p className="mt-8 text-sm text-zinc-500">Loading…</p>
      ) : stats.totalWatched === 0 ? (
        <p className="mt-8 text-sm text-zinc-400">
          Nothing watched yet. Try{" "}
          <Link href="/random" className="text-amber-400 hover:underline">
            /random
          </Link>
          .
        </p>
      ) : (
        <>
          <section className="mt-8 grid grid-cols-3 gap-4">
            <Stat label="Videos" value={String(stats.totalWatched)} />
            <Stat label="Unique" value={String(uniqueWatched)} />
            <Stat label="Watch time" value={formatSeconds(stats.totalSeconds)} />
          </section>

          <section className="mt-10">
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">
              By station
            </p>
            <ol className="mt-2 divide-y divide-zinc-800">
              {Object.entries(stats.byStation)
                .sort(([, a], [, b]) => b - a)
                .map(([id, count], i) => (
                  <li key={id} className="flex items-center py-2 text-sm">
                    <span className="w-6 text-right tabular-nums text-zinc-500">{i + 1}</span>
                    <Link
                      href={`/${id}`}
                      className="ml-3 flex-1 truncate text-zinc-300 hover:text-amber-400"
                    >
                      {id}
                    </Link>
                    <span className="tabular-nums text-zinc-500">{count}</span>
                  </li>
                ))}
            </ol>
          </section>

          <section className="mt-10">
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">
              Top sources
            </p>
            <ol className="mt-2 divide-y divide-zinc-800">
              {Object.entries(stats.bySource)
                .sort(([, a], [, b]) => b - a)
                .slice(0, 20)
                .map(([source, count], i) => (
                  <li key={source} className="flex items-center py-2 text-sm">
                    <span className="w-6 text-right tabular-nums text-zinc-500">{i + 1}</span>
                    <span className="ml-3 flex-1 truncate text-zinc-300">{source}</span>
                    <span className="tabular-nums text-zinc-500">{count}</span>
                  </li>
                ))}
            </ol>
          </section>

          {stats.lastWatched && (
            <p className="mt-10 text-xs text-zinc-500">
              Last watched: {new Date(stats.lastWatched).toLocaleString()}
            </p>
          )}
        </>
      )}
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-950 p-3">
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500">
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-white">{value}</p>
    </div>
  );
}
