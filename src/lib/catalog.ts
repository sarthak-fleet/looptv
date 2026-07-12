import { pickUniform } from './catalog-quality';
import type { Catalog, CatalogRefreshStatus, CatalogSummary, SourceMeta, Video } from './types';

let catalogCache: Catalog | null = null;
let inflight: Promise<Catalog> | null = null;
let summaryCache: CatalogSummary | null = null;
let summaryInflight: Promise<CatalogSummary> | null = null;

const RETRY_DELAYS_MS = [400, 1200];
const MS_PER_DAY = 24 * 60 * 60 * 1000;
export const STALE_CATALOG_DAYS = 10;

export type CatalogFreshness = {
  state: 'loading' | 'fresh' | 'stale' | 'incomplete' | 'unknown';
  label: string;
  ageDays: number | null;
  updatedAt: Date | null;
};

function catalogVideoCount(catalog: Catalog): number {
  return Object.values(catalog.stations ?? {}).reduce(
    (total, station) => total + (Array.isArray(station.videos) ? station.videos.length : 0),
    0
  );
}

function assertUsableCatalog(catalog: Catalog): Catalog {
  if (!catalog?.stations || catalogVideoCount(catalog) === 0) {
    throw new Error('Catalog loaded but contains no videos');
  }
  return catalog;
}

function assertUsableSummary(summary: CatalogSummary): CatalogSummary {
  if (!summary?.stations || (summary.totalVideos ?? 0) === 0) {
    throw new Error('Catalog summary loaded but contains no videos');
  }
  return summary;
}

async function fetchCatalogWithRetry(): Promise<Catalog> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      const shouldBypassCache = attempt === RETRY_DELAYS_MS.length;
      const url = shouldBypassCache ? `/catalog.json?v=${Date.now()}` : '/catalog.json';
      const res = await fetch(url, { cache: shouldBypassCache ? 'no-store' : 'no-cache' });
      if (!res.ok) throw new Error(`Failed to load catalog: ${res.status}`);
      return assertUsableCatalog((await res.json()) as Catalog);
    } catch (err) {
      lastErr = err;
      if (attempt < RETRY_DELAYS_MS.length) {
        await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]));
      }
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('Failed to load catalog');
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

export async function refreshCatalog(): Promise<Catalog> {
  catalogCache = null;
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

async function fetchSummaryWithRetry(): Promise<CatalogSummary> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      const shouldBypassCache = attempt === RETRY_DELAYS_MS.length;
      const url = shouldBypassCache
        ? `/catalog-summary.json?v=${Date.now()}`
        : '/catalog-summary.json';
      const res = await fetch(url, {
        cache: shouldBypassCache ? 'no-store' : 'no-cache',
      });
      if (!res.ok) throw new Error(`Failed to load catalog summary: ${res.status}`);
      return assertUsableSummary((await res.json()) as CatalogSummary);
    } catch (err) {
      lastErr = err;
      if (attempt < RETRY_DELAYS_MS.length) {
        await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]));
      }
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('Failed to load catalog summary');
}

export async function refreshCatalogSummary(): Promise<CatalogSummary> {
  summaryCache = null;
  if (summaryInflight) return summaryInflight;
  summaryInflight = fetchSummaryWithRetry()
    .then((summary) => {
      summaryCache = summary;
      return summary;
    })
    .finally(() => {
      summaryInflight = null;
    });
  return summaryInflight;
}

export async function loadCatalogSummary(): Promise<CatalogSummary> {
  if (summaryCache) return summaryCache;
  if (summaryInflight) return summaryInflight;
  summaryInflight = fetchSummaryWithRetry()
    .then((summary) => {
      summaryCache = summary;
      return summary;
    })
    .finally(() => {
      summaryInflight = null;
    });
  return summaryInflight;
}

export function isNewCatalogVersion(
  loadedGeneratedAt: string | null | undefined,
  deployedGeneratedAt: string | null | undefined
): boolean {
  return Boolean(
    loadedGeneratedAt && deployedGeneratedAt && loadedGeneratedAt !== deployedGeneratedAt
  );
}

export function getVideosForStation(
  catalog: Catalog,
  stationId: string,
  categoryId: string
): Video[] {
  if (stationId === 'all') {
    return Object.values(catalog.stations).flatMap((s) => s.videos);
  }

  const station = catalog.stations[stationId];
  if (!station) return [];

  if (categoryId === 'all') return station.videos;

  const ids = station.categoryVideoIds[categoryId];
  if (!ids) return [];

  const idSet = new Set(ids);
  return station.videos.filter((v) => idSet.has(v.id));
}

export function getCatalogFreshness(
  lastUpdated?: string | null,
  now: Date = new Date(),
  refreshStatus?: CatalogRefreshStatus
): CatalogFreshness {
  if (refreshStatus && !refreshStatus.complete) {
    return {
      state: 'incomplete',
      label: `Latest refresh covered ${Math.round(refreshStatus.freshCoverage * 100)}% of sources`,
      ageDays: null,
      updatedAt: null,
    };
  }
  if (!lastUpdated) {
    return {
      state: 'loading',
      label: 'Checking catalog freshness...',
      ageDays: null,
      updatedAt: null,
    };
  }

  const updatedAt = new Date(lastUpdated);
  if (Number.isNaN(updatedAt.getTime())) {
    return {
      state: 'unknown',
      label: 'Catalog freshness unknown',
      ageDays: null,
      updatedAt: null,
    };
  }

  const ageDays = Math.max(0, Math.floor((now.getTime() - updatedAt.getTime()) / MS_PER_DAY));
  const ageLabel = ageDays === 0 ? 'today' : ageDays === 1 ? '1 day ago' : `${ageDays} days ago`;

  return {
    state: ageDays > STALE_CATALOG_DAYS ? 'stale' : 'fresh',
    label: `Catalog updated ${ageLabel}`,
    ageDays,
    updatedAt,
  };
}

export const STALE_SOURCE_DAYS = 14;

export type SourceFreshness = {
  state: 'fresh' | 'stale' | 'unknown';
  label: string;
  ageDays: number | null;
};

export function getSourceFreshness(
  meta: SourceMeta | undefined | null,
  now: Date = new Date()
): SourceFreshness {
  if (meta?.refreshState === 'partial') {
    return { state: 'stale', label: 'Latest source refresh was partial', ageDays: null };
  }
  if (meta?.refreshState === 'fallback') {
    return { state: 'stale', label: 'Using preserved fallback data', ageDays: null };
  }
  if (meta?.refreshState === 'missing' || meta?.refreshState === 'empty') {
    return { state: 'unknown', label: 'No usable source data', ageDays: null };
  }
  const fetchedAt = meta?.lastSuccessfulFetch || meta?.fetchedAt;
  if (!fetchedAt) {
    return { state: 'unknown', label: 'Never fetched', ageDays: null };
  }
  const date = new Date(fetchedAt);
  if (Number.isNaN(date.getTime())) {
    return { state: 'unknown', label: 'Fetch time unknown', ageDays: null };
  }
  const ageDays = Math.max(0, Math.floor((now.getTime() - date.getTime()) / MS_PER_DAY));
  const ageLabel = ageDays === 0 ? 'today' : ageDays === 1 ? '1 day ago' : `${ageDays} days ago`;
  return {
    state: ageDays > STALE_SOURCE_DAYS ? 'stale' : 'fresh',
    label: `Fetched ${ageLabel}`,
    ageDays,
  };
}

export function pickRandom(
  videos: Video[],
  exclude?: string,
  random: () => number = Math.random
): Video | null {
  return pickUniform(videos, exclude, random);
}

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}`;
}
