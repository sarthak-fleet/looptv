export const TAGGING_PROFILES: Record<string, unknown>;
export const STATION_TAGGING_PROFILE: Record<string, string>;

export function getTaggingProfileId(stationId: string): string;
export function getSystemPrompt(stationId: string): string;
export function buildUserPrompt(videos: Array<{ title: string; description?: string }>): string;
export function createStationBatches<T extends { stationId: string; video: unknown }>(
  items: T[],
  batchSize: number
): Array<{ stationId: string; videos: unknown[] }>;
