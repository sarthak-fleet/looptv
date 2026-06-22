// Fast per-channel fetch: flat playlist listing, then one bounded enrich call.
// Usage: node scripts/fetch-channel.mjs @handle [--fresh]

import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";
import {
  MAX_VIDEOS_PER_SOURCE,
  hasViewCountsInJsonl,
  resolveTopPercentile,
} from "./catalog-quality.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "data", "sources");
const STATIONS_PATH = path.join(__dirname, "..", "stations.json");

const MIN_CACHE_ROWS = Number(process.env.MIN_CACHE_ROWS_TO_TRUST || 5);
const CACHE_MAX_AGE_DAYS = Number(process.env.CACHE_MAX_AGE_DAYS || 13);
const SMALL_CHANNEL_ENRICH_ALL = Number(process.env.SMALL_CHANNEL_ENRICH_ALL || 100);
const YT_DLP_RETRIES = Number(process.env.YT_DLP_RETRIES || 4);
const BOT_ERROR = /not a bot|sign in to confirm|confirm you're not a bot|bot detection/i;

export function findSourceByHandle(handle) {
  const normalized = handle.replace(/^@/, "");
  const stations = JSON.parse(fs.readFileSync(STATIONS_PATH, "utf8"));
  for (const station of stations) {
    for (const src of station.sources) {
      if (src.handle.replace(/^@/, "") === normalized) {
        return src;
      }
    }
  }
  return { name: normalized, handle, minDuration: 60, maxDuration: 3600 };
}

export function filterFlatByDuration(flatVideos, minDur, maxDur) {
  return flatVideos.filter((video) => {
    const duration = video.duration || 0;
    return duration >= minDur && duration <= maxDur;
  });
}

/** How many full-metadata rows to pull for large channels (popular sort). */
export function computeEnrichBudget(filteredCount, source) {
  if (filteredCount <= SMALL_CHANNEL_ENRICH_ALL) return filteredCount;
  const pct = resolveTopPercentile(source, filteredCount) / 100;
  const target = Math.min(
    MAX_VIDEOS_PER_SOURCE,
    Math.max(1, Math.ceil(filteredCount * pct)),
  );
  return Math.min(filteredCount, Math.max(250, target * 2));
}

export function isBotDetectionError(message) {
  return BOT_ERROR.test(message || "");
}

/** Shared yt-dlp flags for CI resilience (single-process playlist fetches). */
export function ytDlpBaseArgs() {
  const args = [
    "--no-warnings",
    "--retries",
    "3",
    "--fragment-retries",
    "3",
    "--sleep-requests",
    "1",
    "--extractor-args",
    "youtube:player_client=android,web",
  ];
  const sleepInterval = process.env.YT_DLP_SLEEP_INTERVAL;
  if (sleepInterval) {
    args.push("--sleep-interval", sleepInterval, "--max-sleep-interval", sleepInterval);
  }
  return args;
}

function sleepSeconds(seconds) {
  spawnSync("sleep", [String(seconds)], { encoding: "utf8" });
}

function cacheIsFresh(filePath) {
  const mtimeMs = fs.statSync(filePath).mtimeMs;
  const ageDays = (Date.now() - mtimeMs) / 86_400_000;
  return ageDays <= CACHE_MAX_AGE_DAYS;
}

function matchFilter(minDur, maxDur) {
  return ["--match-filter", `view_count >= 10000 & duration >= ${minDur} & duration <= ${maxDur}`];
}

function parseJsonLines(stdout) {
  const rows = [];
  for (const line of stdout.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      rows.push(JSON.parse(trimmed));
    } catch {
      // --ignore-errors can emit non-JSON noise for broken entries
    }
  }
  return rows;
}

export function runYtDlpLines(args, { retries = YT_DLP_RETRIES } = {}) {
  let lastError = null;

  for (let attempt = 0; attempt < retries; attempt += 1) {
    if (attempt > 0) {
      const delay = 8 * attempt * attempt;
      sleepSeconds(delay);
    }

    const result = spawnSync("yt-dlp", args, {
      encoding: "utf8",
      maxBuffer: 256 * 1024 * 1024,
    });

    if (result.error) {
      lastError = result.error;
      continue;
    }

    const stderr = result.stderr || "";
    const stdout = result.stdout || "";
    const rows = stdout.trim() ? parseJsonLines(stdout) : [];

    if (rows.length > 0) return rows;

    if (result.status === 0) return rows;

    lastError = new Error(stderr.slice(0, 400) || `yt-dlp exited ${result.status}`);
    if (!isBotDetectionError(stderr) && attempt >= retries - 1) break;
  }

  throw lastError || new Error("yt-dlp failed with no output");
}

function writeJsonl(filePath, rows) {
  fs.writeFileSync(
    filePath,
    rows.map((row) => JSON.stringify(row)).join("\n") + (rows.length ? "\n" : ""),
  );
}

function readCachedCount(outputPath) {
  if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size === 0) return 0;
  return fs.readFileSync(outputPath, "utf8").trim().split("\n").filter(Boolean).length;
}

function cacheFallback(safe, outputPath, reason) {
  const cachedLines = readCachedCount(outputPath);
  if (cachedLines > 0) {
    console.log(`  @${safe.padEnd(30)} ${reason}, kept cache (${cachedLines} videos)`);
    return { handle: safe, mode: "cache-fallback", count: cachedLines };
  }
  console.log(`  @${safe.padEnd(30)} ${reason}, no cache`);
  return { handle: safe, mode: "failed", count: 0 };
}

function enrichPlaylist(channelUrl, playlistEnd, minDur, maxDur) {
  return runYtDlpLines([
    ...ytDlpBaseArgs(),
    "--dump-json",
    "--ignore-errors",
    "--playlist-end",
    String(playlistEnd),
    ...matchFilter(minDur, maxDur),
    channelUrl,
  ]);
}

export function fetchChannel(handle, { fresh = false } = {}) {
  const source = findSourceByHandle(handle);
  const safe = handle.replace(/^@/, "");
  const outputPath = path.join(DATA_DIR, `${safe}.jsonl`);
  const minDur = source.minDuration ?? 60;
  const maxDur = source.maxDuration ?? 3600;
  const channelUrl = `https://www.youtube.com/${handle.startsWith("@") ? handle : `@${handle}`}/videos`;

  fs.mkdirSync(DATA_DIR, { recursive: true });

  if (
    !fresh &&
    fs.existsSync(outputPath) &&
    fs.statSync(outputPath).size > 0
  ) {
    const cachedLines = readCachedCount(outputPath);
    if (
      cachedLines >= MIN_CACHE_ROWS &&
      hasViewCountsInJsonl(outputPath, fs) &&
      cacheIsFresh(outputPath)
    ) {
      console.log(`  @${safe.padEnd(30)} CACHED (${cachedLines} videos)`);
      return { handle: safe, mode: "cached", count: cachedLines };
    }
  }

  let flat;
  try {
    flat = runYtDlpLines([
      ...ytDlpBaseArgs(),
      "--flat-playlist",
      "--dump-json",
      channelUrl,
    ]);
  } catch (error) {
    return cacheFallback(safe, outputPath, `flat failed (${error.message.slice(0, 80)})`);
  }

  const durationFiltered = filterFlatByDuration(flat, minDur, maxDur);
  const budget = computeEnrichBudget(durationFiltered.length, source);

  if (durationFiltered.length === 0) {
    writeJsonl(outputPath, []);
    console.log(`  @${safe.padEnd(30)} empty flat=${flat.length}`);
    return { handle: safe, mode: "empty", count: 0 };
  }

  const isSmall = durationFiltered.length <= SMALL_CHANNEL_ENRICH_ALL;
  const enrichUrl = isSmall ? channelUrl : `${channelUrl}?view=0&sort=p`;
  const playlistEnd = isSmall ? durationFiltered.length : budget;
  const mode = isSmall ? "playlist-all" : "popular-sample";

  let enriched;
  try {
    enriched = enrichPlaylist(enrichUrl, playlistEnd, minDur, maxDur);
  } catch (error) {
    return cacheFallback(safe, outputPath, `enrich failed (${error.message.slice(0, 80)})`);
  }

  if (enriched.length > 0 && enriched.some((row) => typeof row.view_count === "number")) {
    const deduped = [...new Map(enriched.map((row) => [row.id, row])).values()];
    writeJsonl(outputPath, deduped);
    console.log(
      `  @${safe.padEnd(30)} ${mode} flat=${flat.length} dur=${durationFiltered.length} enriched=${deduped.length}`,
    );
    return { handle: safe, mode, count: deduped.length };
  }

  return cacheFallback(safe, outputPath, "enrich produced no view counts");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const fresh = args.includes("--fresh");
  const handleArg = args.find((arg) => arg.startsWith("@") && !arg.endsWith(".mjs"));
  if (!handleArg || handleArg.endsWith(".mjs")) {
    console.error("Usage: node scripts/fetch-channel.mjs @handle [--fresh]");
    process.exit(1);
  }

  fetchChannel(handleArg.startsWith("@") ? handleArg : `@${handleArg}`, { fresh });
  process.exit(0);
}
