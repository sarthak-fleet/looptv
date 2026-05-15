import Link from "next/link";

import stations from "../../../channels.config";

export const metadata = {
  title: "Channels — LoopTV",
  description: "All YouTube channels sourced into LoopTV, grouped by station.",
};

export default function ChannelsPage() {
  return (
    <main className="mx-auto max-w-4xl px-6 py-12 text-zinc-300">
      <Link
        href="/"
        className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500 hover:text-zinc-300"
      >
        ← LoopTV
      </Link>
      <h1 className="mt-4 text-3xl font-medium tracking-tight text-white">
        Channels
      </h1>
      <p className="mt-3 text-sm text-zinc-400">
        Every channel sourced into the catalog, grouped by station.
        Click a YouTube handle to open the original channel.
      </p>

      <div className="mt-10 space-y-10">
        {stations.map((s) => (
          <section key={s.id}>
            <h2 className="font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500">
              {s.name}
            </h2>
            <p className="mt-1 text-xs text-zinc-500">{s.description}</p>
            <ul className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-sm md:grid-cols-3">
              {s.sources.map((src) => (
                <li key={src.handle}>
                  <a
                    href={`https://www.youtube.com/${src.handle}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-zinc-300 hover:text-amber-400"
                  >
                    {src.name}{" "}
                    <span className="text-[10px] text-zinc-600">{src.handle}</span>
                  </a>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <p className="mt-12 text-xs text-zinc-500">
        Channels listed here are external. LoopTV does not host their
        videos — playback uses the public YouTube IFrame player on the
        original creators&apos; content. Each creator owns their work.
      </p>
    </main>
  );
}
