import Link from "next/link";

export const metadata = { title: "Not found — LoopTV" };

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-6 text-center text-zinc-300">
      <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">
        404
      </p>
      <h1 className="mt-3 text-3xl font-medium tracking-tight text-white">
        Off air
      </h1>
      <p className="mt-3 text-sm text-zinc-400">
        That station isn&apos;t in the catalog. Try a random one.
      </p>
      <div className="mt-6 flex justify-center gap-4 text-sm">
        <Link href="/" className="text-amber-400 hover:underline">
          Home
        </Link>
        <Link href="/random" className="text-amber-400 hover:underline">
          Random
        </Link>
        <Link href="/channels" className="text-amber-400 hover:underline">
          Channels
        </Link>
      </div>
    </main>
  );
}
