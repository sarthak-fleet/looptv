import type { APIRoute } from 'astro';
import stations from '../../channels.config';

export const prerender = true;

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function feedUrl(source: { handle: string; channelId?: string }): string {
  return source.channelId
    ? `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(source.channelId)}`
    : `https://www.youtube.com/feeds/videos.xml?user=${encodeURIComponent(source.handle.replace(/^@/, ''))}`;
}

export const GET: APIRoute = () => {
  const items = stations
    .map(
      (
        station
      ) => `    <outline text="${escapeXml(station.name)}" title="${escapeXml(station.name)}">
${station.sources
  .map(
    (source) => `      <outline type="rss"
               text="${escapeXml(source.name)}"
               title="${escapeXml(source.name)}"
               xmlUrl="${feedUrl(source)}"
               htmlUrl="https://www.youtube.com/${escapeXml(source.handle)}" />`
  )
  .join('\n')}
    </outline>`
    )
    .join('\n');

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head>
    <title>LoopTV channels</title>
  </head>
  <body>
${items}
  </body>
</opml>
`;

  return new Response(body, {
    headers: {
      'Content-Type': 'text/x-opml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
      'Content-Disposition': 'inline; filename="looptv-channels.opml"',
    },
  });
};
