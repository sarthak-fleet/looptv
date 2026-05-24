import type { Catalog, CatalogSummary, Video } from "./types";

let catalogCache: Catalog | null = null;
let inflight: Promise<Catalog> | null = null;
let summaryCache: CatalogSummary | null = null;
let summaryInflight: Promise<CatalogSummary> | null = null;

const RETRY_DELAYS_MS = [400, 1200];
const MS_PER_DAY = 24 * 60 * 60 * 1000;
export const STALE_CATALOG_DAYS = 10;

export type CatalogFreshness = {
  state: "loading" | "fresh" | "stale" | "unknown";
  label: string;
  ageDays: number | null;
  updatedAt: Date | null;
};

function catalogVideoCount(catalog: Catalog): number {
  return Object.values(catalog.stations ?? {}).reduce(
    (total, station) => total + (Array.isArray(station.videos) ? station.videos.length : 0),
    0,
  );
}

function assertUsableCatalog(catalog: Catalog): Catalog {
  if (!catalog?.stations || catalogVideoCount(catalog) === 0) {
    throw new Error("Catalog loaded but contains no videos");
  }
  return catalog;
}

function assertUsableSummary(summary: CatalogSummary): CatalogSummary {
  if (!summary?.stations || (summary.totalVideos ?? 0) === 0) {
    throw new Error("Catalog summary loaded but contains no videos");
  }
  return summary;
}

async function fetchCatalogWithRetry(): Promise<Catalog> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      const shouldBypassCache = attempt === RETRY_DELAYS_MS.length;
      const url = shouldBypassCache ? `/catalog.json?v=${Date.now()}` : "/catalog.json";
      const res = await fetch(url, { cache: shouldBypassCache ? "no-store" : "force-cache" });
      if (!res.ok) throw new Error(`Failed to load catalog: ${res.status}`);
      return assertUsableCatalog((await res.json()) as Catalog);
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
    .then(async (res) => {
      if (!res.ok) throw new Error(`Failed to load catalog summary: ${res.status}`);
      try {
        return assertUsableSummary((await res.json()) as CatalogSummary);
      } catch {
        const fresh = await fetch(`/catalog-summary.json?v=${Date.now()}`, { cache: "no-store" });
        if (!fresh.ok) throw new Error(`Failed to refresh catalog summary: ${fresh.status}`);
        return assertUsableSummary((await fresh.json()) as CatalogSummary);
      }
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

export function getCatalogFreshness(
  lastUpdated?: string | null,
  now: Date = new Date(),
): CatalogFreshness {
  if (!lastUpdated) {
    return {
      state: "loading",
      label: "Checking catalog freshness...",
      ageDays: null,
      updatedAt: null,
    };
  }

  const updatedAt = new Date(lastUpdated);
  if (Number.isNaN(updatedAt.getTime())) {
    return {
      state: "unknown",
      label: "Catalog freshness unknown",
      ageDays: null,
      updatedAt: null,
    };
  }

  const ageDays = Math.max(0, Math.floor((now.getTime() - updatedAt.getTime()) / MS_PER_DAY));
  const ageLabel = ageDays === 0 ? "today" : ageDays === 1 ? "1 day ago" : `${ageDays} days ago`;

  return {
    state: ageDays > STALE_CATALOG_DAYS ? "stale" : "fresh",
    label: `Catalog updated ${ageLabel}`,
    ageDays,
    updatedAt,
  };
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
