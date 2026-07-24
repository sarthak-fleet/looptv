import Link from '@/components/AppLink';

import stations from '../../channels.config';
import catalogSummary from '../../public/catalog-summary.json';

const siteUrl = 'https://tv.significanthobbies.com';

export const metadata = {
  title: "LoopTV — channel-surf YouTube like it's TV",
  description:
    'Pick a station, hit play, and let random clips run nonstop. Topic-grouped public YouTube channels — no account, no API keys, no algorithm.',
  alternates: { canonical: siteUrl },
  openGraph: {
    title: "LoopTV — channel-surf YouTube like it's TV",
    description:
      'Pick a station, hit play, and let random clips run nonstop. No account, no API keys.',
    url: siteUrl,
    siteName: 'LoopTV',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: "LoopTV — channel-surf YouTube like it's TV",
    description:
      'Pick a station, hit play, and let random clips run nonstop. No account, no API keys.',
  },
};

export default function LandingPage() {
  // Honest, computed numbers — never hardcoded marketing figures.
  const totalSources = stations.reduce((n, s) => n + s.sources.length, 0);
  const totalVideos = catalogSummary.totalVideos;
  const totalStations = stations.length;

  const features = [
    {
      title: 'Stations, not a feed',
      body: `${totalStations} topic stations group ${totalSources} public YouTube channels — science, comedy, tech, talks, film, and more. Pick one and it plays.`,
    },
    {
      title: 'Random, nonstop playback',
      body: 'No autoplay rabbit hole, no recommendation algorithm. Clips shuffle within the station you chose, like flipping to a channel and leaving it on.',
    },
    {
      title: 'Yours, on your device',
      body: 'Watched history, blocked sources, and Smart Mix preferences live in your browser. No account to create, nothing leaves your device.',
    },
  ];

  const faqs = [
    {
      q: 'Do I need a YouTube or Google account?',
      a: "No. Playback runs through the public YouTube IFrame player. There's no sign-in anywhere in LoopTV.",
    },
    {
      q: 'Where does the catalog come from?',
      a: 'yt-dlp fetches public metadata from each channel listed in stations.json. A GitHub Action rebuilds the catalog weekly and commits a static catalog.json — no YouTube API key required.',
    },
    {
      q: "What happens when a video can't be embedded?",
      a: 'YouTube returns error 101 or 150 when a channel blocks embedding for a specific clip. The player catches it and immediately picks the next random video — no error toast, no interruption.',
    },
    {
      q: 'Where is my watch history stored?',
      a: "Entirely in your browser's localStorage. Clearing site data wipes it. There is no server-side account or database.",
    },
    {
      q: 'Can I add my own channels?',
      a: 'Yes — LoopTV is MIT-licensed. Fork the repo, append a station to stations.json, run pnpm run build:catalog (requires yt-dlp), and deploy.',
    },
  ];

  // Real station previews from stations.json — not fabricated marketing copy.
  const previewStations = stations.slice(0, 8);

  return (
    <main className="mx-auto max-w-5xl px-6 pb-20 pt-12 text-zinc-300">
      {/* ── Hero ── */}
      <section className="text-center sm:py-12">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">LoopTV</p>
        <h1 className="mx-auto mt-4 max-w-3xl text-4xl font-medium tracking-tight text-white sm:text-5xl md:text-6xl">
          Channel-surf YouTube like it&apos;s TV.
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-sm leading-6 text-zinc-400 sm:text-base">
          Pick a station, hit play, and let random clips run nonstop. {totalStations} stations,{' '}
          {totalSources} channels, {totalVideos.toLocaleString()} videos in today&apos;s catalog. No
          account, no API keys, no algorithm deciding what&apos;s next.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
          <Link
            href="/random"
            className="inline-flex min-h-11 items-center rounded-xl bg-red-600 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-red-500"
          >
            Start watching
          </Link>
          <Link
            href="/channels"
            className="text-sm text-zinc-400 hover:text-zinc-200 underline underline-offset-4"
          >
            Browse stations
          </Link>
        </div>
      </section>

      {/* ── Features ── */}
      <section className="mt-20">
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

      {/* ── Preview ── */}
      <section className="mt-20">
        <h2 className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">
          A glimpse of the dial
        </h2>
        <p className="mt-3 max-w-prose text-sm leading-6 text-zinc-400">
          Each tile is a real station in today&apos;s catalog. Click any one to tune in.
        </p>
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {previewStations.map((s) => {
            const count =
              (catalogSummary.stations as Record<string, { videoCount: number }>)[s.id]
                ?.videoCount ?? 0;
            return (
              <Link
                key={s.id}
                href={`/${s.id}`}
                className="group rounded-xl border border-white/10 bg-white/5 p-4 transition-colors hover:border-white/20 hover:bg-white/10"
              >
                <p className="text-sm font-semibold text-white group-hover:text-amber-400">
                  {s.name}
                </p>
                <p className="mt-1 text-[11px] leading-4 text-zinc-500">
                  {count.toLocaleString()} videos · {s.sources.length}{' '}
                  {s.sources.length === 1 ? 'channel' : 'channels'}
                </p>
              </Link>
            );
          })}
        </div>
        <div className="mt-4">
          <Link
            href="/channels"
            className="font-mono text-[11px] uppercase tracking-[0.18em] text-zinc-500 hover:text-amber-400"
          >
            See all {totalStations} stations →
          </Link>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section className="mt-20">
        <h2 className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">FAQ</h2>
        <dl className="mt-4 divide-y divide-white/10 rounded-xl border border-white/10 bg-white/5">
          {faqs.map((f) => (
            <div key={f.q} className="p-5">
              <dt className="text-sm font-semibold text-white">{f.q}</dt>
              <dd className="mt-2 text-xs leading-5 text-zinc-400">{f.a}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* ── CTA ── */}
      <section className="mt-20 rounded-xl border border-white/10 bg-white/5 p-8 text-center">
        <h2 className="text-2xl font-medium tracking-tight text-white">
          Ready to leave something good on in the background?
        </h2>
        <p className="mt-2 text-sm text-zinc-400">Tune to a random station and let it run.</p>
        <Link
          href="/random"
          className="mt-6 inline-flex min-h-11 items-center rounded-xl bg-red-600 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-red-500"
        >
          Pick a station
        </Link>
      </section>

      {/* ── Footer ── */}
      <footer className="mt-16 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-6 text-xs text-zinc-500">
        <p>The algorithm doesn&apos;t decide. You pick the station.</p>
        <nav className="flex gap-5">
          <Link href="/about" className="hover:text-zinc-300">
            About
          </Link>
          <Link href="/channels" className="hover:text-zinc-300">
            Channels
          </Link>
          <Link href="/privacy" className="hover:text-zinc-300">
            Privacy
          </Link>
          <Link href="/terms" className="hover:text-zinc-300">
            Terms
          </Link>
        </nav>
      </footer>
    </main>
  );
}
