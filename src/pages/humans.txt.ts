import type { APIRoute } from 'astro';

export const prerender = true;

const body = `/* TEAM */
Maintainer: Sarthak Agrawal
GitHub: sarthakagrawal927

/* THANKS */
yt-dlp — the catalog wouldn't exist without it.
HuggingFace / dslim/bert-base-NER — auto-tagging.
Every YouTube creator whose channel appears in /channels.

/* SITE */
Last updated: 2026-07-24
Software: Astro (static), React islands, Tailwind v4, Cloudflare Pages
`;

export const GET: APIRoute = () =>
  new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=86400',
    },
  });
