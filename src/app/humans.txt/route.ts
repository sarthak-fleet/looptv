export const dynamic = "force-static";

const BODY = `/* TEAM */
Maintainer: Sarthak Agrawal
GitHub: sarthakagrawal927

/* THANKS */
yt-dlp — the catalog wouldn't exist without it.
HuggingFace / dslim/bert-base-NER — auto-tagging.
Every YouTube creator whose channel appears in /channels.

/* SITE */
Last updated: 2026-05-15
Software: Next.js (static export), React, Tailwind v4, Cloudflare Pages
`;

export function GET() {
  return new Response(BODY, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=86400",
    },
  });
}
