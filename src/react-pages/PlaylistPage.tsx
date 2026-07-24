import Link from '@/components/AppLink';
import { useEffect, useMemo, useState } from 'react';

import { formatDuration, loadCatalog } from '@/lib/catalog';
import type { Video } from '@/lib/types';

interface Entry {
  video: Video;
  stationId: string;
}

function readIds(): string[] {
  if (typeof window === 'undefined') return [];
  const params = new URLSearchParams(window.location.search);
  const raw = params.get('v') ?? '';
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => /^[A-Za-z0-9_-]{6,20}$/.test(s));
}

export default function PlaylistPage() {
  const [ids, setIds] = useState<string[]>([]);
  const [entries, setEntries] = useState<Entry[] | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIds(readIds());
  }, []);

  useEffect(() => {
    if (ids.length === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setEntries([]);
      return;
    }
    let cancelled = false;
    loadCatalog()
      .then((cat) => {
        if (cancelled) return;
        const want = new Set(ids);
        const found: Record<string, Entry> = {};
        for (const [stationId, station] of Object.entries(cat.stations)) {
          for (const v of station.videos) {
            if (want.has(v.id) && !found[v.id]) {
              found[v.id] = { video: v, stationId };
            }
          }
        }
        // Preserve the URL ordering.
        const ordered: Entry[] = [];
        for (const id of ids) {
          if (found[id]) ordered.push(found[id]);
        }
        setEntries(ordered);
      })
      .catch(() => {
        if (!cancelled) setEntries([]);
      });
    return () => {
      cancelled = true;
    };
  }, [ids]);

  const totalSeconds = useMemo(
    () => entries?.reduce((sum, e) => sum + e.video.duration, 0) ?? 0,
    [entries]
  );

  return (
    <main className="mx-auto max-w-3xl px-6 py-12 text-zinc-300">
      <Link
        href="/"
        className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500 hover:text-zinc-300"
      >
        ← LoopTV
      </Link>
      <h1 className="mt-4 text-3xl font-medium tracking-tight text-white">Shared playlist</h1>
      <p className="mt-3 text-xs text-zinc-500">
        Build a share URL like <code className="text-amber-400">/playlist?v=id1,id2,id3</code> and
        send it. The catalogue is matched on the receiving end so each viewer sees the videos that
        exist for them.
      </p>

      {entries == null && <p className="mt-8 text-sm text-zinc-500">Loading…</p>}
      {entries && ids.length === 0 && (
        <p className="mt-8 text-sm text-zinc-400">
          No <code>?v=</code> query supplied.
        </p>
      )}
      {entries && ids.length > 0 && entries.length === 0 && (
        <p className="mt-8 text-sm text-rose-300">
          None of those video IDs are in the catalogue. The links might be stale or the videos got
          deleted from YouTube.
        </p>
      )}
      {entries && entries.length > 0 && (
        <>
          <p className="mt-6 text-sm text-zinc-400">
            {entries.length} video{entries.length === 1 ? '' : 's'} ·{' '}
            <span className="tabular-nums">{formatDuration(totalSeconds)}</span> total
          </p>
          <ol className="mt-3 divide-y divide-zinc-800">
            {entries.map((e, i) => (
              <li key={e.video.id} className="flex items-baseline gap-3 py-3 text-sm">
                <span className="w-6 text-right tabular-nums text-zinc-500">{i + 1}</span>
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
              </li>
            ))}
          </ol>
        </>
      )}
    </main>
  );
}
