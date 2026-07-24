import type { APIRoute } from 'astro';

export const prerender = true;

export const GET: APIRoute = () =>
  new Response(
    JSON.stringify({
      name: 'LoopTV',
      short_name: 'LoopTV',
      description: 'TV-style random YouTube channel surfer.',
      start_url: '/',
      display: 'standalone',
      background_color: '#000000',
      theme_color: '#fbbf24',
      icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' }],
    }),
    {
      headers: { 'Content-Type': 'application/manifest+json; charset=utf-8' },
    }
  );
