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
  rejectedVideoCount: number;
  sampleVideos: Video[];
  matchedStations: string[];
  commonTags: string[];
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
  if (handleFromUrl) return handleFromUrl.replace(/\/+$/g, "");

  if (/^https?:\/\//i.test(withoutQuery)) return "";

  const handle = withoutQuery.replace(/^@?/, "@").replace(/\/+$/g, "");
  return handle.length > 1 ? handle : "";
}

export function parseSourceLines(
  input: string,
  defaults: { minDuration?: number; maxDuration?: number } = {}
): YouTubeSource[] {
  const minDuration = defaults.minDuration ?? DEFAULT_MIN_DURATION;
  const maxDuration = defaults.maxDuration ?? DEFAULT_MAX_DURATION;

  const seenHandles = new Set<string>();

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
    .filter((source) => {
      if (source.handle.length <= 1 || seenHandles.has(source.handle.toLowerCase())) return false;
      seenHandles.add(source.handle.toLowerCase());
      return true;
    });
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
        rejectedVideoCount: 0,
        sampleVideos: [],
        matchedStations: [],
        commonTags: [],
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

    const candidates = allVideos.filter((video) => video.source && matchedNames.has(video.source));
    const videos = candidates.filter((video) => passesDurationFilter(video, source));

    return {
      source,
      videoCount: videos.length,
      rejectedVideoCount: candidates.length - videos.length,
      sampleVideos: videos.slice(0, 3),
      matchedStations: [...matchedStations].sort(),
      commonTags: collectCommonTags(videos),
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

export function createStationsJsonPatch(draft: StationBuilderDraft): string {
  const entry = createStationConfigSnippet(draft)
    .split("\n")
    .map((line) => `  ${line}`)
    .join("\n");

  return [
    "*** Begin Patch",
    "*** Update File: stations.json",
    "@@",
    "-]",
    "+,",
    ...entry.split("\n").map((line) => `+${line}`),
    "+]",
    "*** End Patch",
  ].join("\n");
}

export function createStationPrExport(draft: StationBuilderDraft, preview: CatalogPreview): string {
  const sourceSummary = preview.sourcePreviews
    .map((source) => {
      const rejected = source.rejectedVideoCount > 0
        ? `, ${source.rejectedVideoCount.toLocaleString()} rejected by duration filters`
        : "";
      const tags = source.commonTags.length > 0 ? `, common tags: ${source.commonTags.join(", ")}` : "";
      return `- ${source.source.name} (${source.source.handle}): ${source.videoCount.toLocaleString()} catalog videos${rejected}${tags}`;
    })
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
    "Deterministic stations.json patch:",
    "```diff",
    createStationsJsonPatch(draft),
    "```",
  ].join("\n");
}

function passesDurationFilter(video: Video, source: YouTubeSource): boolean {
  if (source.minDuration !== undefined && video.duration < source.minDuration) return false;
  if (source.maxDuration !== undefined && video.duration > source.maxDuration) return false;
  return true;
}

function collectCommonTags(videos: Video[]): string[] {
  const counts = new Map<string, number>();

  for (const video of videos) {
    for (const tag of video.tags) {
      const normalized = tag.trim();
      if (!normalized) continue;
      counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 5)
    .map(([tag]) => tag);
}

function titleCase(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
