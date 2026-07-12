const API_BASE = 'https://www.googleapis.com/youtube/v3';

export const DEFAULT_RECENT_VIDEO_LIMIT = 250;
export const YOUTUBE_BATCH_SIZE = 50;

export function uploadsPlaylistId(channelId) {
  if (!/^UC[A-Za-z0-9_-]{20,}$/.test(channelId || '')) {
    throw new Error('Configured YouTube channel ID is invalid');
  }
  return `UU${channelId.slice(2)}`;
}

export function parseIsoDuration(value) {
  const match = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/.exec(value || '');
  if (!match) return 0;
  const [, days = '0', hours = '0', minutes = '0', seconds = '0'] = match;
  return Math.round(
    Number(days) * 86_400 + Number(hours) * 3_600 + Number(minutes) * 60 + Number(seconds)
  );
}

export function chunkIds(ids, size = YOUTUBE_BATCH_SIZE) {
  const chunks = [];
  for (let index = 0; index < ids.length; index += size) {
    chunks.push(ids.slice(index, index + size));
  }
  return chunks;
}

function safeApiReason(body, status) {
  const reason = body?.error?.errors?.[0]?.reason || body?.error?.status;
  return reason ? `${status} ${reason}` : String(status);
}

async function getJson(resource, params, { apiKey, fetchImpl, metrics, maxRequests }) {
  if (metrics.apiRequests >= maxRequests) {
    const error = new Error(`YouTube Data API per-source request budget reached (${maxRequests})`);
    error.apiRequests = metrics.apiRequests;
    throw error;
  }
  const url = new URL(`${API_BASE}/${resource}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') url.searchParams.set(key, String(value));
  }
  url.searchParams.set('key', apiKey);
  metrics.apiRequests += 1;

  let response;
  try {
    response = await fetchImpl(url);
  } catch {
    const error = new Error('YouTube Data API network request failed');
    error.apiRequests = metrics.apiRequests;
    throw error;
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(
      `YouTube Data API request failed (${safeApiReason(body, response.status)})`
    );
    error.apiRequests = metrics.apiRequests;
    throw error;
  }
  return body;
}

function apiVideoToRaw(video, fetchedAt) {
  const viewCount = Number(video.statistics?.viewCount);
  const publishedMs = Date.parse(video.snippet?.publishedAt || '');
  return {
    id: video.id,
    title: video.snippet?.title || '',
    description: video.snippet?.description || '',
    duration: parseIsoDuration(video.contentDetails?.duration),
    view_count: Number.isFinite(viewCount) ? viewCount : null,
    channel: video.snippet?.channelTitle || '',
    channel_id: video.snippet?.channelId || '',
    timestamp: Number.isFinite(publishedMs) ? Math.floor(publishedMs / 1000) : null,
    availability: video.status?.privacyStatus || 'public',
    playable_in_embed: video.status?.embeddable !== false,
    webpage_url: `https://www.youtube.com/watch?v=${video.id}`,
    _looptvFetchedAt: fetchedAt,
    _looptvFetchProvider: 'youtube-data-api',
  };
}

export async function fetchYouTubeSource(
  source,
  cachedRows = [],
  {
    apiKey = process.env.YOUTUBE_API_KEY,
    fetchImpl = globalThis.fetch,
    recentLimit = Number(process.env.YOUTUBE_RECENT_VIDEO_LIMIT || DEFAULT_RECENT_VIDEO_LIMIT),
    maxRequests = Number(process.env.YOUTUBE_MAX_REQUESTS_PER_SOURCE || 20),
    fetchedAt = new Date().toISOString(),
  } = {}
) {
  if (!apiKey) throw new Error('YOUTUBE_API_KEY is not configured');
  if (typeof fetchImpl !== 'function') throw new Error('Fetch implementation is unavailable');

  const limit = Math.max(1, Math.min(500, Number.isFinite(recentLimit) ? recentLimit : 250));
  const requestBudget = Math.max(2, Math.min(50, Number.isFinite(maxRequests) ? maxRequests : 20));
  const knownIds = new Set(cachedRows.map((row) => row.id).filter(Boolean));
  const discoveredIds = [];
  const metrics = { apiRequests: 0, playlistRequests: 0, videoRequests: 0 };
  let pageToken = '';
  let stoppedAtKnown = false;

  while (discoveredIds.length < limit) {
    metrics.playlistRequests += 1;
    const body = await getJson(
      'playlistItems',
      {
        part: 'contentDetails',
        playlistId: uploadsPlaylistId(source.channelId),
        maxResults: Math.min(YOUTUBE_BATCH_SIZE, limit - discoveredIds.length),
        pageToken,
      },
      { apiKey, fetchImpl, metrics, maxRequests: requestBudget }
    );
    const pageIds = (Array.isArray(body.items) ? body.items : [])
      .map((item) => item.contentDetails?.videoId)
      .filter(Boolean)
      .slice(0, limit - discoveredIds.length);
    for (const id of pageIds) {
      if (!discoveredIds.includes(id)) discoveredIds.push(id);
    }

    if (knownIds.size > 0 && pageIds.length > 0 && pageIds.every((id) => knownIds.has(id))) {
      stoppedAtKnown = true;
      break;
    }
    if (!body.nextPageToken || pageIds.length === 0) break;
    pageToken = body.nextPageToken;
  }

  const retainedCacheIds = cachedRows
    .filter((row) => row.id)
    .sort((a, b) => (b.view_count || 0) - (a.view_count || 0))
    .slice(0, limit)
    .map((row) => row.id);
  const metadataIds = [...new Set([...discoveredIds, ...retainedCacheIds])];
  const rows = [];

  for (const ids of chunkIds(metadataIds)) {
    metrics.videoRequests += 1;
    const body = await getJson(
      'videos',
      {
        part: 'snippet,contentDetails,statistics,status',
        id: ids.join(','),
        maxResults: YOUTUBE_BATCH_SIZE,
      },
      { apiKey, fetchImpl, metrics, maxRequests: requestBudget }
    );
    rows.push(
      ...(Array.isArray(body.items) ? body.items : [])
        .filter(
          (video) => video.status?.privacyStatus !== 'private' && video.status?.embeddable !== false
        )
        .map((video) => apiVideoToRaw(video, fetchedAt))
    );
  }

  return {
    rows: [...new Map(rows.map((row) => [row.id, row])).values()],
    discoveredCount: discoveredIds.length,
    stoppedAtKnown,
    ...metrics,
  };
}
