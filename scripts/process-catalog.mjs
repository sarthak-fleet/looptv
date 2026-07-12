// Process raw yt-dlp JSONL files into a LoopTV catalog
// Merges with existing catalog — preserves NER tags for known videos
// Usage: node scripts/process-catalog.mjs <temp_dir> <output_path>

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  applySourceQualityFilter,
  qualifiesRawVideo,
  validateCatalog,
} from './catalog-quality.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMP_DIR = process.argv[2];
const OUTPUT = process.argv[3];

const stationsPath = process.env.STATIONS_PATH || path.join(__dirname, '..', 'stations.json');
const stationsConfig = JSON.parse(fs.readFileSync(stationsPath, 'utf-8'));

// Load existing catalog to preserve NER-enriched tags
let existing = { stations: {} };
if (fs.existsSync(OUTPUT)) {
  try {
    existing = JSON.parse(fs.readFileSync(OUTPUT, 'utf-8'));
  } catch {}
}

// Build lookup of existing videos by ID (preserves their tags)
const existingVideos = new Map();
for (const station of Object.values(existing.stations || {})) {
  for (const v of station.videos || []) {
    existingVideos.set(v.id, v);
  }
}

const REQUIRED_FRESH_SOURCE_COVERAGE = Number(process.env.MIN_FRESH_SOURCE_COVERAGE || 0.8);
const FRESH_SOURCE_MAX_AGE_DAYS = Number(process.env.FRESH_SOURCE_MAX_AGE_DAYS || 14);
const MS_PER_DAY = 86_400_000;
const generatedAt = new Date();

function existingSourceRows(stationId, sourceName) {
  return (existing.stations?.[stationId]?.videos || [])
    .filter((video) => video.source === sourceName)
    .map((video) => ({
      id: video.id,
      title: video.title || '',
      duration: video.duration || 0,
      view_count: video.viewCount,
      description: video.description || '',
      _looptvCatalogFallback: true,
    }));
}

function sourceState(videos, artifactExists) {
  if (!artifactExists) return 'missing';
  if (videos.length === 0) return 'empty';
  const fallbackCount = videos.filter((video) => video._looptvCatalogFallback === true).length;
  if (fallbackCount === videos.length) return 'fallback';
  if (fallbackCount > 0) return 'partial';
  return 'live';
}

function timestampIsFresh(value) {
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  return generatedAt.getTime() - date.getTime() <= FRESH_SOURCE_MAX_AGE_DAYS * MS_PER_DAY;
}

// First pass: parse and cache qualifying videos per source (avoids reading files twice).
// Missing/empty artifacts preserve the prior curated source rows but never count as fresh.
const sourceCache = new Map(); // handle → { videos, state, fetchedAt, counts }
const sourceMeta = {};
for (const station of stationsConfig) {
  for (const src of station.sources) {
    const handle = src.handle.replace('@', '');
    if (sourceCache.has(handle)) continue;
    const filePath = path.join(TEMP_DIR, `${handle}.jsonl`);
    const artifactExists = fs.existsSync(filePath);
    let fetchedAt = artifactExists ? fs.statSync(filePath).mtime.toISOString() : '';
    const minDur = src.minDuration ?? 60;
    const maxDur = src.maxDuration ?? 3600;
    const lines = artifactExists ? fs.readFileSync(filePath, 'utf-8').trim().split('\n') : [];
    const videos = [];
    for (const line of lines) {
      try {
        const raw = JSON.parse(line);
        if (raw._looptvFetchedAt && !Number.isNaN(new Date(raw._looptvFetchedAt).getTime())) {
          fetchedAt = raw._looptvFetchedAt;
        }
        if (!qualifiesRawVideo(raw, minDur, maxDur)) continue;
        videos.push(raw);
      } catch {}
    }
    const prevMeta = existing.sourceMeta?.[handle];
    const state = sourceState(videos, artifactExists);
    if (videos.length === 0) {
      videos.push(...existingSourceRows(station.id, src.name));
    }
    const fallbackVideoCount = videos.filter(
      (video) => video._looptvCatalogFallback === true
    ).length;
    const liveVideoCount = videos.length - fallbackVideoCount;
    const candidateCount = videos.reduce(
      (max, video) => Math.max(max, Number(video._looptvCandidateCount || 0)),
      videos.length
    );
    sourceCache.set(handle, {
      videos,
      state,
      fetchedAt,
      liveVideoCount,
      fallbackVideoCount,
      candidateCount,
      prevMeta,
    });
  }
}

const catalog = {
  lastUpdated: '',
  generatedAt: generatedAt.toISOString(),
  sourceMeta: {},
  stations: {},
};
let totalNew = 0;
const emptyStations = [];

for (const station of stationsConfig) {
  const allVideos = [];

  for (const src of station.sources) {
    const handle = src.handle.replace('@', '');
    const input = sourceCache.get(handle);
    const sourceVideos = input.videos;

    const { filtered, pct, mode } = applySourceQualityFilter(sourceVideos, src);
    if (sourceVideos.length > 0) {
      const selection =
        mode === 'preserved'
          ? 'preserved curated fallback'
          : mode === 'preselected'
            ? 'preserved API preselection'
            : `top ${pct}% selected`;
      console.log(
        `  ${src.name}: ${selection} — ${sourceVideos.length} → ${filtered.length} videos`
      );
    } else {
      console.warn(`  Warning: no catalog data for ${src.handle} (${input.state})`);
    }

    const successfulFetch =
      input.state === 'live' ? input.fetchedAt : (input.prevMeta?.lastSuccessfulFetch ?? '');
    sourceMeta[handle] = {
      fetchedAt:
        input.state === 'live' || input.state === 'partial'
          ? input.fetchedAt
          : (input.prevMeta?.fetchedAt ?? ''),
      lastSuccessfulFetch: successfulFetch,
      videoCount:
        input.state === 'live'
          ? input.candidateCount
          : (input.prevMeta?.videoCount ?? sourceVideos.length),
      selectedCount: filtered.length,
      liveVideoCount: input.liveVideoCount,
      fallbackVideoCount: input.fallbackVideoCount,
      refreshState: input.state,
    };

    for (const raw of filtered) {
      const prev = existingVideos.get(raw.id);
      if (prev?.tags && prev.tags.length > 1) {
        prev.viewCount = raw.view_count;
        allVideos.push(prev);
      } else {
        totalNew++;
        allVideos.push({
          id: raw.id,
          title: raw.title || '',
          duration: raw.duration || 0,
          date: '',
          tags: [src.name],
          source: src.name,
          viewCount: raw.view_count,
          description: (raw.description || '').slice(0, 300),
        });
      }
    }
  }

  catalog.stations[station.id] = { videos: allVideos, categoryVideoIds: {} };
  if (allVideos.length === 0) {
    emptyStations.push(station.id);
  }

  const sourceNames = station.sources.map((s) => s.name).join(' + ');
  const newInStation = allVideos.filter((v) => v.description).length;
  console.log(`${station.id}: ${allVideos.length} videos (${sourceNames}), ${newInStation} new`);
}

const metas = Object.values(sourceMeta);
const freshSources = metas.filter(
  (meta) => meta.refreshState === 'live' && timestampIsFresh(meta.lastSuccessfulFetch)
).length;
const representedMissing = stationsConfig.some((station) =>
  station.sources.some((source) => {
    const handle = source.handle.replace('@', '');
    return (
      sourceMeta[handle].refreshState === 'missing' &&
      existingSourceRows(station.id, source.name).length > 0
    );
  })
);
const freshCoverage = metas.length > 0 ? freshSources / metas.length : 0;
const refreshComplete = freshCoverage >= REQUIRED_FRESH_SOURCE_COVERAGE && !representedMissing;
catalog.refreshStatus = {
  generatedAt: generatedAt.toISOString(),
  complete: refreshComplete,
  requiredFreshCoverage: REQUIRED_FRESH_SOURCE_COVERAGE,
  freshCoverage,
  totalSources: metas.length,
  liveSources: metas.filter((meta) => meta.refreshState === 'live').length,
  freshSources,
  staleSources: metas.filter(
    (meta) => meta.lastSuccessfulFetch && !timestampIsFresh(meta.lastSuccessfulFetch)
  ).length,
  partialSources: metas.filter((meta) => meta.refreshState === 'partial').length,
  fallbackSources: metas.filter((meta) => meta.refreshState === 'fallback').length,
  emptySources: metas.filter((meta) => meta.refreshState === 'empty').length,
  missingSources: metas.filter((meta) => meta.refreshState === 'missing').length,
};
catalog.lastUpdated = refreshComplete
  ? generatedAt.toISOString()
  : (process.env.PREVIOUS_COMPLETE_CATALOG_AT ?? existing.lastUpdated ?? '');
catalog.sourceMeta = sourceMeta;

try {
  validateCatalog(catalog);
} catch (err) {
  console.error(`Catalog quality validation failed: ${err.message}`);
  console.error(
    'Hint: cached JSONL may have been fetched with --flat-playlist (no view counts). Re-fetch sources without --flat-playlist.'
  );
  process.exit(1);
}

fs.writeFileSync(OUTPUT, JSON.stringify(catalog));
const summaryOutput = path.join(path.dirname(OUTPUT), 'catalog-summary.json');
const catalogSummary = {
  lastUpdated: catalog.lastUpdated,
  generatedAt: catalog.generatedAt,
  refreshStatus: catalog.refreshStatus,
  totalVideos: Object.values(catalog.stations).reduce(
    (total, station) => total + station.videos.length,
    0
  ),
  stations: Object.fromEntries(
    Object.entries(catalog.stations).map(([stationId, station]) => [
      stationId,
      { videoCount: station.videos.length },
    ])
  ),
};
fs.writeFileSync(summaryOutput, JSON.stringify(catalogSummary));
const sizeKB = Math.round(fs.statSync(OUTPUT).size / 1024);
console.log(`\nTotal new videos needing NER: ${totalNew}`);
console.log(`Output: ${OUTPUT} (${sizeKB}KB)`);
console.log(`Summary: ${summaryOutput}`);

if (emptyStations.length > 0) {
  console.error(
    `Catalog build produced empty stations: ${emptyStations.join(', ')}. Refusing to ship an empty TV catalog.`
  );
  process.exit(1);
}
