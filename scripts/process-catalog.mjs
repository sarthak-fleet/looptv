// Process raw yt-dlp JSONL files into a LoopTV catalog
// Merges with existing catalog — preserves NER tags for known videos
// Usage: node scripts/process-catalog.mjs <temp_dir> <output_path>

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMP_DIR = process.argv[2];
const OUTPUT = process.argv[3];

const stationsConfig = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "stations.json"), "utf-8")
);

// Load existing catalog to preserve NER-enriched tags
let existing = { stations: {} };
if (fs.existsSync(OUTPUT)) {
  try {
    existing = JSON.parse(fs.readFileSync(OUTPUT, "utf-8"));
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
const sourceCache = new Map(); // handle → { src, videos[] }
for (const station of stationsConfig) {
  for (const src of station.sources) {
    const handle = src.handle.replace("@", "");
    if (sourceCache.has(handle)) continue;
    const filePath = path.join(TEMP_DIR, `${handle}.jsonl`);
    if (!fs.existsSync(filePath)) continue;
    const minDur = src.minDuration ?? 60;
    const maxDur = src.maxDuration ?? 3600;
    const lines = fs.readFileSync(filePath, "utf-8").trim().split("\n");
    const videos = [];
    for (const line of lines) {
      try {
        const raw = JSON.parse(line);
        const dur = raw.duration || 0;
        if (dur < minDur || dur > maxDur) continue;
        if (raw.view_count !== undefined && raw.view_count !== null && raw.view_count < 10000) continue;
        videos.push(raw);
      } catch {}
    }
    sourceCache.set(handle, videos);
  }
}

// Log-interpolate percentile: most videos → 10%, fewest → 50%
const counts = [...sourceCache.values()].map((v) => v.length).filter((c) => c > 0);
const maxCount = Math.max(...counts);
const minCount = Math.min(...counts);
const logMax = Math.log(maxCount);
const logMin = Math.log(minCount);

function calcPercentile(count) {
  if (logMax === logMin) return 50;
  const t = (Math.log(count) - logMin) / (logMax - logMin); // 0 (smallest) → 1 (largest)
  return Math.round(50 - 40 * t); // 50% (smallest) → 10% (largest)
}

const catalog = { lastUpdated: "", stations: {} };
let totalNew = 0;
const emptyStations = [];

for (const station of stationsConfig) {
  const allVideos = [];

  for (const src of station.sources) {
    const handle = src.handle.replace("@", "");
    const sourceVideos = sourceCache.get(handle);
    if (!sourceVideos) {
      console.warn(`  Warning: no data for ${src.handle}, skipping`);
      continue;
    }

    // Apply percentile filter: log-scaled from 10% (biggest) to 50% (smallest)
    let filtered = [...sourceVideos];
    const pct = src.topPercentile ?? calcPercentile(filtered.length || 1);
    if (filtered.length > 0 && pct < 100) {
      filtered.sort((a, b) => (b.view_count || 0) - (a.view_count || 0));
      const cutoff = Math.ceil(filtered.length * (pct / 100));
      console.log(`  ${src.name}: top ${pct}% — ${filtered.length} → ${cutoff} videos`);
      filtered = filtered.slice(0, cutoff);
    }

    for (const raw of filtered) {
      const prev = existingVideos.get(raw.id);
      if (prev && prev.tags && prev.tags.length > 1) {
        prev.viewCount = raw.view_count || prev.viewCount || 0;
        allVideos.push(prev);
      } else {
        totalNew++;
        allVideos.push({
          id: raw.id,
          title: raw.title || "",
          duration: raw.duration || 0,
          date: "",
          tags: [src.name],
          source: src.name,
          viewCount: raw.view_count || 0,
          description: (raw.description || "").slice(0, 300),
        });
      }
    }
  }

  catalog.stations[station.id] = { videos: allVideos, categoryVideoIds: {} };
  if (allVideos.length === 0) {
    emptyStations.push(station.id);
  }

  const sourceNames = station.sources.map((s) => s.name).join(" + ");
  const newInStation = allVideos.filter((v) => v.description).length;
  console.log(
    `${station.id}: ${allVideos.length} videos (${sourceNames}), ${newInStation} new`
  );
}

catalog.lastUpdated = new Date().toISOString();
fs.writeFileSync(OUTPUT, JSON.stringify(catalog));
const summaryOutput = path.join(path.dirname(OUTPUT), "catalog-summary.json");
const catalogSummary = {
  lastUpdated: catalog.lastUpdated,
  totalVideos: Object.values(catalog.stations).reduce((total, station) => total + station.videos.length, 0),
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
    `Catalog build produced empty stations: ${emptyStations.join(", ")}. Refusing to ship an empty TV catalog.`
  );
  process.exit(1);
}
