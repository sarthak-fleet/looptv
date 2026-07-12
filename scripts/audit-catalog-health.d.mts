export interface CatalogHealthAuditResult {
  generatedAt: string;
  summary: {
    totalStations: number;
    totalSources: number;
    selectedVideos: number;
    uniqueVideos: number;
    freshSources: number;
    staleSources: number;
    partialSources: number;
    fallbackSources: number;
    missingSources: number;
    freshCoverage: number;
    requiredFreshCoverage: number;
  };
  stations: Array<{
    id: string;
    name: string;
    selectedCount: number;
    sources: Array<{
      name: string;
      handle: string;
      health: string;
      selectedCount: number;
      [key: string]: unknown;
    }>;
  }>;
  violations: string[];
}

export function auditCatalogHealth(input: {
  stations: Array<Record<string, unknown>>;
  catalog: Record<string, unknown>;
  now?: Date;
  requiredFreshCoverage?: number;
  freshSourceDays?: number;
}): CatalogHealthAuditResult;
export function formatCatalogHealthMarkdown(result: CatalogHealthAuditResult): string;
