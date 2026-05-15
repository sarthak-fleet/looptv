import stations from "../../../channels.config";

export const dynamic = "force-static";

/**
 * Public JSON endpoint exposing the station + source map. Stable URL
 * so anyone building on top of LoopTV (mirrors, alternative players,
 * analytics) doesn't have to scrape the static-export HTML or
 * deep-link into the build artifact.
 */
export function GET() {
  return new Response(
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        stations,
      },
      null,
      2,
    ),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "public, max-age=3600",
      },
    },
  );
}
