import Link from "next/link";

import stations from "../../../channels.config";

export const metadata = {
  title: "About — LoopTV",
  description:
    "How LoopTV works: a TV-style random YouTube channel surfer built on yt-dlp, NER tagging, and a static catalog. Zero API keys.",
};

export default function AboutPage() {
  const totalSources = stations.reduce((n, s) => n + s.sources.length, 0);
  return (
    <main className="mx-auto max-w-3xl px-6 py-12 text-zinc-300">
      <Link
        href="/"
        className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500 hover:text-zinc-300"
      >
        ← LoopTV
      </Link>
      <h1 className="mt-4 text-3xl font-medium tracking-tight text-white">
        About
      </h1>
      <p className="mt-3 text-sm text-zinc-400">
        LoopTV is a TV-style random video player on top of public YouTube
        channels. {stations.length} stations, {totalSources} channels, ~38K
        videos in the catalog.
      </p>

      <section className="mt-8 space-y-3 text-sm leading-6">
        <h2 className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">
          How it works
        </h2>
        <p>
          A weekly GitHub Action runs yt-dlp against each channel, merges the
          new videos into a static <code className="text-amber-400">catalog.json</code>,
          and runs HuggingFace NER (<code className="text-amber-400">dslim/bert-base-NER</code>)
          on untagged entries so they get topic chips.
        </p>
        <p>
          The frontend is a single static Next.js export served from Cloudflare
          Pages. There is no backend, no database, no auth, and no API key
          required for playback — videos play through the public YouTube IFrame
          player and the catalog is just a committed JSON file.
        </p>
        <p>
          Watched history lives in your browser&apos;s localStorage and never leaves
          your device.
        </p>
      </section>

      <section className="mt-8 space-y-3 text-sm leading-6">
        <h2 className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">
          Tips
        </h2>
        <ul className="list-disc pl-5 marker:text-zinc-600">
          <li>
            <code className="text-amber-400">→</code> or{" "}
            <code className="text-amber-400">n</code> — next video.
          </li>
          <li>
            <code className="text-amber-400">/</code> — search across the
            catalog.
          </li>
          <li>
            <Link href="/random" className="text-amber-400 hover:underline">
              /random
            </Link>{" "}
            — bounces to a random station.
          </li>
          <li>
            Videos that block embedding (YouTube error 101/150) are skipped
            automatically; the status bar tells you why.
          </li>
        </ul>
      </section>

      <section className="mt-8 space-y-3 text-sm leading-6">
        <h2 className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">
          Add your own station
        </h2>
        <p>
          Fork the repo, append a station to{" "}
          <code className="text-amber-400">stations.json</code>, run{" "}
          <code className="text-amber-400">pnpm run build:catalog</code>{" "}
          (requires <code className="text-amber-400">yt-dlp</code>), and deploy.
          That&apos;s it.
        </p>
      </section>
    </main>
  );
}
