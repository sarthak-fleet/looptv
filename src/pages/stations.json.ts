import type { APIRoute } from 'astro';
import stations from '../../channels.config';

export const prerender = true;

export const GET: APIRoute = () =>
  new Response(
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        stations,
      },
      null,
      2
    ),
    {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'public, max-age=3600',
      },
    }
  );
