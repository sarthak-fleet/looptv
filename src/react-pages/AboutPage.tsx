import Link from '@/components/AppLink';

import stations from '../../channels.config';
import catalogSummary from '../../public/catalog-summary.json';

const siteUrl = 'https://tv.significanthobbies.com';

export const metadata = {
  title: 'About — LoopTV',
  description:
    'LoopTV turns public YouTube channels into TV-style stations that play random clips nonstop. No API keys, no account, no algorithm feed.',
  alternates: { canonical: `${siteUrl}/about` },
  openGraph: {
    title: "LoopTV — channel-surf YouTube like it's TV",
    description:
      'Pick a station, hit play, and let random clips run nonstop. Built from public YouTube channels — no API keys, no account.',
    url: `${siteUrl}/about`,
    siteName: 'LoopTV',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: "LoopTV — channel-surf YouTube like it's TV",
    description:
      'Pick a station, hit play, and let random clips run nonstop. No API keys, no account.',
  },
};

export default function AboutPage() {
  // Honest, computed numbers — never hardcoded marketing figures.
  const totalSources = stations.reduce((n, s) => n + s.sources.length, 0);
  const totalVideos = catalogSummary.totalVideos;

  const features = [
    {
      title: 'Stations, not a feed',
      body: `${stations.length} hand-built stations grouping ${totalSources} YouTube channels by topic — science, comedy, tech, talks, and more. Pick one and it plays.`,
    },
    {
      title: 'Random, nonstop playback',
      body: 'No autoplay rabbit hole, no recommendation algorithm. Clips shuffle within the station you chose, like flipping to a channel and leaving it on.',
    },
    {
      title: 'Yours, on your device',
      body: "Watched history, blocked sources, and your Smart Mix profile all live in your browser's localStorage. No account, nothing leaves your device.",
    },
  ];

  const steps = [
    {
      n: '1',
      title: 'Build the catalog',
      body: 'A weekly GitHub Action runs yt-dlp against each channel and merges new videos into a static catalog file. No YouTube API key needed.',
    },
    {
      n: '2',
      title: 'Tag with NER',
      body: 'HuggingFace NER (dslim/bert-base-NER) runs over untagged entries so videos pick up topic chips automatically.',
    },
    {
      n: '3',
      title: 'Press play',
      body: 'The frontend is a static Astro site with React islands. Videos play through the public YouTube IFrame player — blocked embeds are skipped automatically.',
    },
  ];

  return (
    <main className="mx-auto max-w-3xl px-6 py-12 text-zinc-300">
      <Link
        href="/"
        className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500 hover:text-zinc-300"
      >
        ← LoopTV
      </Link>

      {/* Hero */}
      <section className="mt-6">
        <h1 className="text-3xl font-medium tracking-tight text-white sm:text-4xl">
          Channel-surf YouTube like it&apos;s TV.
        </h1>
        <p className="mt-3 max-w-prose text-sm leading-6 text-zinc-400">
          LoopTV groups public YouTube channels into topic stations and plays random clips nonstop —
          no account, no API keys, no algorithm deciding what&apos;s next. {stations.length}{' '}
          stations, {totalSources} channels, {totalVideos.toLocaleString()} videos in the catalog
          today.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/"
            className="inline-flex min-h-11 items-center rounded-xl bg-red-600 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-red-500"
          >
            Start watching
          </Link>
          <Link
            href="/channels"
            className="inline-flex min-h-11 items-center rounded-xl bg-white/10 px-5 py-3 text-sm text-white transition-colors hover:bg-white/15"
          >
            Browse stations
          </Link>
        </div>
      </section>

      {/* Features */}
      <section className="mt-12">
        <h2 className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">
          Why LoopTV
        </h2>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {features.map((f) => (
            <div key={f.title} className="rounded-xl border border-white/10 bg-white/5 p-5">
              <h3 className="text-sm font-semibold text-white">{f.title}</h3>
              <p className="mt-2 text-xs leading-5 text-zinc-400">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="mt-12">
        <h2 className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">
          How it works
        </h2>
        <ol className="mt-4 space-y-4">
          {steps.map((s) => (
            <li key={s.n} className="flex gap-4">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/15 font-mono text-xs text-amber-400">
                {s.n}
              </span>
              <div>
                <h3 className="text-sm font-semibold text-white">{s.title}</h3>
                <p className="mt-1 text-xs leading-5 text-zinc-400">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* Tips */}
      <section className="mt-12 space-y-3 text-sm leading-6">
        <h2 className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">Tips</h2>
        <ul className="list-disc pl-5 marker:text-zinc-600">
          <li>
            <code className="text-amber-400">→</code> or <code className="text-amber-400">n</code> —
            next video.
          </li>
          <li>
            <code className="text-amber-400">/</code> — search across the catalog.
          </li>
          <li>
            <Link href="/random" className="text-amber-400 hover:underline">
              /random
            </Link>{' '}
            — bounces to a random station.
          </li>
        </ul>
      </section>

      {/* Add your own */}
      <section className="mt-12 space-y-3 text-sm leading-6">
        <h2 className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">
          Add your own station
        </h2>
        <p className="text-zinc-400">
          Fork the repo, append a station to <code className="text-amber-400">stations.json</code>,
          run <code className="text-amber-400">pnpm run build:catalog</code> (requires{' '}
          <code className="text-amber-400">yt-dlp</code>), and deploy. That&apos;s it.
        </p>
      </section>

      {/* Closing CTA */}
      <section className="mt-12 rounded-xl border border-white/10 bg-white/5 p-6 text-center">
        <p className="text-sm text-zinc-300">Ready to leave something good on in the background?</p>
        <Link
          href="/"
          className="mt-4 inline-flex min-h-11 items-center rounded-xl bg-red-600 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-red-500"
        >
          Open LoopTV
        </Link>
      </section>
    </main>
  );
}
