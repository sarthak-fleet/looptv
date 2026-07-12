export function findSourceByHandle(handle: string): Record<string, unknown> | undefined;
export function cacheQualifies(options: {
  fresh: boolean;
  cachedLines: number;
  hasViewCounts: boolean;
  ageDays: number;
  trustedApi?: boolean;
}): boolean;
export function cacheAgeDays(
  rows: Array<Record<string, unknown>>,
  fileMtimeMs: number,
  nowMs?: number
): number;
type CatalogBaselineSource = {
  handle: string;
  name: string;
  stationId: string;
  minDuration?: number;
  maxDuration?: number;
  topPercentile?: number;
  maxVideos?: number;
};
type CatalogBaseline = {
  sourceMeta?: Record<string, Record<string, unknown>>;
  stations?: Record<string, { videos?: Array<Record<string, unknown>> }>;
};
export function sourceRowsFromCatalog(
  catalog: CatalogBaseline,
  source: CatalogBaselineSource
): Array<Record<string, unknown>>;
export function selectApiWorkingSet(
  rows: Array<Record<string, unknown>>,
  source: Record<string, unknown>,
  cachedRows?: Array<Record<string, unknown>>,
  previousCandidateCount?: number
): { candidateCount: number; pct: number; rows: Array<Record<string, unknown>> };
export function refreshFromYouTubeApi(options: {
  source: Record<string, unknown>;
  outputPath: string;
  minDur: number;
  maxDur: number;
  previousCandidateCount?: number;
  apiKey?: string;
  fetchImpl?: typeof fetch;
}): Promise<{
  selection: { candidateCount: number; pct: number; rows: Array<Record<string, unknown>> };
  apiResult: Record<string, unknown>;
}>;
export function handleEmptyDurationResult(options: {
  safe: string;
  outputPath: string;
  minDur: number;
  maxDur: number;
  flatCount: number;
  apiRequests?: number;
}): Record<string, unknown>;
export function filterFlatByDuration<T extends { duration?: number }>(
  flatVideos: T[],
  minDur: number,
  maxDur: number
): T[];
export function computeEnrichBudget(
  filteredCount: number,
  source: Record<string, unknown> | undefined
): number;
export function minimumCompleteEnrichment(durationFilteredCount: number, budget: number): number;
export function isEnrichmentComplete(
  enrichedCount: number,
  durationFilteredCount: number,
  budget: number
): boolean;
export function isBotDetectionError(message: string): boolean;
export function ytDlpTimeoutMs(env?: Record<string, string | undefined>): number | undefined;
export function ytDlpBaseArgs(): string[];
export function runYtDlpLines(args: string[], options?: { retries?: number }): unknown;
export function fetchChannel(handle: string, options?: { fresh?: boolean }): Promise<unknown>;
