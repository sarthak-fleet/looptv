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

// First pass: parse and cache qualifying videos per source (avoids reading files twice)
const sourceCache = new Map(); // handle → videos[]
const sourceMeta = {}; // handle → { fetchedAt, lastSuccessfulFetch, videoCount }
let hasLiveSourceData = false;
for (const station of stationsConfig) {
  for (const src of station.sources) {
    const handle = src.handle.replace('@', '');
    if (sourceCache.has(handle)) continue;
    const filePath = path.join(TEMP_DIR, `${handle}.jsonl`);
    if (!fs.existsSync(filePath)) continue;
    const fetchedAt = fs.statSync(filePath).mtime.toISOString();
    const minDur = src.minDuration ?? 60;
    const maxDur = src.maxDuration ?? 3600;
    const lines = fs.readFileSync(filePath, 'utf-8').trim().split('\n');
    const videos = [];
    for (const line of lines) {
      try {
        const raw = JSON.parse(line);
        if (!qualifiesRawVideo(raw, minDur, maxDur)) continue;
        videos.push(raw);
      } catch {}
    }
    sourceCache.set(handle, videos);
    // Preserve lastSuccessfulFetch from previous catalog if this run yields no videos
    const prevMeta = existing.sourceMeta?.[handle];
    const isCatalogFallback =
      videos.length > 0 && videos.every((video) => video._looptvCatalogFallback === true);
    if (videos.length > 0 && !isCatalogFallback) hasLiveSourceData = true;
    sourceMeta[handle] = isCatalogFallback
      ? {
          fetchedAt: prevMeta?.fetchedAt ?? '',
          lastSuccessfulFetch: prevMeta?.lastSuccessfulFetch ?? '',
          videoCount: prevMeta?.videoCount ?? videos.length,
        }
      : {
          fetchedAt,
          lastSuccessfulFetch:
            videos.length > 0 ? fetchedAt : (prevMeta?.lastSuccessfulFetch ?? ''),
          videoCount: videos.length,
        };
  }
}

const catalog = { lastUpdated: '', sourceMeta: {}, stations: {} };
let totalNew = 0;
const emptyStations = [];

for (const station of stationsConfig) {
  const allVideos = [];

  for (const src of station.sources) {
    const handle = src.handle.replace('@', '');
    const sourceVideos = sourceCache.get(handle);
    if (!sourceVideos) {
      console.warn(`  Warning: no data for ${src.handle}, skipping`);
      continue;
    }

    const { filtered, pct } = applySourceQualityFilter(sourceVideos, src);
    if (sourceVideos.length > 0) {
      console.log(
        `  ${src.name}: top ${pct}% — ${sourceVideos.length} → ${filtered.length} videos`
      );
    }

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

catalog.lastUpdated = hasLiveSourceData ? new Date().toISOString() : (existing.lastUpdated ?? '');
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
