import type { Catalog, StationConfig, Video, YouTubeSource } from "./types";

export interface StationBuilderDraft {
  id: string;
  name: string;
  description: string;
  sources: YouTubeSource[];
}

export interface SourcePreview {
  source: YouTubeSource;
  videoCount: number;
  sampleVideos: Video[];
  matchedStations: string[];
}

export interface CatalogPreview {
  totalVideos: number;
  sourcePreviews: SourcePreview[];
}

const DEFAULT_MIN_DURATION = 60;
const DEFAULT_MAX_DURATION = 1800;

export function slugifyStationId(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export function normalizeYouTubeHandle(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";

  const withoutQuery = trimmed.split(/[?#]/)[0];
  const handleFromUrl = withoutQuery.match(/youtube\.com\/(@[^/]+)/i)?.[1];
  const raw = handleFromUrl ?? withoutQuery.replace(/^https?:\/\/(www\.)?youtube\.com\//i, "");
  const handle = raw.replace(/^@?/, "@").replace(/\/+$/g, "");
  return handle.length > 1 ? handle : "";
}

export function parseSourceLines(
  input: string,
  defaults: { minDuration?: number; maxDuration?: number } = {}
): YouTubeSource[] {
  const minDuration = defaults.minDuration ?? DEFAULT_MIN_DURATION;
  const maxDuration = defaults.maxDuration ?? DEFAULT_MAX_DURATION;

  return input
    .split(/\r?\n|,/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [rawName, rawHandle] = line.includes("|")
        ? line.split("|").map((part) => part.trim())
        : ["", line];
      const handle = normalizeYouTubeHandle(rawHandle ?? rawName);
      const fallbackName = handle.replace(/^@/, "").replace(/[-_.]+/g, " ");
      return {
        name: rawName || titleCase(fallbackName),
        handle,
        minDuration,
        maxDuration,
      };
    })
    .filter((source) => source.handle.length > 1);
}

export function createStationDraft(input: {
  name: string;
  description: string;
  sourcesText: string;
  minDuration?: number;
  maxDuration?: number;
}): StationBuilderDraft {
  const name = input.name.trim();
  const sources = parseSourceLines(input.sourcesText, {
    minDuration: input.minDuration,
    maxDuration: input.maxDuration,
  });

  return {
    id: slugifyStationId(name || sources[0]?.name || "custom-station") || "custom-station",
    name: name || "Custom Station",
    description:
      input.description.trim() ||
      `${sources.slice(0, 3).map((source) => source.name).join(", ")}${sources.length > 3 ? ", and more" : ""}`,
    sources,
  };
}

export function buildCatalogPreview(
  catalog: Catalog | null,
  draft: StationBuilderDraft,
  stations: StationConfig[]
): CatalogPreview {
  if (!catalog) {
    return {
      totalVideos: 0,
      sourcePreviews: draft.sources.map((source) => ({
        source,
        videoCount: 0,
        sampleVideos: [],
        matchedStations: [],
      })),
    };
  }

  const allVideos = Object.values(catalog.stations).flatMap((station) => station.videos);

  const sourcePreviews = draft.sources.map((source) => {
    const matchedNames = new Set([source.name]);
    const matchedStations = new Set<string>();
    const normalizedHandle = source.handle.toLowerCase();
    const normalizedName = source.name.toLowerCase();

    for (const station of stations) {
      for (const existingSource of station.sources) {
        if (
          existingSource.handle.toLowerCase() === normalizedHandle ||
          existingSource.name.toLowerCase() === normalizedName
        ) {
          matchedNames.add(existingSource.name);
          matchedStations.add(station.name);
        }
      }
    }

    const videos = allVideos.filter((video) => video.source && matchedNames.has(video.source));

    return {
      source,
      videoCount: videos.length,
      sampleVideos: videos.slice(0, 3),
      matchedStations: [...matchedStations].sort(),
    };
  });

  return {
    totalVideos: sourcePreviews.reduce((sum, source) => sum + source.videoCount, 0),
    sourcePreviews,
  };
}

export function createStationConfigSnippet(draft: StationBuilderDraft): string {
  return JSON.stringify(draft, null, 2);
}

export function createStationPrExport(draft: StationBuilderDraft, preview: CatalogPreview): string {
  const sourceSummary = preview.sourcePreviews
    .map((source) => `- ${source.source.name} (${source.source.handle}): ${source.videoCount.toLocaleString()} catalog videos`)
    .join("\n");

  return [
    `Title: Add ${draft.name} station`,
    "",
    "Summary:",
    `- Add a new LoopTV station with ${draft.sources.length} YouTube source${draft.sources.length === 1 ? "" : "s"}.`,
    `- Current catalog preview finds ${preview.totalVideos.toLocaleString()} matching videos before the catalog rebuild.`,
    "- Run `pnpm run build:catalog` in the PR to fetch new videos and refresh `public/catalog.json`.",
    "",
    "Catalog preview:",
    sourceSummary || "- No sources yet.",
    "",
    "stations.json entry:",
    "```json",
    createStationConfigSnippet(draft),
    "```",
  ].join("\n");
}

function titleCase(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
