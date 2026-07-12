// Manual full-history YouTube quality rebaseline.
// Scans complete upload playlists with a global quota/rate guard and checkpoints
// each source as a compact, API-preselected JSONL top set.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  MIN_VIEW_COUNT,
  qualifiesRawVideo,
  resolveMaxVideos,
  resolveTopPercentile,
} from './catalog-quality.mjs';
import {
  chunkIds,
  parseIsoDuration,
  uploadsPlaylistId,
  YOUTUBE_BATCH_SIZE,
} from './youtube-data-api.mjs';

const API_BASE = 'https://www.googleapis.com/youtube/v3';
const DEFAULT_MAX_REQUESTS = 4_500;
const DEFAULT_REQUESTS_PER_SECOND = 5;

export function sourcePolicyKey(source) {
  return [
    source.minDuration ?? 60,
    source.maxDuration ?? 3600,
    source.topPercentile ?? 'auto',
    MIN_VIEW_COUNT,
    resolveMaxVideos(source),
  ].join(':');
}

export function estimateFullAuditRequests(publicVideoCounts, sourceCount) {
  const channelRequests = Math.ceil(sourceCount / YOUTUBE_BATCH_SIZE);
  const sourceRequests = publicVideoCounts.reduce(
    (total, count) => total + Math.ceil(Math.max(0, count) / YOUTUBE_BATCH_SIZE) * 2,
    0
  );
  return channelRequests + sourceRequests;
}

export function checkpointQualifies(rows, source) {
  if (rows.length === 0) return false;
  const policy = sourcePolicyKey(source);
  return rows.every(
    (row) =>
      row._looptvFetchProvider === 'youtube-data-api' &&
      typeof row._looptvFullAuditAt === 'string' &&
      row._looptvFullAuditAt.length > 0 &&
      row._looptvQualityPolicy === policy &&
      Number(row._looptvCandidateCount) >= rows.length &&
      Number(row._looptvPublicUploadCount) >= rows.length
  );
}

export function selectFullHistoryRows(rows, source, { auditedAt, publicUploadCount }) {
  const minDuration = source.minDuration ?? 60;
  const maxDuration = source.maxDuration ?? 3600;
  const eligible = [...new Map(rows.map((row) => [row.id, row])).values()]
    .filter(
      (row) =>
        row.availability !== 'private' &&
        row.playable_in_embed !== false &&
        qualifiesRawVideo(row, minDuration, maxDuration)
    )
    .sort((a, b) => b.view_count - a.view_count);
  const candidateCount = eligible.length;
  const pct = resolveTopPercentile(source, candidateCount);
  const selectionLimit = Math.min(
    resolveMaxVideos(source),
    Math.max(1, Math.ceil(candidateCount * (pct / 100)))
  );
  const policy = sourcePolicyKey(source);
  return {
    candidateCount,
    pct,
    selected: eligible.slice(0, selectionLimit).map((row) => ({
      ...row,
      _looptvPreselected: true,
      _looptvCandidateCount: candidateCount,
      _looptvPublicUploadCount: publicUploadCount,
      _looptvFullAuditAt: auditedAt,
      _looptvQualityPolicy: policy,
    })),
  };
}

export class RequestBudget {
  constructor({
    maxRequests = DEFAULT_MAX_REQUESTS,
    requestsPerSecond = DEFAULT_REQUESTS_PER_SECOND,
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  } = {}) {
    this.maxRequests = maxRequests;
    this.minimumIntervalMs = Math.ceil(1_000 / requestsPerSecond);
    this.sleep = sleep;
    this.requests = 0;
    this.lastRequestAt = 0;
  }

  async beforeRequest() {
    if (this.requests >= this.maxRequests) {
      throw new Error(`Full catalog audit request budget reached (${this.maxRequests})`);
    }
    const waitMs = this.lastRequestAt + this.minimumIntervalMs - Date.now();
    if (waitMs > 0) await this.sleep(waitMs);
    this.requests += 1;
    this.lastRequestAt = Date.now();
  }
}

async function requestJson(resource, params, { apiKey, fetchImpl, budget }) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await budget.beforeRequest();
    const url = new URL(`${API_BASE}/${resource}`);
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== '') url.searchParams.set(key, String(value));
    }
    url.searchParams.set('key', apiKey);
    try {
      const response = await fetchImpl(url);
      const body = await response.json().catch(() => ({}));
      if (response.ok) return body;
      const reason = body?.error?.errors?.[0]?.reason || body?.error?.status || response.status;
      lastError = new Error(`YouTube Data API ${resource} failed (${response.status} ${reason})`);
      if (response.status !== 429 && response.status < 500) throw lastError;
    } catch (error) {
      lastError = error;
    }
    if (attempt < 2) await budget.sleep(1_000 * (attempt + 1));
  }
  throw lastError || new Error(`YouTube Data API ${resource} failed`);
}

function apiVideoToRaw(video, fetchedAt) {
  const publishedMs = Date.parse(video.snippet?.publishedAt || '');
  const viewCount = Number(video.statistics?.viewCount);
  return {
    id: video.id,
    title: video.snippet?.title || '',
    description: video.snippet?.description || '',
    duration: parseIsoDuration(video.contentDetails?.duration),
    view_count: Number.isFinite(viewCount) ? viewCount : null,
    channel: video.snippet?.channelTitle || '',
    channel_id: video.snippet?.channelId || '',
    timestamp: Number.isFinite(publishedMs) ? Math.floor(publishedMs / 1_000) : null,
    availability: video.status?.privacyStatus || 'public',
    playable_in_embed: video.status?.embeddable !== false,
    webpage_url: `https://www.youtube.com/watch?v=${video.id}`,
    _looptvFetchedAt: fetchedAt,
    _looptvFetchProvider: 'youtube-data-api',
  };
}

export async function fetchFullSource(
  source,
  {
    apiKey,
    fetchImpl = globalThis.fetch,
    budget,
    auditedAt = new Date().toISOString(),
    onProgress = () => {},
  }
) {
  const ids = [];
  let pageToken = '';
  let playlistRequests = 0;
  do {
    const body = await requestJson(
      'playlistItems',
      {
        part: 'contentDetails',
        playlistId: uploadsPlaylistId(source.channelId),
        maxResults: YOUTUBE_BATCH_SIZE,
        pageToken,
      },
      { apiKey, fetchImpl, budget }
    );
    playlistRequests += 1;
    for (const item of body.items || []) {
      const id = item.contentDetails?.videoId;
      if (id) ids.push(id);
    }
    pageToken = body.nextPageToken || '';
    onProgress({ phase: 'playlist', count: ids.length, requests: budget.requests });
  } while (pageToken);

  const rows = [];
  let videoRequests = 0;
  for (const idsBatch of chunkIds(ids)) {
    const body = await requestJson(
      'videos',
      {
        part: 'snippet,contentDetails,statistics,status',
        id: idsBatch.join(','),
        maxResults: YOUTUBE_BATCH_SIZE,
      },
      { apiKey, fetchImpl, budget }
    );
    videoRequests += 1;
    rows.push(...(body.items || []).map((video) => apiVideoToRaw(video, auditedAt)));
    onProgress({ phase: 'metadata', count: rows.length, requests: budget.requests });
  }

  const selection = selectFullHistoryRows(rows, source, {
    auditedAt,
    publicUploadCount: ids.length,
  });
  return { ...selection, publicUploadCount: ids.length, playlistRequests, videoRequests };
}

function readRows(filePath) {
  if (!fs.existsSync(filePath) || fs.statSync(filePath).size === 0) return [];
  return fs
    .readFileSync(filePath, 'utf8')
    .split('\n')
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [JSON.parse(line)];
      } catch {
        return [];
      }
    });
}

function writeRows(filePath, rows) {
  fs.writeFileSync(filePath, `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`);
}

async function channelVideoCounts(sources, options) {
  const counts = new Map();
  for (const sourceBatch of chunkIds(sources)) {
    const body = await requestJson(
      'channels',
      {
        part: 'statistics',
        id: sourceBatch.map((source) => source.channelId).join(','),
        maxResults: YOUTUBE_BATCH_SIZE,
      },
      options
    );
    for (const channel of body.items || []) {
      counts.set(channel.id, Number(channel.statistics?.videoCount || 0));
    }
  }
  return counts;
}

export async function runFullRebaseline({
  stations,
  dataDir,
  apiKey,
  fetchImpl = globalThis.fetch,
  maxRequests = DEFAULT_MAX_REQUESTS,
  requestsPerSecond = DEFAULT_REQUESTS_PER_SECOND,
  fresh = false,
  output = console.log,
}) {
  if (!apiKey) throw new Error('YOUTUBE_API_KEY is not configured');
  fs.mkdirSync(dataDir, { recursive: true });
  const sources = stations.flatMap((station) =>
    station.sources.map((source) => ({ ...source, stationId: station.id }))
  );
  const budget = new RequestBudget({ maxRequests, requestsPerSecond });
  const pending = [];
  const report = [];
  for (const source of sources) {
    const filePath = path.join(dataDir, `${source.handle.replace(/^@/, '')}.jsonl`);
    const rows = readRows(filePath);
    if (!fresh && checkpointQualifies(rows, source)) {
      report.push({
        stationId: source.stationId,
        source: source.name,
        status: 'checkpoint',
        publicUploads: Number(rows[0]._looptvPublicUploadCount),
        candidates: Number(rows[0]._looptvCandidateCount),
        selected: rows.length,
        percentile: resolveTopPercentile(source, Number(rows[0]._looptvCandidateCount)),
        minimumViews: Math.min(...rows.map((row) => row.view_count)),
        requests: 0,
        baselineRequests:
          Number(rows[0]._looptvFullAuditRequests) ||
          Math.ceil(Number(rows[0]._looptvPublicUploadCount) / YOUTUBE_BATCH_SIZE) * 2,
      });
    } else {
      pending.push({ source, filePath });
    }
  }

  const counts = await channelVideoCounts(
    pending.map(({ source }) => source),
    { apiKey, fetchImpl, budget }
  );
  const estimate =
    budget.requests +
    pending.reduce(
      (total, { source }) =>
        total + Math.ceil((counts.get(source.channelId) || 0) / YOUTUBE_BATCH_SIZE) * 2,
      0
    );
  output(
    `Full audit preflight: ${pending.length}/${sources.length} sources pending; estimated ${estimate}/${maxRequests} requests at ${requestsPerSecond} req/s`
  );
  if (estimate > maxRequests)
    throw new Error(`Estimated full audit requests ${estimate} exceed budget ${maxRequests}`);

  for (const { source, filePath } of pending) {
    const startRequests = budget.requests;
    let lastProgressCount = 0;
    const result = await fetchFullSource(source, {
      apiKey,
      fetchImpl,
      budget,
      onProgress: ({ phase, count, requests }) => {
        if (count - lastProgressCount >= 500) {
          output(`${source.stationId}/${source.name}: ${phase}=${count} requests=${requests}`);
          lastProgressCount = count;
        }
      },
    });
    const sourceRequests = budget.requests - startRequests;
    const selected = result.selected.map((row) => ({
      ...row,
      _looptvFullAuditRequests: sourceRequests,
    }));
    writeRows(filePath, selected);
    const row = {
      stationId: source.stationId,
      source: source.name,
      status: 'fetched',
      publicUploads: result.publicUploadCount,
      candidates: result.candidateCount,
      selected: selected.length,
      percentile: result.pct,
      minimumViews: result.selected.at(-1)?.view_count || 0,
      requests: sourceRequests,
      baselineRequests: sourceRequests,
    };
    report.push(row);
    output(
      `${source.stationId}/${source.name}: uploads=${row.publicUploads} candidates=${row.candidates} selected=${row.selected} top=${row.percentile}% floor=${row.minimumViews.toLocaleString()} requests=${row.requests}`
    );
  }
  return {
    requests: budget.requests,
    estimatedRequests: estimate,
    baselineRequests:
      Math.ceil(sources.length / YOUTUBE_BATCH_SIZE) +
      report.reduce((total, source) => total + source.baselineRequests, 0),
    sources: report.sort(
      (a, b) => a.stationId.localeCompare(b.stationId) || a.source.localeCompare(b.source)
    ),
  };
}

export function formatQualityAuditMarkdown(result) {
  const lines = [
    '# Catalog quality audit',
    '',
    `- Sources: ${result.sources.length}`,
    `- Full-history baseline requests: ${result.baselineRequests.toLocaleString()}`,
    `- Requests made by this run: ${result.requests.toLocaleString()}`,
    `- Global ceiling: 4,500 requests`,
    `- Request rate: 5 requests/second`,
    '',
  ];
  let stationId = '';
  for (const source of result.sources) {
    if (source.stationId !== stationId) {
      stationId = source.stationId;
      lines.push(`## ${stationId}`, '');
      lines.push(
        '| Source | Baseline | Public uploads | Eligible | Selected | Top | View floor | Baseline requests |'
      );
      lines.push('| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |');
    }
    lines.push(
      `| ${source.source} | full-history | ${source.publicUploads.toLocaleString()} | ${source.candidates.toLocaleString()} | ${source.selected.toLocaleString()} | ${source.percentile}% | ${source.minimumViews.toLocaleString()} | ${source.baselineRequests.toLocaleString()} |`
    );
  }
  return `${lines.join('\n')}\n`;
}

function argValue(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
  const stations = JSON.parse(fs.readFileSync(path.join(root, 'stations.json'), 'utf8'));
  const dataDir = argValue('--data-dir', path.join(root, 'data', 'sources'));
  const reportPath = argValue('--report', path.join(root, 'data', 'catalog-quality-audit.json'));
  const markdownPath = argValue(
    '--markdown-report',
    path.join(root, 'docs', 'catalog-quality-audit.md')
  );
  runFullRebaseline({
    stations,
    dataDir,
    apiKey: process.env.YOUTUBE_API_KEY,
    maxRequests: Number(argValue('--max-requests', DEFAULT_MAX_REQUESTS)),
    requestsPerSecond: Number(argValue('--requests-per-second', DEFAULT_REQUESTS_PER_SECOND)),
    fresh: process.argv.includes('--fresh'),
  })
    .then((result) => {
      fs.writeFileSync(
        reportPath,
        `${JSON.stringify({ generatedAt: new Date().toISOString(), ...result }, null, 2)}\n`
      );
      fs.writeFileSync(markdownPath, formatQualityAuditMarkdown(result));
      console.log(`Full audit complete: ${result.requests} requests; report=${reportPath}`);
    })
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}
