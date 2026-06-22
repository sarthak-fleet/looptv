"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import type { Catalog, CatalogSummary, Video } from "@/lib/types";
import { loadCatalog, loadCatalogSummary, refreshCatalog, refreshCatalogSummary, getVideosForStation, pickRandom, getCatalogFreshness, getSourceFreshness } from "@/lib/catalog";
import { getWatchedIds, markWatched, getBlockedSources, blockSource, unblockSource, getWatchLater, addWatchLater, removeWatchLater, getSavedForPlayback, addSavedForPlayback, removeSavedForPlayback, getSmartMixProfileRaw, setSmartMixProfileRaw, resetSmartMixProfile, getEmbedHealth, getQuarantinedSources, unquarantineSource, type EmbedHealthRecord } from "@/lib/watched";
import { derivePlaybackDiagnostic } from "@/lib/playback-diagnostics";
import { isEmbedUnhealthy, getEmbedBlockRate } from "@/lib/source-health";
import { applyPreference, createSmartMixProfile, parseSmartMixProfile, pickSmartMixVideo, serializeSmartMixProfile, type SmartMixProfile } from "@/lib/smartmix";
import { ytErrorReason } from "@/lib/yt-errors";
import { trackActivated, trackCoreAction } from "@/lib/analytics";
import Link from "next/link";
import Player, { type PlayerHandle } from "./Player";
import Search from "./Search";
import ChannelHealth from "./ChannelHealth";
import PlaybackDiagnosticsBanner from "./PlaybackDiagnosticsBanner";
import ControlRail from "./ControlRail";
import stations from "../../channels.config";
import bundledCatalogSummary from "../../public/catalog-summary.json";

const SMART_MIX_ID = "smart-mix";
const INITIAL_CATALOG_SUMMARY = bundledCatalogSummary as CatalogSummary;

export default function TVApp({ initialChannel }: { initialChannel?: string }) {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [catalogSummary, setCatalogSummary] = useState<CatalogSummary | null>(INITIAL_CATALOG_SUMMARY);
  const [activeStation, setActiveStation] = useState(initialChannel || stations[0].id);
  const [activeCategory, setActiveCategory] = useState("all");
  const [currentVideo, setCurrentVideo] = useState<Video | null>(null);
  const [status, setStatus] = useState<string>("Loading...");
  // TVApp is only ever mounted with an initialChannel (via [channel]/page.tsx),
  // so playback always starts in the lobby. The standalone "landing" picker
  // lives in app/page.tsx instead.
  const [mode, setMode] = useState<"lobby" | "playing">("lobby");
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [hideWatched, setHideWatched] = useState(true);
  const [watchedIds, setWatchedIds] = useState<Set<string>>(() => new Set());
  const [blockedSources, setBlockedSources] = useState<Set<string>>(() => new Set());
  const [quarantinedSources, setQuarantinedSources] = useState<Set<string>>(() => new Set());
  const [activeSources, setActiveSources] = useState<Set<string> | null>(null); // null = all active
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [showHealth, setShowHealth] = useState(false);
  const [nextVideoPreview, setNextVideoPreview] = useState<Video | null>(null);
  const [copied, setCopied] = useState(false);
  const [watchLaterIds, setWatchLaterIds] = useState<Set<string>>(() => new Set());
  const [savedForPlaybackIds, setSavedForPlaybackIds] = useState<Set<string>>(() => new Set());
  const [smartMixProfile, setSmartMixProfile] = useState<SmartMixProfile>(() => createSmartMixProfile());
  const [smartMixReason, setSmartMixReason] = useState("");
  const [playbackIssue, setPlaybackIssue] = useState<{ reason: string; skipped: number } | null>(null);
  const [catalogLoadFailed, setCatalogLoadFailed] = useState(false);
  const [catalogRefreshing, setCatalogRefreshing] = useState(false);
  const [embedHealth, setEmbedHealth] = useState<Record<string, EmbedHealthRecord>>(() => ({}));
  const queueRef = useRef<Video[]>([]);
  const [queueCount, setQueueCount] = useState(0);
  const skippedRef = useRef(new Set<string>());
  const blockedSourcesRef = useRef(new Set<string>());
  const quarantinedSourcesRef = useRef(new Set<string>());
  const historyRef = useRef<Video[]>([]);
  const [hasHistory, setHasHistory] = useState(false);
  const playerRef = useRef<PlayerHandle>(null);
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Defer time-dependent and localStorage-dependent state to after mount so
  // build-time SSR and the first client render produce identical HTML.
  const [mounted, setMounted] = useState(false);

  const isPlayAll = activeStation === "all";
  const isSmartMix = activeStation === SMART_MIX_ID;
  const config = isSmartMix
    ? { id: SMART_MIX_ID, name: "Smart Mix", description: "Personalized from favorites, dislikes, sources, tags, and local watch signals", sources: [] as { name: string; handle: string }[] }
    : isPlayAll
    ? { id: "all", name: "All Stations", description: "Shuffle across all stations", sources: [] as { name: string; handle: string }[] }
    : stations.find((s) => s.id === activeStation) ?? stations[0];

  // v2: Topic-based categories via zero-shot classification
  // NER categories (person/place extraction) were too noisy for useful filtering
  const categories = useMemo(() => [{ id: "all", name: "All" }], []);

  useEffect(() => {
    let cancelled = false;

    queueMicrotask(() => {
      if (cancelled) return;
      setMounted(true);
      setWatchedIds(getWatchedIds());
      const blocked = getBlockedSources();
      blockedSourcesRef.current = blocked;
      setBlockedSources(blocked);
      setQuarantinedSources(getQuarantinedSources());
      quarantinedSourcesRef.current = getQuarantinedSources();
      setWatchLaterIds(new Set(getWatchLater()));
      setSavedForPlaybackIds(new Set(getSavedForPlayback()));
      setEmbedHealth(getEmbedHealth());

      const rawSmartMixProfile = getSmartMixProfileRaw();
      if (rawSmartMixProfile) {
        try {
          setSmartMixProfile(parseSmartMixProfile(rawSmartMixProfile));
        } catch {
          setSmartMixProfile(createSmartMixProfile());
        }
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const fetchCatalog = useCallback(() => {
    loadCatalogSummary()
      .then((summary) => {
        setCatalogSummary(summary);
        setCatalogLoadFailed(false);
      })
      .catch(() => {
        // The full catalog still powers playback; summary only improves first paint.
      });
    loadCatalog()
      .then((c) => {
        setCatalog(c);
        setStatus("");
        setCatalogLoadFailed(false);
      })
      .catch((err) => {
        console.error("TVApp: catalog load failed after retries", err);
        setCatalogLoadFailed(true);
        const isDev =
          typeof window !== "undefined" &&
          (window.location.hostname === "localhost" ||
            window.location.hostname === "127.0.0.1");
        setStatus(
          isDev
            ? "No catalog found. Run: pnpm run build:catalog"
            : "Catalog couldn't load. Retry when you're back online.",
        );
      });
  }, []);

  const refreshCatalogState = useCallback(async () => {
    if (catalogRefreshing) return;
    setCatalogRefreshing(true);
    try {
      const [summary, nextCatalog] = await Promise.all([
        refreshCatalogSummary(),
        refreshCatalog(),
      ]);
      setCatalogSummary(summary);
      setCatalog(nextCatalog);
      setCatalogLoadFailed(false);
      setStatus("");
    } catch (err) {
      console.error("TVApp: catalog refresh failed", err);
      setCatalogLoadFailed(true);
      setStatus("Catalog couldn't load. Retry when you're back online.");
    } finally {
      setCatalogRefreshing(false);
    }
  }, [catalogRefreshing]);

  useEffect(() => {
    blockedSourcesRef.current = blockedSources;
  }, [blockedSources]);

  useEffect(() => {
    quarantinedSourcesRef.current = quarantinedSources;
  }, [quarantinedSources]);

  const syncQuarantinedSources = useCallback((next: Set<string>) => {
    quarantinedSourcesRef.current = next;
    setQuarantinedSources(next);
  }, []);

  const syncBlockedSources = useCallback((next: Set<string>) => {
    blockedSourcesRef.current = next;
    setBlockedSources(next);
  }, []);

  useEffect(() => {
    fetchCatalog();
  }, [fetchCatalog]);

  // Mark video as watched only if user watched >= 50%
  const maybeMarkWatched = useCallback((video: Video | null, forceWatched = false) => {
    if (!video) return;
    const progress = playerRef.current?.getWatchProgress() ?? 0;
    if (forceWatched || progress >= 0.5) {
      markWatched(video.id, video.duration, activeStation, video.source || "");
      removeSavedForPlayback(video.id);
      setSavedForPlaybackIds((prev) => {
        if (!prev.has(video.id)) return prev;
        const next = new Set(prev);
        next.delete(video.id);
        return next;
      });
      setWatchedIds((prev) => {
        if (prev.has(video.id)) return prev;
        return new Set([...prev, video.id]);
      });
    }
  }, [activeStation]);

  const playNext = useCallback(
    (cat?: string) => {
      if (!catalog) return;
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = null;
      }

      // Check queue first
      if (queueRef.current.length > 0) {
        const queued = queueRef.current.shift()!;
        setQueueCount(queueRef.current.length);
        maybeMarkWatched(currentVideo);
        if (currentVideo) { historyRef.current.push(currentVideo); setHasHistory(true); }
        setCurrentVideo(queued);
        setStatus("");
        setPaused(false);
        return;
      }

      const videos = isSmartMix
        ? Object.values(catalog.stations).flatMap((station) => station.videos)
        : getVideosForStation(catalog, activeStation, cat || activeCategory);
      // Filter out watched if enabled, plus skipped (embed errors)
      const available = videos.filter(
        (v) =>
          !skippedRef.current.has(v.id) &&
          (!hideWatched || !watchedIds.has(v.id)) &&
          (!v.source || !blockedSourcesRef.current.has(v.source)) &&
          (!v.source || !quarantinedSourcesRef.current.has(v.source)) &&
          (!activeSources || !v.source || activeSources.has(v.source))
      );

      if (available.length < 5) {
        if (hideWatched && available.length < 5 && videos.length > 5) {
          setStatus(`Almost all watched! ${available.length} left`);
        }
        skippedRef.current.clear();
      }

      const recentIds = new Set(historyRef.current.slice(-12).map((video) => video.id));
      const smartPick = isSmartMix
        ? pickSmartMixVideo(catalog, smartMixProfile, {
            watchedIds: hideWatched ? watchedIds : undefined,
            blockedSources: new Set([
              ...blockedSourcesRef.current,
              ...quarantinedSourcesRef.current,
            ]),
            excludeId: currentVideo?.id,
            recentIds,
          })
        : null;
      const pool = available.length > 0 ? available : videos;
      const next = smartPick ? smartPick.video : pickRandom(pool, currentVideo?.id);
      if (next) {
        maybeMarkWatched(currentVideo);
        if (currentVideo) { historyRef.current.push(currentVideo); setHasHistory(true); }
        setCurrentVideo(next);
        setSmartMixReason(smartPick?.reason ?? "");
        setStatus("");
        setPaused(false);
      } else {
        setStatus("No unwatched videos in this category");
      }
    },
    [catalog, activeStation, activeCategory, currentVideo, hideWatched, watchedIds, activeSources, maybeMarkWatched, isSmartMix, smartMixProfile],
  );

  const playPrev = useCallback(() => {
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }
    maybeMarkWatched(currentVideo);
    const prev = historyRef.current.pop();
    if (prev) { setCurrentVideo(prev); setStatus(""); setPaused(false); }
    setHasHistory(historyRef.current.length > 0);
  }, [currentVideo, maybeMarkWatched]);

  const playVideo = useCallback(
    (video: Video) => {
      maybeMarkWatched(currentVideo);
      if (currentVideo) { historyRef.current.push(currentVideo); setHasHistory(true); }
      setCurrentVideo(video);
      setStatus("");
      setPaused(false);
      setSearchOpen(false);
      setMode("playing");
    },
    [currentVideo, maybeMarkWatched]
  );

  const switchToStation = useCallback((stationId: string) => {
    maybeMarkWatched(currentVideo);
    skippedRef.current.clear();
    historyRef.current = [];
    setHasHistory(false);
    setActiveStation(stationId);
    setActiveSources(null);
    setCurrentVideo(null);
    setShowGuide(false);
  }, [currentVideo, maybeMarkWatched]);

  const handleToggleBlock = useCallback((source: string) => {
    if (blockedSources.has(source)) {
      unblockSource(source);
      const next = new Set(blockedSourcesRef.current);
      next.delete(source);
      syncBlockedSources(next);
    } else {
      blockSource(source);
      const next = new Set(blockedSourcesRef.current);
      next.add(source);
      syncBlockedSources(next);
    }
  }, [blockedSources, syncBlockedSources]);

  const handleCategoryChange = useCallback(
    (id: string) => {
      setActiveCategory(id);
      skippedRef.current.clear();
      if (catalog) {
        const videos = getVideosForStation(catalog, activeStation, id);
        const available = hideWatched ? videos.filter((v) => !watchedIds.has(v.id)) : videos;
        const next = pickRandom(available.length > 0 ? available : videos);
        if (next) {
          if (currentVideo) { historyRef.current.push(currentVideo); setHasHistory(true); }
          setCurrentVideo(next);
          setStatus("");
          setPaused(false);
        }
      }
    },
    [catalog, activeStation, currentVideo, hideWatched, watchedIds]
  );

  const startPlaying = useCallback(() => {
    setMode("playing");
    playNext();
  }, [playNext]);

  useEffect(() => {
    if (mode === "playing" && catalog && !currentVideo) playNext();
  }, [mode, catalog, currentVideo, playNext]);

  // Owner analytics: playing a video is the core product action. The first
  // play also marks the viewer as `activated`. trackActivated() de-dupes
  // internally, so it is safe to call on every play.
  useEffect(() => {
    if (mode === "playing" && currentVideo) {
      trackActivated();
      trackCoreAction("video_played");
    }
  }, [mode, currentVideo]);

  // Pre-compute the next video for "Up next" display in the control bar.
  // Skipped refs are excluded intentionally — they're a transient runtime set.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!catalog || !currentVideo || isSmartMix) { setNextVideoPreview(null); return; }
    const videos = getVideosForStation(catalog, activeStation, activeCategory);
    const pool = videos.filter(
      (v) => v.id !== currentVideo.id &&
      (!hideWatched || !watchedIds.has(v.id)) &&
      (!v.source || !blockedSources.has(v.source)) &&
      (!v.source || !quarantinedSources.has(v.source)) &&
      (!activeSources || !v.source || activeSources.has(v.source))
    );
    const src = pool.length > 0 ? pool : videos.filter((v) => v.id !== currentVideo.id);
    setNextVideoPreview(src.length > 0 ? src[Math.floor(Math.random() * src.length)] : null);
  }, [catalog, currentVideo, activeStation, activeCategory, hideWatched, watchedIds, blockedSources, quarantinedSources, activeSources, isSmartMix]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.key === "?") { e.preventDefault(); setShowShortcuts((s) => !s); return; }
      if (e.key === "/") { e.preventDefault(); setSearchOpen(true); return; }
      if (e.key === "Escape") { e.preventDefault(); setSearchOpen(false); setShowShortcuts(false); setShowGuide(false); setShowHealth(false); return; }
      if (e.key.toLowerCase() === "h") { e.preventDefault(); setShowHealth((s) => !s); return; }
      if (searchOpen) return;

      if (mode === "lobby") {
        if (e.key === " " || e.key.toLowerCase() === "n") {
          e.preventDefault();
          startPlaying();
        }
        return;
      }

      if (mode !== "playing") return;
      switch (e.key.toLowerCase()) {
        case " ": e.preventDefault(); playerRef.current?.togglePlay(); setPaused((p) => !p); break;
        case "n": case "arrowright": e.preventDefault(); playNext(); break;
        case "p": case "arrowleft": e.preventDefault(); playPrev(); break;
        case "m": e.preventDefault(); playerRef.current?.toggleMute(); setMuted((m) => !m); break;
        case "f": e.preventDefault(); if (document.fullscreenElement) { document.exitFullscreen(); } else { document.documentElement.requestFullscreen(); } break;
        case "g": e.preventDefault(); setShowGuide((g) => !g); break;
        case "w": e.preventDefault(); setHideWatched((h) => !h); break;
        default: {
          const n = parseInt(e.key);
          if (n >= 1 && n <= Math.min(categories.length, 9)) {
            e.preventDefault();
            handleCategoryChange(categories[n - 1].id);
          }
        }
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [mode, playNext, playPrev, handleCategoryChange, categories, searchOpen, startPlaying, switchToStation]);

  const handleError = useCallback(
    (code: number) => {
      const reason = ytErrorReason(code);
      if (currentVideo) skippedRef.current.add(currentVideo.id);
      setEmbedHealth(getEmbedHealth());
      setQuarantinedSources(getQuarantinedSources());
      quarantinedSourcesRef.current = getQuarantinedSources();
      setPlaybackIssue((prev) => ({ reason, skipped: (prev?.skipped ?? 0) + 1 }));
      setStatus(`Skipped: ${reason}. Trying next...`);
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
      retryTimeoutRef.current = setTimeout(() => {
        retryTimeoutRef.current = null;
        playNext();
      }, 500);
    },
    [currentVideo, playNext],
  );

  useEffect(
    () => () => {
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = null;
      }
    },
    [],
  );

  const allVideos = isPlayAll || isSmartMix
    ? Object.values(catalog?.stations ?? {}).flatMap((s) => s.videos)
    : catalog?.stations?.[activeStation]?.videos ?? [];
  const catalogLoaded = catalog !== null;
  const unwatchedCount = allVideos.filter((v) => !watchedIds.has(v.id)).length;
  const catalogFreshness = useMemo(
    () =>
      mounted
        ? getCatalogFreshness(catalog?.lastUpdated ?? catalogSummary?.lastUpdated)
        : {
            state: "loading" as const,
            label: "Checking catalog freshness...",
            ageDays: null,
            updatedAt: null,
          },
    [mounted, catalog?.lastUpdated, catalogSummary?.lastUpdated],
  );

  const currentSourceFreshness = useMemo(() => {
    if (!currentVideo?.source || !catalog) return undefined;
    const handle = stations
      .flatMap((st) => st.sources)
      .find((s) => s.name === currentVideo.source)?.handle.replace("@", "");
    return getSourceFreshness(handle ? catalog.sourceMeta?.[handle] : undefined);
  }, [catalog, currentVideo]);

  const playbackDiagnostic = useMemo(
    () =>
      mounted
        ? derivePlaybackDiagnostic({
            catalogLoaded: catalogLoaded,
            catalogLoadFailed,
            catalogFreshness,
            currentSource: currentVideo?.source,
            sourceFreshness: currentSourceFreshness,
            embedHealth: currentVideo?.source ? embedHealth[currentVideo.source] : undefined,
            isQuarantined: currentVideo?.source
              ? quarantinedSources.has(currentVideo.source)
              : false,
            skipStreak: playbackIssue?.skipped ?? 0,
            lastSkipReason: playbackIssue?.reason,
          })
        : null,
    [
      mounted,
      catalogLoaded,
      catalogLoadFailed,
      catalogFreshness,
      currentVideo,
      currentSourceFreshness,
      embedHealth,
      quarantinedSources,
      playbackIssue,
    ],
  );

  const handleUnquarantine = useCallback(
    (source: string) => {
      unquarantineSource(source);
      const next = new Set(quarantinedSourcesRef.current);
      next.delete(source);
      syncQuarantinedSources(next);
    },
    [syncQuarantinedSources],
  );

  const totalCatalogVideos =
    (catalog && Object.values(catalog.stations).reduce((n, s) => n + s.videos.length, 0)) ||
    catalogSummary?.totalVideos ||
    0;

  const updateSmartPreference = useCallback((preference: "favorite" | "dislike") => {
    if (!currentVideo) return;
    const next = applyPreference(smartMixProfile, currentVideo, preference);
    setSmartMixProfile(next);
    setSmartMixProfileRaw(serializeSmartMixProfile(next));
    if (preference === "dislike") playNext();
  }, [currentVideo, playNext, smartMixProfile]);

  // ── Lobby: channel selected ──
  if (mode === "lobby") {

    return (
      <div className="fixed inset-0 bg-black flex flex-col items-center justify-center px-6">
        <Link href="/" className="absolute top-6 left-6 text-white/30 hover:text-white/60 transition-colors text-sm flex items-center gap-1.5">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          All channels
        </Link>

        <div className="text-center mb-8">
          <h1 className="text-white text-4xl font-bold tracking-tight mb-2">{config.name}</h1>
          {config.sources.length > 1 && (
            <div className="flex flex-wrap justify-center gap-1.5 mb-3 max-w-xl">
              {config.sources.map((s) => {
                const isActive = !activeSources || activeSources.has(s.name);
                const handle = s.handle.replace("@", "");
                const meta = catalog?.sourceMeta?.[handle];
                const freshness = getSourceFreshness(meta);
                const isStale = freshness.state === "stale";
                const health = embedHealth[s.name];
                const isUnhealthy = isEmbedUnhealthy(health);
                const blockRate = getEmbedBlockRate(health);
                const isQuarantined = quarantinedSources.has(s.name);
                const title = [
                  freshness.state !== "unknown" ? freshness.label : null,
                  isQuarantined ? "Auto-quarantined for embed failures" : null,
                  isUnhealthy && blockRate !== null
                    ? `${Math.round(blockRate * 100)}% embed blocks`
                    : null,
                ].filter(Boolean).join(" · ") || undefined;
                return (
                  <button
                    key={s.handle}
                    title={title}
                    onClick={() => {
                      setActiveSources((prev) => {
                        const allNames = new Set(config.sources.map((src) => src.name));
                        if (!prev) {
                          // First click: deselect this one, activate all others
                          allNames.delete(s.name);
                          return allNames;
                        }
                        const next = new Set(prev);
                        if (next.has(s.name)) {
                          next.delete(s.name);
                          // Don't allow empty — reselect all
                          return next.size === 0 ? null : next;
                        }
                        next.add(s.name);
                        // If all re-selected, reset to null
                        return next.size === allNames.size ? null : next;
                      });
                    }}
                    className={`px-2.5 py-1 rounded-full text-xs transition-colors flex items-center gap-1 ${
                      isActive
                        ? "bg-white/15 text-white/70"
                        : "bg-white/5 text-white/20 line-through"
                    }`}
                  >
                    {s.name}
                    {isStale && (
                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-yellow-400/80 shrink-0" aria-label="stale" />
                    )}
                    {isQuarantined && (
                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400/80 shrink-0" aria-label="quarantined" />
                    )}
                    {isUnhealthy && !isQuarantined && (
                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-orange-400/80 shrink-0" aria-label="embed issues" />
                    )}
                  </button>
                );
              })}
            </div>
          )}
          <p className="text-white/40 text-sm">
            {allVideos.length > 0 ? `${unwatchedCount.toLocaleString()} unwatched of ${allVideos.length.toLocaleString()}` : catalogLoaded ? "No videos" : "Loading..."}
          </p>
          {!playbackDiagnostic && catalogFreshness.state !== "loading" && (
            <p className="text-xs mt-2 text-white/25">{catalogFreshness.label}</p>
          )}
        </div>

        {playbackDiagnostic && (
          <div className="mb-6 w-full max-w-xl">
            <PlaybackDiagnosticsBanner
              diagnostic={playbackDiagnostic}
              refreshing={catalogRefreshing}
              variant="inline"
              onRetryCatalog={refreshCatalogState}
              onOpenHealth={() => setShowHealth(true)}
              onSearch={() => setSearchOpen(true)}
            />
          </div>
        )}

        {categories.length > 1 && (
          <div className="flex flex-wrap justify-center gap-2 mb-8 max-w-2xl">
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={`px-3 py-1.5 rounded-full text-sm transition-colors ${
                  cat.id === activeCategory
                    ? "bg-white text-black font-medium"
                    : "bg-white/10 text-white/60 hover:bg-white/15 hover:text-white"
                }`}
              >
                {cat.name}
              </button>
            ))}
          </div>
        )}

        <div className="flex items-center gap-4">
          <button
            onClick={startPlaying}
            disabled={allVideos.length === 0}
            className="bg-red-600 hover:bg-red-500 disabled:bg-white/10 disabled:text-white/30 text-white text-lg font-semibold px-8 py-3.5 rounded-xl transition-colors flex items-center gap-3"
          >
            <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
            Play
          </button>
          <button
            onClick={() => setSearchOpen(true)}
            disabled={allVideos.length === 0}
            className="bg-white/10 hover:bg-white/15 disabled:opacity-30 text-white text-lg px-6 py-3.5 rounded-xl transition-colors flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
            Search
          </button>
        </div>

        <div className="text-white/20 text-xs text-center mt-10">
          <kbd className="bg-white/5 px-1.5 py-0.5 rounded">Space</kbd> Play
          &nbsp;&middot;&nbsp;
          <kbd className="bg-white/5 px-1.5 py-0.5 rounded">/</kbd> Search
        </div>

        <Search videos={allVideos} onSelect={playVideo} onQueue={(v) => { queueRef.current.push(v); setQueueCount(queueRef.current.length); }} onClose={() => setSearchOpen(false)} visible={searchOpen} watchLaterIds={watchLaterIds} onToggleWatchLater={(id) => { if (watchLaterIds.has(id)) { removeWatchLater(id); setWatchLaterIds((prev) => { const n = new Set(prev); n.delete(id); return n; }); } else { addWatchLater(id); setWatchLaterIds((prev) => new Set([...prev, id])); } }} />
        <ChannelHealth
          visible={showHealth}
          onClose={() => setShowHealth(false)}
          stations={stations}
          catalog={catalog}
          embedHealth={embedHealth}
          blockedSources={blockedSources}
          quarantinedSources={quarantinedSources}
          onToggleBlock={handleToggleBlock}
          onUnquarantine={handleUnquarantine}
        />
      </div>
    );
  }

  // ── Player view ──
  return (
    <div className="fixed inset-0 bg-black flex flex-col">
      <div className="relative flex-1 min-h-0">
        {currentVideo && (
          <Player
            ref={playerRef}
            videoId={currentVideo.id}
            source={currentVideo.source}
            onEnded={playNext}
            onError={handleError}
            onReady={() => { setStatus(""); setPlaybackIssue(null); }}
            onPlay={() => { setPaused(false); setPlaybackIssue(null); }}
            onPause={() => setPaused(true)}
          />
        )}
        {!currentVideo && (
          <div className="absolute inset-0 bg-black flex items-center justify-center px-6">
            <div className="text-center max-w-sm">
              <p className="text-white text-base font-medium mb-2">
                {status || (catalogLoaded ? "No playable video selected" : "Loading channel...")}
              </p>
              <p className="text-white/45 text-sm">
                {catalogLoaded
                  ? "Try another channel or search the catalog for something playable."
                  : "The catalog is loading before playback can start."}
              </p>
            </div>
          </div>
        )}
        {playbackDiagnostic && (
          <PlaybackDiagnosticsBanner
            diagnostic={playbackDiagnostic}
            refreshing={catalogRefreshing}
            onRetryCatalog={refreshCatalogState}
            onOpenHealth={() => setShowHealth(true)}
            onSearch={() => setSearchOpen(true)}
          />
        )}
      </div>

      <ControlRail
        stationName={config.name}
        currentVideo={currentVideo}
        paused={paused}
        muted={muted}
        hasHistory={hasHistory}
        queueCount={queueCount}
        status={status || undefined}
        hideWatched={hideWatched}
        watchLaterActive={currentVideo ? watchLaterIds.has(currentVideo.id) : false}
        savedForPlayback={currentVideo ? savedForPlaybackIds.has(currentVideo.id) : false}
        guideOpen={showGuide}
        isSmartMix={isSmartMix}
        smartMixReason={smartMixReason}
        nextVideoPreview={nextVideoPreview}
        copied={copied}
        smartMixFavorite={currentVideo ? smartMixProfile.favorites.includes(currentVideo.id) : false}
        smartMixDisliked={currentVideo ? smartMixProfile.dislikes.includes(currentVideo.id) : false}
        onBack={() => {
          maybeMarkWatched(currentVideo);
          setMode("lobby");
          setCurrentVideo(null);
          setEmbedHealth(getEmbedHealth());
          setQuarantinedSources(getQuarantinedSources());
        }}
        onPlayPause={() => {
          playerRef.current?.togglePlay();
          setPaused((p) => !p);
        }}
        onPrev={playPrev}
        onNext={() => playNext()}
        onSearch={() => setSearchOpen(true)}
        onToggleWatchLater={() => {
          if (!currentVideo) return;
          if (watchLaterIds.has(currentVideo.id)) {
            removeWatchLater(currentVideo.id);
            setWatchLaterIds((prev) => {
              const next = new Set(prev);
              next.delete(currentVideo.id);
              return next;
            });
          } else {
            addWatchLater(currentVideo.id);
            setWatchLaterIds((prev) => new Set([...prev, currentVideo.id]));
          }
        }}
        onToggleGuide={() => setShowGuide((g) => !g)}
        onToggleMute={() => {
          playerRef.current?.toggleMute();
          setMuted((m) => !m);
        }}
        onToggleHideWatched={() => setHideWatched((h) => !h)}
        onToggleSavedForPlayback={() => {
          if (!currentVideo) return;
          if (savedForPlaybackIds.has(currentVideo.id)) {
            removeSavedForPlayback(currentVideo.id);
            setSavedForPlaybackIds((prev) => {
              const next = new Set(prev);
              next.delete(currentVideo.id);
              return next;
            });
          } else {
            addSavedForPlayback(currentVideo.id);
            setSavedForPlaybackIds((prev) => new Set([...prev, currentVideo.id]));
          }
        }}
        onCopyLink={() => {
          if (!currentVideo) return;
          navigator.clipboard.writeText(`https://youtube.com/watch?v=${currentVideo.id}`);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }}
        onFullscreen={() => {
          if (document.fullscreenElement) {
            document.exitFullscreen();
          } else {
            document.documentElement.requestFullscreen();
          }
        }}
        onOpenHealth={() => setShowHealth(true)}
        onOpenShortcuts={() => setShowShortcuts(true)}
        onSmartMixFavorite={() => updateSmartPreference("favorite")}
        onSmartMixDislike={() => updateSmartPreference("dislike")}
        onSmartMixExport={() => {
          navigator.clipboard.writeText(serializeSmartMixProfile(smartMixProfile));
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }}
        onSmartMixImport={() => {
          const raw = window.prompt("Paste Smart Mix profile JSON");
          if (!raw) return;
          try {
            const next = parseSmartMixProfile(raw);
            setSmartMixProfile(next);
            setSmartMixProfileRaw(serializeSmartMixProfile(next));
          } catch {
            setStatus("Invalid Smart Mix profile JSON");
          }
        }}
        onSmartMixReset={() => {
          resetSmartMixProfile();
          setSmartMixProfile(createSmartMixProfile());
          setSmartMixReason("");
        }}
      />

      <Search videos={allVideos} onSelect={playVideo} onQueue={(v) => { queueRef.current.push(v); setQueueCount(queueRef.current.length); }} onClose={() => setSearchOpen(false)} visible={searchOpen} watchLaterIds={watchLaterIds} onToggleWatchLater={(id) => { if (watchLaterIds.has(id)) { removeWatchLater(id); setWatchLaterIds((prev) => { const n = new Set(prev); n.delete(id); return n; }); } else { addWatchLater(id); setWatchLaterIds((prev) => new Set([...prev, id])); } }} />

      {showGuide && (
        <div className="fixed inset-0 z-[100] flex">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowGuide(false)} />
          <div className="relative flex flex-col bg-zinc-950 border-r border-white/10 w-64 overflow-y-auto">
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 shrink-0">
              <span className="text-white text-sm font-semibold">Channels</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => { setShowGuide(false); setShowHealth(true); }}
                  className="text-white/40 hover:text-white text-xs flex items-center gap-1 hover:bg-white/10 px-2 py-1 rounded transition-colors"
                  title="Channel Health (H)"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                  Health
                </button>
                <kbd className="text-white/25 text-xs font-mono bg-white/5 px-1.5 py-0.5 rounded">G</kbd>
              </div>
            </div>
            <div className="py-1">
              {[
                { id: "all", name: "Play All", count: totalCatalogVideos },
                { id: SMART_MIX_ID, name: "Smart Mix", count: null as number | null },
              ].map(({ id, name, count }) => {
                const isActive = activeStation === id;
                return (
                  <button
                    key={id}
                    onClick={() => switchToStation(id)}
                    className={`w-full flex items-center justify-between px-4 py-2.5 text-left transition-colors ${isActive ? "bg-white/10" : "hover:bg-white/5"}`}
                  >
                    <span className={`text-sm font-medium ${isActive ? "text-white" : "text-white/60"}`}>{name}</span>
                    <span className="flex items-center gap-2">
                      {count != null && <span className="text-white/25 text-xs">{count.toLocaleString()}</span>}
                      {isActive && <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />}
                    </span>
                  </button>
                );
              })}
              <div className="h-px bg-white/5 mx-4 my-1" />
              {stations.map((st) => {
                const count =
                  catalog?.stations?.[st.id]?.videos?.length ??
                  catalogSummary?.stations?.[st.id]?.videoCount ??
                  0;
                const isActive = activeStation === st.id;
                return (
                  <button
                    key={st.id}
                    onClick={() => switchToStation(st.id)}
                    className={`w-full flex items-center justify-between px-4 py-2.5 text-left transition-colors ${isActive ? "bg-white/10" : "hover:bg-white/5"}`}
                  >
                    <span className={`text-sm ${isActive ? "text-white font-medium" : "text-white/60"}`}>{st.name}</span>
                    <span className="flex items-center gap-2">
                      <span className="text-white/25 text-xs">{count > 0 ? count.toLocaleString() : "–"}</span>
                      {isActive && <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {showShortcuts && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setShowShortcuts(false)} />
          <div className="relative bg-zinc-900 rounded-xl border border-white/10 p-6 max-w-sm w-full mx-4">
            <h2 className="text-white text-lg font-semibold mb-4">Keyboard Shortcuts</h2>
            <div className="space-y-2 text-sm">
              {[
                ["Space", "Play / Pause"],
                ["N / →", "Next video"],
                ["P / ←", "Previous video"],
                ["M", "Mute / Unmute"],
                ["F", "Fullscreen"],
                ["G", "Channel guide"],
                ["H", "Channel health"],
                ["W", "Toggle watched filter"],
                ["/", "Search"],
                ["?", "This help"],
                ["Esc", "Close overlay"],
              ].map(([key, desc]) => (
                <div key={key} className="flex items-center justify-between">
                  <span className="text-white/50">{desc}</span>
                  <kbd className="bg-white/10 text-white/70 px-2 py-0.5 rounded text-xs font-mono">{key}</kbd>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <ChannelHealth
        visible={showHealth}
        onClose={() => setShowHealth(false)}
        stations={stations}
        catalog={catalog}
        embedHealth={embedHealth}
        blockedSources={blockedSources}
        quarantinedSources={quarantinedSources}
        onToggleBlock={handleToggleBlock}
        onUnquarantine={handleUnquarantine}
      />
    </div>
  );
}
