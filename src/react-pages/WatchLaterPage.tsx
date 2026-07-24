import Link from '@/components/AppLink';
import { useCallback, useEffect, useState } from 'react';

import { formatDuration, loadCatalog } from '@/lib/catalog';
import type { Video } from '@/lib/types';
import { getWatchLater, removeWatchLater } from '@/lib/watched';

interface QueueEntry {
  video: Video;
  stationId: string;
}

export default function WatchLaterPage() {
  const [entries, setEntries] = useState<QueueEntry[] | null>(null);

  const refresh = useCallback(async () => {
    const ids = new Set(getWatchLater());
    if (ids.size === 0) {
      setEntries([]);
      return;
    }
    const catalog = await loadCatalog();
    const out: QueueEntry[] = [];
    for (const [stationId, station] of Object.entries(catalog.stations)) {
      for (const v of station.videos) {
        if (ids.has(v.id)) out.push({ video: v, stationId });
      }
    }
    setEntries(out);
  }, []);

  useEffect(() => {
    // localStorage is client-only — refresh on mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [refresh]);

  function dropOne(id: string) {
    removeWatchLater(id);
    setEntries((prev) => prev?.filter((e) => e.video.id !== id) ?? null);
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-12 text-zinc-300">
      <Link
        href="/"
        className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500 hover:text-zinc-300"
      >
        ← LoopTV
      </Link>
      <h1 className="mt-4 text-3xl font-medium tracking-tight text-white">Watch later</h1>
      <p className="mt-3 text-xs text-zinc-500">
        Saved on this browser via the player&apos;s &ldquo;watch later&rdquo; bookmark.
      </p>

      {entries == null && <p className="mt-8 text-sm text-zinc-500">Loading…</p>}
      {entries && entries.length === 0 && (
        <p className="mt-8 text-sm text-zinc-400">
          Empty queue. Bookmark a video from the player and it&apos;ll appear here.
        </p>
      )}
      {entries && entries.length > 0 && (
        <ul className="mt-6 divide-y divide-zinc-800">
          {entries.map((e) => (
            <li key={e.video.id} className="flex items-baseline gap-3 py-3 text-sm">
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
              <span className="font-mono text-xs tabular-nums text-zinc-500">
                {formatDuration(e.video.duration)}
              </span>
              <button
                type="button"
                onClick={() => dropOne(e.video.id)}
                className="text-xs text-zinc-500 hover:text-rose-400"
                aria-label={`Remove ${e.video.title} from watch later`}
              >
                remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
