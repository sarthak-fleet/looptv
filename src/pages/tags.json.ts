import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { APIRoute } from 'astro';
import stations from '../../channels.config';

export const prerender = true;

interface CatalogVideo {
  tags: string[];
}

interface CatalogShape {
  lastUpdated: string;
  stations: Record<string, { videos: CatalogVideo[] }>;
}

export const GET: APIRoute = async () => {
  let catalog: CatalogShape;
  try {
    const raw = await fs.readFile(path.join(process.cwd(), 'public', 'catalog.json'), 'utf8');
    catalog = JSON.parse(raw) as CatalogShape;
  } catch {
    return new Response(JSON.stringify({ tags: [] }), {
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    });
  }

  const stationIds = new Set(stations.map((station) => station.id));
  const counts = new Map<
    string,
    { tag: string; total: number; perStation: Record<string, number> }
  >();
  for (const [stationId, block] of Object.entries(catalog.stations)) {
    if (!stationIds.has(stationId)) continue;
    for (const video of block.videos) {
      for (const tag of video.tags) {
        const key = tag.toLowerCase();
        const entry = counts.get(key) ?? { tag, total: 0, perStation: {} };
        entry.total += 1;
        entry.perStation[stationId] = (entry.perStation[stationId] ?? 0) + 1;
        counts.set(key, entry);
      }
    }
  }

  const tags = [...counts.values()].sort((a, b) => b.total - a.total);
  return new Response(
    JSON.stringify(
      { generatedAt: new Date().toISOString(), catalogLastUpdated: catalog.lastUpdated, tags },
      null,
      2
    ),
    {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'public, max-age=3600',
      },
    }
  );
};
