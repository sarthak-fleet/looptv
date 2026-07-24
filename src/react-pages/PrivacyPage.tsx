import Link from '@/components/AppLink';

export const metadata = {
  title: 'Privacy — LoopTV',
  description: 'LoopTV has no accounts and no backend. The privacy story is short.',
};

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12 text-zinc-300">
      <Link
        href="/"
        className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500 hover:text-zinc-300"
      >
        ← LoopTV
      </Link>
      <h1 className="mt-4 text-3xl font-medium tracking-tight text-white">Privacy</h1>
      <p className="mt-3 text-xs text-zinc-500">Last updated: 2026-05-15.</p>

      <p className="mt-6 text-sm leading-7">
        LoopTV has no accounts, no database, and no backend. There is nothing to log in to, and
        nothing personal is sent anywhere.
      </p>

      <h2 className="mt-8 text-base font-semibold text-white">What runs on your device</h2>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm marker:text-zinc-600">
        <li>
          Your watched-history list lives in browser localStorage and never leaves the browser.
        </li>
        <li>User preferences (default station, autoplay, mute) live in localStorage too.</li>
        <li>Clear them at any time from the browser&apos;s site settings.</li>
      </ul>

      <h2 className="mt-8 text-base font-semibold text-white">What hits third parties</h2>
      <p className="mt-2 text-sm leading-7">
        Video playback uses the public YouTube IFrame player loaded from{' '}
        <code className="text-amber-400">youtube.com</code>. YouTube sees video requests as it would
        on any site that embeds an iframe — see Google&apos;s privacy policy for what they do with
        that.
      </p>
    </main>
  );
}
