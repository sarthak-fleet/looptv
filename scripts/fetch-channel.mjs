// Cache-first per-channel fetch: bounded YouTube Data API, then yt-dlp fallback.
// Usage: node scripts/fetch-channel.mjs @handle [--fresh]

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  MIN_VIEW_COUNT,
  hasViewCountsInJsonl,
  resolveMaxVideos,
  resolveTopPercentile,
} from './catalog-quality.mjs';
import { fetchYouTubeSource } from './youtube-data-api.mjs';
import { sourcePolicyKey } from './full-catalog-rebaseline.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data', 'sources');
const STATIONS_PATH = path.join(__dirname, '..', 'stations.json');
const CATALOG_PATH = path.join(__dirname, '..', 'public', 'catalog.json');

const MIN_CACHE_ROWS = Number(process.env.MIN_CACHE_ROWS_TO_TRUST || 5);
const CACHE_MAX_AGE_DAYS = Number(process.env.CACHE_MAX_AGE_DAYS || 13);
const SMALL_CHANNEL_ENRICH_ALL = Number(process.env.SMALL_CHANNEL_ENRICH_ALL || 100);
const YT_DLP_RETRIES = Number(process.env.YT_DLP_RETRIES || 4);
const BOT_ERROR = /not a bot|sign in to confirm|confirm you're not a bot|bot detection/i;

export function findSourceByHandle(handle) {
  const normalized = handle.replace(/^@/, '');
  const stations = JSON.parse(fs.readFileSync(STATIONS_PATH, 'utf8'));
  for (const station of stations) {
    for (const src of station.sources) {
      if (src.handle.replace(/^@/, '') === normalized) {
        return { ...src, stationId: station.id };
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
  const target = Math.min(resolveMaxVideos(source), Math.max(1, Math.ceil(filteredCount * pct)));
  return Math.min(filteredCount, Math.max(250, target * 2));
}

export function minimumCompleteEnrichment(durationFilteredCount, budget) {
  if (durationFilteredCount <= SMALL_CHANNEL_ENRICH_ALL) {
    return Math.max(1, Math.ceil(durationFilteredCount * 0.5));
  }
  return Math.max(5, Math.min(50, Math.ceil(budget * 0.1)));
}

export function isEnrichmentComplete(enrichedCount, durationFilteredCount, budget) {
  return enrichedCount >= minimumCompleteEnrichment(durationFilteredCount, budget);
}

export function isBotDetectionError(message) {
  return BOT_ERROR.test(message || '');
}

export function ytDlpTimeoutMs(env = process.env) {
  const timeout = Number(env.YT_DLP_TIMEOUT_MS || 0);
  return Number.isFinite(timeout) && timeout > 0 ? timeout : undefined;
}

/** Shared yt-dlp flags for CI resilience (single-process playlist fetches). */
export function ytDlpBaseArgs() {
  const args = [
    '--no-warnings',
    '--retries',
    '3',
    '--fragment-retries',
    '3',
    '--sleep-requests',
    '1',
    '--extractor-args',
    'youtube:player_client=android,web',
  ];
  const sleepInterval = process.env.YT_DLP_SLEEP_INTERVAL;
  if (sleepInterval) {
    args.push('--sleep-interval', sleepInterval, '--max-sleep-interval', sleepInterval);
  }
  return args;
}

function sleepSeconds(seconds) {
  spawnSync('sleep', [String(seconds)], { encoding: 'utf8' });
}

export function cacheQualifies({ fresh, cachedLines, hasViewCounts, ageDays, trustedApi }) {
  const minimumRows = trustedApi ? 1 : MIN_CACHE_ROWS;
  return !fresh && cachedLines >= minimumRows && hasViewCounts && ageDays <= CACHE_MAX_AGE_DAYS;
}

export function cacheAgeDays(rows, fileMtimeMs, nowMs = Date.now()) {
  const timestamps = rows
    .map((row) => Date.parse(row._looptvFetchedAt || ''))
    .filter(Number.isFinite);
  const fetchedAtMs = timestamps.length > 0 ? Math.max(...timestamps) : fileMtimeMs;
  return (nowMs - fetchedAtMs) / 86_400_000;
}

export function sourceRowsFromCatalog(catalog, source) {
  const handle = source.handle.replace(/^@/, '');
  const meta = catalog.sourceMeta?.[handle];
  const policy = sourcePolicyKey(source);
  if (
    meta?.qualityBaseline !== 'full-history' ||
    !meta.fullAuditAt ||
    meta.qualityPolicy !== policy
  )
    return [];
  const videos = catalog.stations?.[source.stationId]?.videos || [];
  return videos
    .filter((video) => video.source === source.name)
    .map((video) => ({
      id: video.id,
      title: video.title || '',
      description: '',
      duration: video.duration || 0,
      view_count: video.viewCount,
      timestamp: null,
      availability: 'public',
      playable_in_embed: true,
      webpage_url: `https://www.youtube.com/watch?v=${video.id}`,
      _looptvFetchedAt: meta.lastSuccessfulFetch || meta.fullAuditAt,
      _looptvFetchProvider: 'youtube-data-api',
      _looptvPreselected: true,
      _looptvCandidateCount: meta.videoCount,
      _looptvPublicUploadCount: meta.publicUploadCount,
      _looptvFullAuditAt: meta.fullAuditAt,
      _looptvQualityPolicy: policy,
    }));
}

function catalogBaselineRows(source) {
  try {
    return sourceRowsFromCatalog(JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8')), source);
  } catch {
    return [];
  }
}

function priorCatalogCandidateCount(handle) {
  try {
    const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
    return Number(catalog.sourceMeta?.[handle]?.videoCount || 0);
  } catch {
    return 0;
  }
}

export function selectApiWorkingSet(rows, source, cachedRows = [], previousCandidateCount = 0) {
  const qualifying = [
    ...new Map(
      rows
        .filter((row) => typeof row.view_count === 'number' && row.view_count >= MIN_VIEW_COUNT)
        .map((row) => [row.id, row])
    ).values(),
  ];
  const recordedCandidateCount = cachedRows.reduce(
    (max, row) => Math.max(max, Number(row._looptvCandidateCount || 0)),
    0
  );
  const candidateCount = Math.max(
    recordedCandidateCount,
    cachedRows.length,
    Number(previousCandidateCount || 0),
    qualifying.length
  );
  const pct = resolveTopPercentile(source, candidateCount);
  const selectionLimit = Math.min(
    resolveMaxVideos(source),
    Math.max(1, Math.ceil(candidateCount * (pct / 100)))
  );
  const verifiedCheckpoint = cachedRows.find(
    (row) => row._looptvFullAuditAt && row._looptvQualityPolicy === sourcePolicyKey(source)
  );
  return {
    candidateCount,
    pct,
    rows: qualifying
      .sort((a, b) => b.view_count - a.view_count)
      .slice(0, selectionLimit)
      .map((row) => ({
        ...row,
        _looptvPreselected: true,
        _looptvCandidateCount: candidateCount,
        ...(verifiedCheckpoint
          ? {
              _looptvFullAuditAt: verifiedCheckpoint._looptvFullAuditAt,
              _looptvPublicUploadCount: verifiedCheckpoint._looptvPublicUploadCount,
              _looptvQualityPolicy: verifiedCheckpoint._looptvQualityPolicy,
            }
          : {}),
      })),
  };
}

/** Duration-only at fetch time; view-count + top-N applied in process-catalog.mjs */
function durationMatchFilter(minDur, maxDur) {
  return ['--match-filter', `duration >= ${minDur} & duration <= ${maxDur}`];
}

function parseJsonLines(stdout) {
  const rows = [];
  for (const line of stdout.split('\n')) {
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

    const timeout = ytDlpTimeoutMs();
    const result = spawnSync('yt-dlp', args, {
      encoding: 'utf8',
      maxBuffer: 256 * 1024 * 1024,
      timeout,
    });

    if (result.error) {
      lastError =
        result.error.code === 'ETIMEDOUT'
          ? new Error(`yt-dlp timed out after ${timeout}ms`)
          : result.error;
      if (result.error.code === 'ETIMEDOUT') break;
      continue;
    }

    const stderr = result.stderr || '';
    const stdout = result.stdout || '';
    const rows = stdout.trim() ? parseJsonLines(stdout) : [];

    if (rows.length > 0) return rows;

    if (result.status === 0) return rows;

    lastError = new Error(stderr.slice(0, 400) || `yt-dlp exited ${result.status}`);
    if (!isBotDetectionError(stderr) && attempt >= retries - 1) break;
  }

  throw lastError || new Error('yt-dlp failed with no output');
}

function writeJsonl(filePath, rows, fetchedAt = new Date().toISOString()) {
  fs.writeFileSync(
    filePath,
    rows
      .map((row) => ({
        ...row,
        ...(row._looptvCatalogFallback === true || row._looptvFetchedAt
          ? {}
          : { _looptvFetchedAt: fetchedAt }),
      }))
      .map((row) => JSON.stringify(row))
      .join('\n') + (rows.length ? '\n' : '')
  );
}

function readCachedRows(outputPath) {
  if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size === 0) return [];
  return parseJsonLines(fs.readFileSync(outputPath, 'utf8'));
}

export async function refreshFromYouTubeApi({
  source,
  outputPath,
  minDur,
  maxDur,
  previousCandidateCount = 0,
  apiKey = process.env.YOUTUBE_API_KEY,
  fetchImpl = globalThis.fetch,
}) {
  const cachedRows = readCachedRows(outputPath);
  const apiResult = await fetchYouTubeSource(source, cachedRows, { apiKey, fetchImpl });
  if (apiResult.discoveredCount > 0 && apiResult.rows.length === 0) {
    const error = new Error('YouTube Data API returned no public embeddable video metadata');
    error.apiRequests = apiResult.apiRequests;
    throw error;
  }

  const selection = selectApiWorkingSet(
    filterFlatByDuration(apiResult.rows, minDur, maxDur),
    source,
    cachedRows,
    previousCandidateCount
  );
  if (selection.rows.length === 0 && cachedRows.length > 0) {
    const error = new Error('YouTube Data API produced no qualifying replacement rows');
    error.apiRequests = apiResult.apiRequests;
    throw error;
  }

  writeJsonl(outputPath, selection.rows);
  return { selection, apiResult };
}

function stampLegacyCache(outputPath) {
  const rows = readCachedRows(outputPath);
  if (rows.length === 0 || rows.every((row) => row._looptvFetchedAt)) return;
  const originalFetchedAt = fs.statSync(outputPath).mtime.toISOString();
  writeJsonl(outputPath, rows, originalFetchedAt);
}

function readCachedCount(outputPath) {
  if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size === 0) return 0;
  return fs.readFileSync(outputPath, 'utf8').trim().split('\n').filter(Boolean).length;
}

function cacheFallback(safe, outputPath, reason) {
  const cachedLines = readCachedCount(outputPath);
  if (cachedLines > 0) {
    console.log(`  @${safe.padEnd(30)} ${reason}, kept cache (${cachedLines} videos)`);
    return { handle: safe, mode: 'cache-fallback', count: cachedLines };
  }

  console.log(`  @${safe.padEnd(30)} ${reason}, no cache`);
  return { handle: safe, mode: 'failed', count: 0 };
}

export function handleEmptyDurationResult({
  safe,
  outputPath,
  minDur,
  maxDur,
  flatCount,
  apiRequests = 0,
}) {
  if (readCachedCount(outputPath) > 0) {
    return {
      ...cacheFallback(safe, outputPath, `flat produced no videos in ${minDur}-${maxDur}s range`),
      apiRequests,
    };
  }
  writeJsonl(outputPath, []);
  console.log(`  @${safe.padEnd(30)} empty flat=${flatCount}`);
  return { handle: safe, mode: 'empty', count: 0, apiRequests, flatCount };
}

function enrichPlaylist(channelUrl, playlistEnd, minDur, maxDur) {
  return runYtDlpLines([
    ...ytDlpBaseArgs(),
    '--dump-json',
    '--ignore-errors',
    '--playlist-end',
    String(playlistEnd),
    ...durationMatchFilter(minDur, maxDur),
    channelUrl,
  ]);
}

export async function fetchChannel(handle, { fresh = false } = {}) {
  const source = findSourceByHandle(handle);
  const safe = handle.replace(/^@/, '');
  const outputPath = path.join(DATA_DIR, `${safe}.jsonl`);
  const minDur = source.minDuration ?? 60;
  const maxDur = source.maxDuration ?? 3600;
  const channelUrl = `https://www.youtube.com/${handle.startsWith('@') ? handle : `@${handle}`}/videos`;

  fs.mkdirSync(DATA_DIR, { recursive: true });

  let cachedRows = readCachedRows(outputPath);
  const verifiedPolicy = sourcePolicyKey(source);
  const cacheHasVerifiedBaseline = cachedRows.some(
    (row) => row._looptvFullAuditAt && row._looptvQualityPolicy === verifiedPolicy
  );
  if (!cacheHasVerifiedBaseline) {
    const baselineRows = catalogBaselineRows(source);
    if (baselineRows.length > 0) {
      writeJsonl(outputPath, baselineRows, baselineRows[0]._looptvFetchedAt);
      cachedRows = baselineRows;
    }
  }

  if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0) {
    const cachedLines = readCachedCount(outputPath);
    const ageDays = cacheAgeDays(cachedRows, fs.statSync(outputPath).mtimeMs);
    if (
      cacheQualifies({
        fresh,
        cachedLines,
        hasViewCounts: hasViewCountsInJsonl(outputPath, fs),
        ageDays,
        trustedApi: cachedRows.every((row) => row._looptvFetchProvider === 'youtube-data-api'),
      })
    ) {
      stampLegacyCache(outputPath);
      console.log(`  @${safe.padEnd(30)} CACHED (${cachedLines} videos)`);
      return { handle: safe, mode: 'cached', count: cachedLines, apiRequests: 0 };
    }
  }

  let failedApiRequests = 0;
  if (process.env.YOUTUBE_API_KEY && source.channelId) {
    try {
      const { selection, apiResult } = await refreshFromYouTubeApi({
        source,
        outputPath,
        minDur,
        maxDur,
        previousCandidateCount: priorCatalogCandidateCount(safe),
      });
      console.log(
        `  @${safe.padEnd(30)} youtube-api recent=${apiResult.discoveredCount} candidates=${selection.candidateCount} selected=${selection.rows.length} top=${selection.pct}% requests=${apiResult.apiRequests}${apiResult.stoppedAtKnown ? ' known-stop' : ''}`
      );
      return {
        handle: safe,
        mode: 'youtube-api',
        count: selection.rows.length,
        apiRequests: apiResult.apiRequests,
        playlistRequests: apiResult.playlistRequests,
        videoRequests: apiResult.videoRequests,
      };
    } catch (error) {
      failedApiRequests = error.apiRequests || 0;
      console.warn(`  @${safe.padEnd(30)} YouTube API failed (${error.message}); trying yt-dlp`);
    }
  }

  let flat;
  try {
    flat = runYtDlpLines([...ytDlpBaseArgs(), '--flat-playlist', '--dump-json', channelUrl]);
  } catch (error) {
    return {
      ...cacheFallback(safe, outputPath, `flat failed (${error.message.slice(0, 80)})`),
      apiRequests: failedApiRequests,
    };
  }

  const durationFiltered = filterFlatByDuration(flat, minDur, maxDur);
  const budget = computeEnrichBudget(durationFiltered.length, source);

  if (durationFiltered.length === 0) {
    return handleEmptyDurationResult({
      safe,
      outputPath,
      minDur,
      maxDur,
      flatCount: flat.length,
      apiRequests: failedApiRequests,
    });
  }

  const isSmall = durationFiltered.length <= SMALL_CHANNEL_ENRICH_ALL;
  const enrichUrl = isSmall ? channelUrl : `${channelUrl}?view=0&sort=p`;
  const playlistEnd = isSmall ? durationFiltered.length : budget;
  const mode = isSmall ? 'playlist-all' : 'popular-sample';

  let enriched;
  try {
    enriched = enrichPlaylist(enrichUrl, playlistEnd, minDur, maxDur);
  } catch (error) {
    return {
      ...cacheFallback(safe, outputPath, `enrich failed (${error.message.slice(0, 80)})`),
      apiRequests: failedApiRequests,
    };
  }

  if (enriched.length > 0 && enriched.some((row) => typeof row.view_count === 'number')) {
    const liveRows = [...new Map(enriched.map((row) => [row.id, row])).values()];
    if (!isEnrichmentComplete(liveRows.length, durationFiltered.length, budget)) {
      return {
        ...cacheFallback(
          safe,
          outputPath,
          `incomplete enrich (${liveRows.length}/${minimumCompleteEnrichment(durationFiltered.length, budget)} minimum)`
        ),
        apiRequests: failedApiRequests,
      };
    }
    writeJsonl(outputPath, liveRows);
    console.log(
      `  @${safe.padEnd(30)} ${mode} flat=${flat.length} dur=${durationFiltered.length} enriched=${liveRows.length}`
    );
    return { handle: safe, mode, count: liveRows.length, apiRequests: failedApiRequests };
  }

  return {
    ...cacheFallback(safe, outputPath, 'enrich produced no view counts'),
    apiRequests: failedApiRequests,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const fresh = args.includes('--fresh');
  const handleArg = args.find((arg) => arg.startsWith('@') && !arg.endsWith('.mjs'));
  if (!handleArg || handleArg.endsWith('.mjs')) {
    console.error('Usage: node scripts/fetch-channel.mjs @handle [--fresh]');
    process.exit(1);
  }

  const result = await fetchChannel(handleArg.startsWith('@') ? handleArg : `@${handleArg}`, {
    fresh,
  });
  if (process.env.FETCH_METRICS_FILE) {
    fs.appendFileSync(process.env.FETCH_METRICS_FILE, `${JSON.stringify(result)}\n`);
  }
}
