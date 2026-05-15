"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { getBlockedSources, unblockSource } from "@/lib/watched";

export default function BlockedSourcesPage() {
  const [blocked, setBlocked] = useState<string[] | null>(null);

  const refresh = useCallback(() => {
    setBlocked([...getBlockedSources()].sort());
  }, []);

  useEffect(() => {
    // localStorage is client-only — refresh on mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [refresh]);

  function unblock(source: string) {
    unblockSource(source);
    setBlocked((prev) => (prev ?? []).filter((s) => s !== source));
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-12 text-zinc-300">
      <Link
        href="/"
        className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500 hover:text-zinc-300"
      >
        ← LoopTV
      </Link>
      <h1 className="mt-4 text-3xl font-medium tracking-tight text-white">
        Blocked sources
      </h1>
      <p className="mt-3 text-xs text-zinc-500">
        Channels you&apos;ve muted from the player&apos;s block button. Their videos
        won&apos;t surface in any station&apos;s rotation. Stored on this browser only.
      </p>

      {blocked == null && <p className="mt-8 text-sm text-zinc-500">Loading…</p>}
      {blocked && blocked.length === 0 && (
        <p className="mt-8 text-sm text-zinc-400">
          Nothing blocked. Use the &ldquo;block source&rdquo; button on a video
          you&apos;ve had enough of to add it here.
        </p>
      )}
      {blocked && blocked.length > 0 && (
        <ul className="mt-6 divide-y divide-zinc-800">
          {blocked.map((s) => (
            <li
              key={s}
              className="flex items-center justify-between py-3 text-sm"
            >
              <span className="text-zinc-200">{s}</span>
              <button
                type="button"
                onClick={() => unblock(s)}
                className="text-xs text-zinc-500 hover:text-emerald-400"
              >
                unblock
              </button>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
