import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MIN_VIEW_COUNT } from './catalog-quality.mjs';

export const DEFAULT_REQUIRED_FRESH_COVERAGE = 0.8;
export const DEFAULT_FRESH_SOURCE_DAYS = 14;

function ageDays(value, now) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return Math.max(0, Math.floor((now.getTime() - date.getTime()) / 86_400_000));
}

function sourceHealth(meta, now, freshSourceDays) {
  if (!meta || meta.refreshState === 'missing' || meta.refreshState === 'empty') return 'missing';
  if (meta.refreshState === 'partial') return 'partial';
  if (meta.refreshState === 'fallback') return 'fallback';
  const age = ageDays(meta.lastSuccessfulFetch || meta.fetchedAt, now);
  if (age === null) return 'missing';
  return age > freshSourceDays ? 'stale' : 'fresh';
}

export function auditCatalogHealth({
  stations,
  catalog,
  now = new Date(),
  requiredFreshCoverage = DEFAULT_REQUIRED_FRESH_COVERAGE,
  freshSourceDays = DEFAULT_FRESH_SOURCE_DAYS,
}) {
  const violations = [];
  const seenVideoIds = new Map();
  const stationReports = [];
  let selectedVideos = 0;
  let freshSources = 0;
  let staleSources = 0;
  let partialSources = 0;
  let fallbackSources = 0;
  let missingSources = 0;

  for (const station of stations) {
    const stationCatalog = catalog.stations?.[station.id];
    const videos = stationCatalog?.videos ?? [];
    if (!stationCatalog) violations.push(`Station ${station.id} is missing from catalog`);
    const sourceByName = new Map(station.sources.map((source) => [source.name, source]));
    const counts = new Map(station.sources.map((source) => [source.name, 0]));

    for (const video of videos) {
      selectedVideos += 1;
      const source = sourceByName.get(video.source);
      if (!source) {
        violations.push(
          `Station ${station.id} video ${video.id} references unknown source ${video.source || '(none)'}`
        );
      } else {
        counts.set(source.name, (counts.get(source.name) ?? 0) + 1);
        const minDuration = source.minDuration ?? 60;
        const maxDuration = source.maxDuration ?? 3600;
        if (video.duration < minDuration || video.duration > maxDuration) {
          violations.push(
            `Station ${station.id} source ${source.name} video ${video.id} duration ${video.duration}s is outside ${minDuration}-${maxDuration}s`
          );
        }
      }
      if (typeof video.viewCount !== 'number' || video.viewCount < MIN_VIEW_COUNT) {
        violations.push(
          `Station ${station.id} source ${video.source || '(none)'} video ${video.id} has fewer than 10,000 views`
        );
      }
      const previousStation = seenVideoIds.get(video.id);
      if (previousStation) {
        violations.push(`Video ${video.id} appears in both ${previousStation} and ${station.id}`);
      } else {
        seenVideoIds.set(video.id, station.id);
      }
    }

    const sources = station.sources.map((source) => {
      const handle = source.handle.replace(/^@/, '');
      const meta = catalog.sourceMeta?.[handle];
      const health = sourceHealth(meta, now, freshSourceDays);
      if (health === 'fresh') freshSources += 1;
      else if (health === 'stale') staleSources += 1;
      else if (health === 'partial') partialSources += 1;
      else if (health === 'fallback') fallbackSources += 1;
      else missingSources += 1;
      const selectedCount = counts.get(source.name) ?? 0;
      if (meta?.selectedCount != null && meta.selectedCount !== selectedCount) {
        violations.push(
          `Source ${source.name} metadata selectedCount ${meta.selectedCount} does not match catalog ${selectedCount}`
        );
      }
      return {
        name: source.name,
        handle: source.handle,
        health,
        refreshState: meta?.refreshState ?? 'unknown',
        lastSuccessfulFetch: meta?.lastSuccessfulFetch || '',
        ageDays: ageDays(meta?.lastSuccessfulFetch || meta?.fetchedAt, now),
        candidateCount: meta?.videoCount ?? 0,
        selectedCount,
        minDuration: source.minDuration ?? 60,
        maxDuration: source.maxDuration ?? 3600,
        topPercentile: source.topPercentile ?? null,
      };
    });

    const sourceTotal = sources.reduce((total, source) => total + source.selectedCount, 0);
    if (sourceTotal !== videos.length) {
      violations.push(
        `Station ${station.id} source total ${sourceTotal} does not match station total ${videos.length}`
      );
    }
    stationReports.push({
      id: station.id,
      name: station.name,
      selectedCount: videos.length,
      sources,
    });
  }

  const totalSources = stations.reduce((total, station) => total + station.sources.length, 0);
  const freshCoverage = totalSources > 0 ? freshSources / totalSources : 0;
  if (freshCoverage < requiredFreshCoverage) {
    violations.push(
      `Fresh source coverage ${(freshCoverage * 100).toFixed(1)}% is below required ${(requiredFreshCoverage * 100).toFixed(1)}%`
    );
  }

  return {
    generatedAt: now.toISOString(),
    summary: {
      totalStations: stations.length,
      totalSources,
      selectedVideos,
      uniqueVideos: seenVideoIds.size,
      freshSources,
      staleSources,
      partialSources,
      fallbackSources,
      missingSources,
      freshCoverage,
      requiredFreshCoverage,
    },
    stations: stationReports,
    violations,
  };
}

export function formatCatalogHealthMarkdown(result) {
  const { summary } = result;
  const lines = [
    '# Catalog source health audit',
    '',
    `- Videos: ${summary.selectedVideos.toLocaleString()} (${summary.uniqueVideos.toLocaleString()} unique)`,
    `- Sources: ${summary.totalSources} configured; ${summary.freshSources} fresh; ${summary.staleSources} stale; ${summary.partialSources} partial; ${summary.fallbackSources} fallback; ${summary.missingSources} missing`,
    `- Fresh coverage: ${(summary.freshCoverage * 100).toFixed(1)}% (required ${(summary.requiredFreshCoverage * 100).toFixed(1)}%)`,
    '',
  ];
  for (const station of result.stations) {
    lines.push(`## ${station.name} (${station.selectedCount})`, '');
    lines.push('| Source | State | Candidates | Selected | Last successful fetch | Policy |');
    lines.push('| --- | --- | ---: | ---: | --- | --- |');
    for (const source of station.sources) {
      const policy = source.topPercentile ? `top ${source.topPercentile}%` : 'automatic percentile';
      lines.push(
        `| ${source.name} | ${source.health} | ${source.candidateCount} | ${source.selectedCount} | ${source.lastSuccessfulFetch || 'never'} | ${source.minDuration}-${source.maxDuration}s, ${policy} |`
      );
    }
    lines.push('');
  }
  if (result.violations.length > 0) {
    lines.push('## Violations', '', ...result.violations.map((message) => `- ${message}`), '');
  }
  return `${lines.join('\n')}\n`;
}

function parseArg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const stationsPath = parseArg('--stations') || 'stations.json';
  const catalogPath = parseArg('--catalog') || 'public/catalog.json';
  const markdownPath = parseArg('--markdown-file');
  const jsonPath = parseArg('--json-file');
  const requiredFreshCoverage = Number(
    process.env.MIN_FRESH_SOURCE_COVERAGE || DEFAULT_REQUIRED_FRESH_COVERAGE
  );
  const result = auditCatalogHealth({
    stations: JSON.parse(fs.readFileSync(stationsPath, 'utf8')),
    catalog: JSON.parse(fs.readFileSync(catalogPath, 'utf8')),
    requiredFreshCoverage,
  });
  const markdown = formatCatalogHealthMarkdown(result);
  if (markdownPath) fs.writeFileSync(markdownPath, markdown);
  if (jsonPath) fs.writeFileSync(jsonPath, `${JSON.stringify(result, null, 2)}\n`);
  process.stdout.write(markdown);
  if (result.violations.length > 0 && process.env.CATALOG_AUDIT_OVERRIDE !== '1') {
    process.exitCode = 1;
  }
}
