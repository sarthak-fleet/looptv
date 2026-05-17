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
  minDuration?: number;
  maxDuration?: number;
  topPercentile?: number; // keep only top N% by views (e.g., 25 = top 25%)
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

export interface Catalog {
  lastUpdated: string;
  stations: Record<string, StationCatalog>;
}

export interface CatalogSummary {
  lastUpdated: string;
  stations: Record<string, { videoCount: number }>;
  totalVideos: number;
}
