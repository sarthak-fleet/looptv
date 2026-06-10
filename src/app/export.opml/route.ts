import stations from "../../../channels.config";

export const dynamic = "force-static";

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * YouTube's RSS endpoint only accepts `channel_id` (or legacy usernames —
 * NOT @handles, which 404 for most channels). `channelId` is resolved once
 * per source and committed in stations.json; the legacy `user=` URL is a
 * best-effort fallback for any source that lacks one.
 */
function feedUrl(src: { handle: string; channelId?: string }): string {
  return src.channelId
    ? `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(src.channelId)}`
    : `https://www.youtube.com/feeds/videos.xml?user=${encodeURIComponent(src.handle.replace(/^@/, ""))}`;
}

/**
 * /export.opml — every station + channel as a hierarchical OPML 2.0
 * outline. Podcast / RSS readers consume this directly to subscribe to
 * each channel's YouTube RSS feed.
 */
export function GET() {
  const items = stations
    .map(
      (station) => `    <outline text="${escapeXml(station.name)}" title="${escapeXml(station.name)}">
${station.sources
  .map(
    (src) => `      <outline type="rss"
               text="${escapeXml(src.name)}"
               title="${escapeXml(src.name)}"
               xmlUrl="${feedUrl(src)}"
               htmlUrl="https://www.youtube.com/${escapeXml(src.handle)}" />`,
  )
  .join("\n")}
    </outline>`,
    )
    .join("\n");

  const opml = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head>
    <title>LoopTV channels</title>
  </head>
  <body>
${items}
  </body>
</opml>
`;

  return new Response(opml, {
    status: 200,
    headers: {
      "Content-Type": "text/x-opml; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
      "Content-Disposition": "inline; filename=\"looptv-channels.opml\"",
    },
  });
}
