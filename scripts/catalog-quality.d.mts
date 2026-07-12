export const MIN_VIEW_COUNT: number;
export const MAX_VIDEOS_PER_SOURCE: number;
export const TOP_PICK_BAND_SIZE: number;

export function resolveMaxVideos(source?: { maxVideos?: number }): number;

export function calcPercentile(count: number): number;
export function resolveTopPercentile(
  source: { topPercentile?: number },
  filteredCount: number
): number;
export function hasViewCountsInJsonl(
  filePath: string,
  fs: { readFileSync(path: string, encoding: string): string }
): boolean;
export function qualifiesRawVideo(
  raw: { duration?: number; view_count?: number },
  minDur: number,
  maxDur: number
): boolean;
export function applySourceQualityFilter<T extends { view_count?: number; duration?: number }>(
  sourceVideos: T[],
  source: { topPercentile?: number; maxVideos?: number }
): { filtered: T[]; pct: number | null; mode: 'preserved' | 'selected' };
export function validateCatalogVideo(
  video: { id?: string; viewCount?: number },
  context?: string
): void;
export function validateCatalog(catalog: unknown): void;
