import type { APIRoute } from 'astro';
import stations from '../../channels.config';

export const prerender = true;

const siteUrl = 'https://tv.significanthobbies.com';
const staticPaths = [
  '/',
  '/about',
  '/catalog',
  '/channels',
  '/privacy',
  '/terms',
  '/blocked',
  '/history',
  '/playlist',
  '/random',
  '/stats',
  '/tags',
  '/watchlater',
];

export const GET: APIRoute = () => {
  const paths = [...staticPaths, ...stations.map((station) => `/${station.id}`)];
  const urls = paths
    .map(
      (path) => `  <url>
    <loc>${new URL(path, siteUrl).toString()}</loc>
    <changefreq>weekly</changefreq>
    <priority>${path === '/' ? '1.0' : '0.8'}</priority>
  </url>`
    )
    .join('\n');

  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`,
    {
      headers: { 'Content-Type': 'application/xml; charset=utf-8' },
    }
  );
};
