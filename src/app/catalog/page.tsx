import type { Metadata } from 'next';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import Link from 'next/link';
import stationsConfig from '../../../channels.config';

export const dynamic = 'force-static';

const siteUrl = 'https://tv.significanthobbies.com';

type Video = {
  id: string;
  title: string;
  duration: number;
  date: string;
  tags: string[];
  source?: string;
  viewCount?: number;
};

type CatalogFile = {
  lastUpdated: string;
  generatedAt: string;
  stations: Record<string, { videos: Video[]; categoryVideoIds?: string[] }>;
};

type SummaryFile = {
  lastUpdated: string;
  totalVideos: number;
  stations: Record<string, { videoCount: number }>;
};

function loadCatalog(): CatalogFile {
  const path = join(process.cwd(), 'public/catalog.json');
  return JSON.parse(readFileSync(path, 'utf8')) as CatalogFile;
}

function loadSummary(): SummaryFile {
  const path = join(process.cwd(), 'public/catalog-summary.json');
  return JSON.parse(readFileSync(path, 'utf8')) as SummaryFile;
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function formatViews(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

export const metadata: Metadata = {
  title: 'Catalog — 8,760 curated videos across 16 stations',
  description:
    'Browse the full LoopTV catalog: 16 stations, 122 YouTube channels, ~8,760 curated videos. Per-station video counts, top videos, and downloadable JSON.',
  alternates: { canonical: '/catalog' },
  openGraph: {
    title: 'LoopTV Catalog — 8,760 curated videos',
    description:
      'Browse all 16 stations and 8,760 curated YouTube videos. Download the full catalog as JSON.',
    url: `${siteUrl}/catalog`,
    type: 'website',
  },
};

export default function CatalogPage() {
  const catalog = loadCatalog();
  const summary = loadSummary();
  const totalVideos = summary.totalVideos;

  // Build station info with top videos
  const stationData = stationsConfig.map((station) => {
    const stationCat = catalog.stations[station.id];
    const videos = stationCat?.videos ?? [];
    const topVideos = [...videos]
      .sort((a, b) => (b.viewCount ?? 0) - (a.viewCount ?? 0))
      .slice(0, 5);
    const sources = station.sources.map((s) => s.name);
    return {
      id: station.id,
      name: station.name,
      description: station.description,
      videoCount: videos.length,
      sources,
      sourceCount: station.sources.length,
      topVideos,
    };
  });

  // Build VideoObject JSON-LD for top videos across all stations
  const allTopVideos = stationData.flatMap((s) =>
    s.topVideos.map((v) => ({ ...v, stationId: s.id, stationName: s.name }))
  );

  const videoJsonLd = allTopVideos.map((v) => ({
    '@type': 'VideoObject',
    '@id': `${siteUrl}/catalog#${v.id}`,
    name: v.title,
    url: `https://www.youtube.com/watch?v=${v.id}`,
    embedUrl: `https://www.youtube.com/embed/${v.id}`,
    thumbnailUrl: `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`,
    contentUrl: `https://www.youtube.com/watch?v=${v.id}`,
    uploadDate: v.date || undefined,
    duration: v.duration > 0 ? `PT${v.duration}S` : undefined,
    interactionStatistic: v.viewCount
      ? {
          '@type': 'InteractionCounter',
          interactionType: 'https://schema.org/WatchAction',
          userInteractionCount: v.viewCount,
        }
      : undefined,
    isPartOf: {
      '@type': 'CollectionPage',
      name: v.stationName,
      url: `${siteUrl}/${v.stationId}`,
    },
  }));

  const collectionJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: 'LoopTV Video Catalog',
    description: `${totalVideos} curated YouTube videos across ${stationsConfig.length} stations and ${stationsConfig.reduce((n, s) => n + s.sources.length, 0)} channels.`,
    url: `${siteUrl}/catalog`,
    hasPart: videoJsonLd,
  };

  return (
    <div className="min-h-screen bg-black text-zinc-200">
      <script
        type="application/ld+json"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: static JSON-LD
        dangerouslySetInnerHTML={{ __html: JSON.stringify(collectionJsonLd) }}
      />
      <div className="mx-auto max-w-5xl px-6 py-12">
        <nav className="mb-8 text-sm text-zinc-500">
          <Link href="/" className="hover:text-zinc-300 underline">
            LoopTV
          </Link>{' '}
          / <span className="text-zinc-300">catalog</span>
        </nav>

        <h1 className="text-4xl font-bold tracking-tight text-white mb-3">Video Catalog</h1>
        <p className="text-zinc-400 max-w-2xl mb-8">
          {totalVideos.toLocaleString()} curated YouTube videos across {stationsConfig.length}{' '}
          stations and {stationsConfig.reduce((n, s) => n + s.sources.length, 0)} channels. The
          catalog is rebuilt weekly via GitHub Action using yt-dlp and committed as static JSON.
        </p>

        <div className="grid grid-cols-3 gap-4 mb-10">
          <div className="bg-zinc-900 rounded-lg p-4 border border-zinc-800">
            <div className="text-2xl font-bold text-white">{totalVideos.toLocaleString()}</div>
            <div className="text-sm text-zinc-500">Total videos</div>
          </div>
          <div className="bg-zinc-900 rounded-lg p-4 border border-zinc-800">
            <div className="text-2xl font-bold text-white">{stationsConfig.length}</div>
            <div className="text-sm text-zinc-500">Stations</div>
          </div>
          <div className="bg-zinc-900 rounded-lg p-4 border border-zinc-800">
            <div className="text-2xl font-bold text-white">
              {stationsConfig.reduce((n, s) => n + s.sources.length, 0)}
            </div>
            <div className="text-sm text-zinc-500">YouTube channels</div>
          </div>
        </div>

        <div className="mb-10 flex gap-3">
          <a
            href="/catalog.json"
            className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition"
            download
          >
            Download catalog.json
          </a>
          <a
            href="/catalog-summary.json"
            className="inline-flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 px-4 py-2 rounded-lg text-sm font-medium transition border border-zinc-700"
            download
          >
            Download summary
          </a>
        </div>

        <div className="space-y-10">
          {stationData.map((station) => (
            <section key={station.id} id={station.id}>
              <div className="flex items-baseline justify-between mb-3">
                <div>
                  <h2 className="text-xl font-semibold text-white">
                    <Link href={`/${station.id}`} className="hover:text-blue-400">
                      {station.name}
                    </Link>
                  </h2>
                  <p className="text-sm text-zinc-500 mt-0.5">{station.description}</p>
                </div>
                <div className="text-right text-sm">
                  <span className="text-zinc-300 font-medium">
                    {station.videoCount.toLocaleString()}
                  </span>
                  <span className="text-zinc-600 ml-1">videos</span>
                </div>
              </div>

              <div className="text-xs text-zinc-600 mb-4">
                {station.sourceCount} channel{station.sourceCount !== 1 ? 's' : ''}:{' '}
                {station.sources.join(', ')}
              </div>

              {station.topVideos.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm border border-zinc-800 rounded-lg overflow-hidden">
                    <thead className="bg-zinc-900 text-zinc-500">
                      <tr>
                        <th className="text-left px-3 py-2 font-medium">Title</th>
                        <th className="text-left px-3 py-2 font-medium">Channel</th>
                        <th className="text-right px-3 py-2 font-medium">Views</th>
                        <th className="text-right px-3 py-2 font-medium">Duration</th>
                      </tr>
                    </thead>
                    <tbody>
                      {station.topVideos.map((v) => (
                        <tr key={v.id} className="border-t border-zinc-800">
                          <td className="px-3 py-2">
                            <a
                              href={`https://www.youtube.com/watch?v=${v.id}`}
                              target="_blank"
                              rel="noopener"
                              className="text-zinc-200 hover:text-blue-400"
                            >
                              {v.title}
                            </a>
                          </td>
                          <td className="px-3 py-2 text-zinc-500">{v.source ?? '—'}</td>
                          <td className="px-3 py-2 text-right text-zinc-400 tabular-nums">
                            {v.viewCount ? formatViews(v.viewCount) : '—'}
                          </td>
                          <td className="px-3 py-2 text-right text-zinc-500 tabular-nums">
                            {v.duration > 0 ? formatDuration(v.duration) : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="mt-3">
                <Link href={`/${station.id}`} className="text-sm text-blue-400 hover:text-blue-300">
                  Play {station.name} station &rarr;
                </Link>
              </div>
            </section>
          ))}
        </div>

        <section className="mt-12 text-sm text-zinc-600 border-t border-zinc-800 pt-6">
          <h2 className="text-lg font-medium text-zinc-400 mb-2">Catalog provenance</h2>
          <p>
            Videos are fetched from public YouTube channels listed in{' '}
            <code className="text-zinc-500">stations.json</code> using yt-dlp. A GitHub Action (
            <code className="text-zinc-500">.github/workflows/update-catalog.yml</code>) runs
            weekly, fetches new uploads, applies duration and view-count quality filters, and
            commits the updated <code className="text-zinc-500">catalog.json</code>. NER tagging via
            HuggingFace (dslim/bert-base-NER) adds entity tags to untagged videos only. Last
            updated: {catalog.lastUpdated}.
          </p>
        </section>
      </div>
    </div>
  );
}
