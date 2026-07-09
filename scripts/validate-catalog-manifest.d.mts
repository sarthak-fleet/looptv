export const DEFAULT_THRESHOLDS: Record<string, number>;

export type VideoMap = Record<string, { t: string; d: number }>;
export interface CatalogManifest {
  thresholds: Record<string, number>;
  totalVideos: number;
  stations: Record<string, number>;
  videos?: Record<string, VideoMap>;
}
export interface VideoDiff {
  added: string[];
  removed: string[];
  titleChanged: Array<{ id: string; from: string; to: string }>;
  removedTitles: Record<string, string>;
}
export interface ManifestComparison {
  violations: string[];
  warnings: string[];
  videoDiffs: Record<string, VideoDiff>;
}

export function stationCounts(catalog: unknown): Record<string, number>;
export function stationVideos(catalog: unknown): Record<string, VideoMap>;
export function diffStationVideos(expected?: VideoMap, actual?: VideoMap): VideoDiff;
export function compareToManifest(
  counts: Record<string, number>,
  manifest: CatalogManifest,
  currentVideos?: Record<string, VideoMap>
): ManifestComparison;
export function formatDiffLines(result: ManifestComparison): string[];
export function formatVideoDiffLines(result: ManifestComparison): string[];
export function formatMarkdownSummary(
  result: ManifestComparison,
  options?: { overridden?: boolean }
): string;
export function buildManifest(
  counts: Record<string, number>,
  thresholds: Record<string, number>
): CatalogManifest;
export function buildManifest(
  counts: Record<string, number>,
  thresholds: Record<string, number>,
  videos: Record<string, VideoMap>
): CatalogManifest & { videos: Record<string, VideoMap> };
export function buildManifest(
  counts: Record<string, number>,
  thresholds: Record<string, number>,
  videos?: Record<string, VideoMap>
): CatalogManifest;
