/** Client-side mirror of scripts/catalog-quality.mjs — keep in sync via catalog-quality.test.ts */

export const MIN_VIEW_COUNT = 10_000;
export const MAX_VIDEOS_PER_SOURCE = 200;
export const TOP_PICK_BAND_SIZE = 12;

export function videoViewWeight(viewCount?: number): number {
  if (viewCount == null || viewCount < MIN_VIEW_COUNT) return 0;
  return Math.log10(viewCount + 10);
}

export function pickFromTopViewBand<T extends { id: string; viewCount?: number }>(
  items: T[],
  excludeId?: string,
  bandSize: number = TOP_PICK_BAND_SIZE
): T | null {
  const filtered = excludeId ? items.filter((item) => item.id !== excludeId) : items;
  if (filtered.length === 0) return null;
  if (filtered.length === 1) return filtered[0];

  const ranked = [...filtered].sort(
    (a, b) => (b.viewCount ?? 0) - (a.viewCount ?? 0) || a.id.localeCompare(b.id)
  );
  const band = ranked.slice(0, Math.min(bandSize, ranked.length));
  return band[Math.floor(Math.random() * band.length)] ?? null;
}

export function pickUniform<T extends { id: string }>(
  items: T[],
  excludeId?: string,
  random: () => number = Math.random
): T | null {
  const filtered = excludeId ? items.filter((item) => item.id !== excludeId) : items;
  if (filtered.length === 0) return null;
  return filtered[Math.floor(random() * filtered.length)] ?? null;
}
