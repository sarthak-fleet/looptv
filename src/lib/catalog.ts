import type { Catalog, CatalogSummary, Video } from "./types";

let catalogCache: Catalog | null = null;
let inflight: Promise<Catalog> | null = null;
let summaryCache: CatalogSummary | null = null;
let summaryInflight: Promise<CatalogSummary> | null = null;

const RETRY_DELAYS_MS = [400, 1200];

async function fetchCatalogWithRetry(): Promise<Catalog> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      const res = await fetch("/catalog.json", { cache: "force-cache" });
      if (!res.ok) throw new Error(`Failed to load catalog: ${res.status}`);
      return (await res.json()) as Catalog;
    } catch (err) {
      lastErr = err;
      if (attempt < RETRY_DELAYS_MS.length) {
        await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]));
      }
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("Failed to load catalog");
}

export async function loadCatalog(): Promise<Catalog> {
  if (catalogCache) return catalogCache;
  // Dedupe concurrent loads (e.g. React StrictMode double-invoking effects).
  if (inflight) return inflight;
  inflight = fetchCatalogWithRetry()
    .then((c) => {
      catalogCache = c;
      return c;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

export async function loadCatalogSummary(): Promise<CatalogSummary> {
  if (summaryCache) return summaryCache;
  if (summaryInflight) return summaryInflight;
  summaryInflight = fetch("/catalog-summary.json", { cache: "force-cache" })
    .then((res) => {
      if (!res.ok) throw new Error(`Failed to load catalog summary: ${res.status}`);
      return res.json() as Promise<CatalogSummary>;
    })
    .then((summary) => {
      summaryCache = summary;
      return summary;
    })
    .finally(() => {
      summaryInflight = null;
    });
  return summaryInflight;
}

export function getVideosForStation(
  catalog: Catalog,
  stationId: string,
  categoryId: string
): Video[] {
  if (stationId === "all") {
    return Object.values(catalog.stations).flatMap((s) => s.videos);
  }

  const station = catalog.stations[stationId];
  if (!station) return [];

  if (categoryId === "all") return station.videos;

  const ids = station.categoryVideoIds[categoryId];
  if (!ids) return [];

  const idSet = new Set(ids);
  return station.videos.filter((v) => idSet.has(v.id));
}

export function pickRandom(videos: Video[], exclude?: string): Video | null {
  const filtered = exclude ? videos.filter((v) => v.id !== exclude) : videos;
  if (filtered.length === 0) return null;
  return filtered[Math.floor(Math.random() * filtered.length)];
}

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
