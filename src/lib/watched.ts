const WATCHED_KEY = "looptv_watched";
const STATS_KEY = "looptv_stats";
const BLOCKED_KEY = "looptv_blocked_sources";
const WATCH_LATER_KEY = "looptv_watch_later";
const SMART_MIX_KEY = "looptv_smart_mix_profile";

export interface WatchStats {
  totalWatched: number;
  totalSeconds: number;
  byStation: Record<string, number>;
  bySource: Record<string, number>;
  lastWatched: string; // ISO date
}

function defaultStats(): WatchStats {
  return {
    totalWatched: 0,
    totalSeconds: 0,
    byStation: {},
    bySource: {},
    lastWatched: "",
  };
}

export function getWatchedIds(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(WATCHED_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

export function markWatched(
  videoId: string,
  duration: number,
  stationId: string,
  source: string
): void {
  if (typeof window === "undefined") return;

  // Add to watched set
  const ids = getWatchedIds();
  if (ids.has(videoId)) return; // already tracked
  ids.add(videoId);
  localStorage.setItem(WATCHED_KEY, JSON.stringify([...ids]));

  // Update stats
  const stats = getStats();
  stats.totalWatched++;
  stats.totalSeconds += duration;
  stats.byStation[stationId] = (stats.byStation[stationId] || 0) + 1;
  stats.bySource[source] = (stats.bySource[source] || 0) + 1;
  stats.lastWatched = new Date().toISOString();
  localStorage.setItem(STATS_KEY, JSON.stringify(stats));
}

export function getStats(): WatchStats {
  if (typeof window === "undefined") return defaultStats();
  try {
    const raw = localStorage.getItem(STATS_KEY);
    return raw ? { ...defaultStats(), ...JSON.parse(raw) } : defaultStats();
  } catch {
    return defaultStats();
  }
}

export function clearWatched(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(WATCHED_KEY);
  localStorage.removeItem(STATS_KEY);
}

export function getBlockedSources(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(BLOCKED_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

export function blockSource(source: string): void {
  if (typeof window === "undefined") return;
  const blocked = getBlockedSources();
  blocked.add(source);
  localStorage.setItem(BLOCKED_KEY, JSON.stringify([...blocked]));
}

export function unblockSource(source: string): void {
  if (typeof window === "undefined") return;
  const blocked = getBlockedSources();
  blocked.delete(source);
  localStorage.setItem(BLOCKED_KEY, JSON.stringify([...blocked]));
}

export function getWatchLater(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(WATCH_LATER_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function addWatchLater(videoId: string): void {
  if (typeof window === "undefined") return;
  const list = getWatchLater();
  if (!list.includes(videoId)) {
    list.push(videoId);
    localStorage.setItem(WATCH_LATER_KEY, JSON.stringify(list));
  }
}

export function removeWatchLater(videoId: string): void {
  if (typeof window === "undefined") return;
  const list = getWatchLater().filter((id) => id !== videoId);
  localStorage.setItem(WATCH_LATER_KEY, JSON.stringify(list));
}

export function getSmartMixProfileRaw(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(SMART_MIX_KEY);
}

export function setSmartMixProfileRaw(raw: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(SMART_MIX_KEY, raw);
}

export function resetSmartMixProfile(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(SMART_MIX_KEY);
}

const PREFS_KEY = "looptv_prefs";

export interface UserPrefs {
  defaultStation: string | null;
  hideWatched: boolean;
  autoplayOnLoad: boolean;
  startMuted: boolean;
}

function defaultPrefs(): UserPrefs {
  return {
    defaultStation: null,
    hideWatched: true,
    autoplayOnLoad: false,
    startMuted: false,
  };
}

export function getUserPrefs(): UserPrefs {
  if (typeof window === "undefined") return defaultPrefs();
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    return raw ? { ...defaultPrefs(), ...JSON.parse(raw) } : defaultPrefs();
  } catch {
    return defaultPrefs();
  }
}

export function setUserPrefs(patch: Partial<UserPrefs>): UserPrefs {
  if (typeof window === "undefined") return defaultPrefs();
  const next = { ...getUserPrefs(), ...patch };
  localStorage.setItem(PREFS_KEY, JSON.stringify(next));
  return next;
}

export function resetUserPrefs(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(PREFS_KEY);
}
