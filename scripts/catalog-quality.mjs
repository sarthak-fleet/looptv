/** Shared catalog quality rules — keep top videos per source, stable when channels are added. */

export const MIN_VIEW_COUNT = 10_000;
export const MAX_VIDEOS_PER_SOURCE = 200;
export const TOP_PICK_BAND_SIZE = 12;

export function resolveMaxVideos(source = {}) {
  const configured = Number(source.maxVideos);
  return Number.isInteger(configured) && configured > 0 ? configured : MAX_VIDEOS_PER_SOURCE;
}

/**
 * Keep only the top N% of a source's catalog by view count.
 * Thresholds are absolute (per source size), not relative to other channels in the fleet.
 */
export function calcPercentile(count) {
  if (count <= 0) return 50;
  if (count >= 10_000) return 3;
  if (count >= 5_000) return 5;
  if (count >= 2_000) return 8;
  if (count >= 1_000) return 10;
  if (count >= 500) return 15;
  if (count >= 200) return 25;
  if (count >= 75) return 35;
  return 50;
}

export function resolveTopPercentile(source, filteredCount) {
  if (source.topPercentile != null) return source.topPercentile;
  return calcPercentile(filteredCount || 1);
}

export function hasViewCountsInJsonl(filePath, fs) {
  try {
    const sample = fs.readFileSync(filePath, 'utf-8').split('\n').find(Boolean);
    if (!sample) return false;
    const raw = JSON.parse(sample);
    return (
      typeof raw.view_count === 'number' &&
      raw.view_count >= 0 &&
      raw._looptvCatalogFallback !== true
    );
  } catch {
    return false;
  }
}

export function qualifiesRawVideo(raw, minDur, maxDur) {
  const dur = raw.duration || 0;
  if (dur < minDur || dur > maxDur) return false;
  if (typeof raw.view_count !== 'number' || raw.view_count < MIN_VIEW_COUNT) return false;
  return true;
}

export function applySourceQualityFilter(sourceVideos, source) {
  const maxVideos = resolveMaxVideos(source);
  if (sourceVideos.length > 0 && sourceVideos.every((raw) => raw._looptvPreselected === true)) {
    const selected = [...new Map(sourceVideos.map((raw) => [raw.id, raw])).values()]
      .sort((a, b) => b.view_count - a.view_count)
      .slice(0, maxVideos);
    return { filtered: selected, pct: null, mode: 'preselected' };
  }

  if (sourceVideos.some((raw) => raw._looptvCatalogFallback === true)) {
    const merged = [...new Map(sourceVideos.map((raw) => [raw.id, raw])).values()]
      .sort((a, b) => b.view_count - a.view_count)
      .slice(0, maxVideos);
    return { filtered: merged, pct: null, mode: 'preserved' };
  }

  let filtered = sourceVideos.filter(
    (raw) => typeof raw.view_count === 'number' && raw.view_count >= MIN_VIEW_COUNT
  );
  const pct = resolveTopPercentile(source, filtered.length);
  if (filtered.length > 0 && pct < 100) {
    filtered.sort((a, b) => b.view_count - a.view_count);
    const cutoff = Math.ceil(filtered.length * (pct / 100));
    filtered = filtered.slice(0, cutoff);
  }
  if (filtered.length > maxVideos) {
    filtered = filtered.slice(0, maxVideos);
  }
  return { filtered, pct, mode: 'selected' };
}

export function validateCatalogVideo(video, context = '') {
  if (!video?.id) throw new Error(`Missing video id ${context}`.trim());
  if (typeof video.viewCount !== 'number' || video.viewCount < MIN_VIEW_COUNT) {
    throw new Error(
      `Video ${video.id} ${context} has viewCount ${video.viewCount ?? 'missing'} (< ${MIN_VIEW_COUNT})`
    );
  }
}

export function validateCatalog(catalog) {
  for (const [stationId, station] of Object.entries(catalog.stations || {})) {
    for (const video of station.videos || []) {
      validateCatalogVideo(video, `in station ${stationId}`);
    }
  }
}
