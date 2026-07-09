export function findSourceByHandle(handle: string): Record<string, unknown> | undefined;
export function filterFlatByDuration<T extends { duration?: number }>(
  flatVideos: T[],
  minDur: number,
  maxDur: number
): T[];
export function computeEnrichBudget(
  filteredCount: number,
  source: Record<string, unknown> | undefined
): number;
export function isBotDetectionError(message: string): boolean;
export function ytDlpBaseArgs(): string[];
export function runYtDlpLines(args: string[], options?: { retries?: number }): unknown;
export function fetchChannel(handle: string, options?: { fresh?: boolean }): Promise<unknown>;
