export interface Video {
  id: string;
  title: string;
  duration: number; // seconds
  date: string; // YYYY-MM-DD
  tags: string[];
  source?: string; // YouTube channel name for multi-source stations
  viewCount?: number;
}

export interface YouTubeSource {
  name: string;
  handle: string; // @handle for yt-dlp
  channelId?: string; // UC... id — needed for RSS feed URLs (handles don't work there)
  minDuration?: number;
  maxDuration?: number;
  topPercentile?: number; // keep only top N% by views (e.g., 25 = top 25%)
  maxVideos?: number; // override the default 200-video source cap
}

export interface StationConfig {
  id: string;
  name: string;
  description: string;
  sources: YouTubeSource[];
}

export interface StationCatalog {
  videos: Video[];
  categoryVideoIds: Record<string, string[]>; // auto-derived from tags
}

export interface SourceEmbedHealth {
  sampledAt: string;
  blocked: number;
  checked: number;
}

export interface SourceMeta {
  fetchedAt: string;
  lastSuccessfulFetch: string; // empty string if source has never yielded videos
  videoCount: number;
  selectedCount?: number;
  liveVideoCount?: number;
  fallbackVideoCount?: number;
  refreshState?: 'live' | 'partial' | 'fallback' | 'empty' | 'missing';
  embedHealth?: SourceEmbedHealth;
}

export interface CatalogRefreshStatus {
  generatedAt: string;
  complete: boolean;
  requiredFreshCoverage: number;
  freshCoverage: number;
  totalSources: number;
  liveSources: number;
  freshSources: number;
  staleSources: number;
  partialSources: number;
  fallbackSources: number;
  emptySources: number;
  missingSources: number;
}

export interface Catalog {
  lastUpdated: string;
  generatedAt?: string;
  refreshStatus?: CatalogRefreshStatus;
  sourceMeta?: Record<string, SourceMeta>; // keyed by YouTube handle (without @)
  stations: Record<string, StationCatalog>;
}

export interface CatalogSummary {
  lastUpdated: string;
  generatedAt?: string;
  refreshStatus?: CatalogRefreshStatus;
  stations: Record<string, { videoCount: number }>;
  totalVideos: number;
}
