import Link from "next/link";

export const metadata = {
  title: "Terms — LoopTV",
  description: "Use of LoopTV is provided as-is. Playback uses YouTube's public IFrame player.",
};

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12 text-zinc-300">
      <Link
        href="/"
        className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500 hover:text-zinc-300"
      >
        ← LoopTV
      </Link>
      <h1 className="mt-4 text-3xl font-medium tracking-tight text-white">Terms</h1>
      <p className="mt-3 text-xs text-zinc-500">Last updated: 2026-05-15.</p>

      <h2 className="mt-8 text-base font-semibold text-white">No hosting</h2>
      <p className="mt-2 text-sm leading-7">
        LoopTV does not host any video content. Playback uses the public
        YouTube IFrame player on creator-owned content; this is the same
        embed mechanism any third-party website can use. All videos
        remain under their original creators&apos; rights.
      </p>

      <h2 className="mt-8 text-base font-semibold text-white">Use</h2>
      <p className="mt-2 text-sm leading-7">
        Free to use for personal and commercial purposes. Fork the repo
        if you want to mirror or extend it.
      </p>

      <h2 className="mt-8 text-base font-semibold text-white">No warranty</h2>
      <p className="mt-2 text-sm leading-7">
        Provided as-is. Videos may break embedding (YouTube error
        101/150), get removed, or change ownership at any time.
      </p>
    </main>
  );
}
