"use client";

import { useEffect } from "react";

import stations from "../../../channels.config";

/**
 * /random — bounces to a random station. Useful for share links and
 * "I'm feeling lucky" entry points. Client-side redirect since the app
 * is statically exported (no server runtime).
 */
export default function RandomStation() {
  useEffect(() => {
    const pick = stations[Math.floor(Math.random() * stations.length)];
    window.location.replace(pick ? `/${pick.id}` : "/");
  }, []);

  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-950 p-8 text-zinc-300">
      <p className="font-mono text-sm">Tuning to a random station…</p>
    </main>
  );
}
