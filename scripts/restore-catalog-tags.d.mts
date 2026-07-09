export function slugifyTag(tag: string): string;
export function buildTagIndex(catalog: unknown): Map<string, string[]>;
export function mergeTagIndexes(indexes: Map<string, string[]>[]): Map<string, string[]>;
export function applyRestoredTags(
  catalog: unknown,
  tagIndex: Map<string, string[]>,
  sourceNamesByStation: Map<string, Set<string>>
): { restored: number; alreadyTagged: number; stillUntagged: number };
export function deriveCategoryVideoIds(
  videos: Array<{ id: string; tags?: string[] }>,
  sourceNames: Set<string>
): Record<string, string[]>;
