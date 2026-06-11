"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import type { Catalog, CatalogSummary, Video } from "@/lib/types";
import { loadCatalog, loadCatalogSummary, getVideosForStation, pickRandom, formatDuration, getCatalogFreshness, getSourceFreshness } from "@/lib/catalog";
import { getWatchedIds, markWatched, getStats, getBlockedSources, blockSource, unblockSource, getWatchLater, addWatchLater, removeWatchLater, getSavedForPlayback, addSavedForPlayback, removeSavedForPlayback, getSmartMixProfileRaw, setSmartMixProfileRaw, resetSmartMixProfile, getEmbedHealth, type EmbedHealthRecord } from "@/lib/watched";
import { applyPreference, createSmartMixProfile, parseSmartMixProfile, pickSmartMixVideo, serializeSmartMixProfile, type SmartMixProfile } from "@/lib/smartmix";
import { ytErrorReason } from "@/lib/yt-errors";
import { trackActivated, trackCoreAction } from "@/lib/analytics";
import Link from "next/link";
import Player, { type PlayerHandle } from "./Player";
import Search from "./Search";
import StationBuilder from "./StationBuilder";
import ChannelHealth from "./ChannelHealth";
import stations from "../../channels.config";
import bundledCatalogSummary from "../../public/catalog-summary.json";

const SMART_MIX_ID = "smart-mix";
const INITIAL_CATALOG_SUMMARY = bundledCatalogSummary as CatalogSummary;
const EMPTY_STATS = { totalWatched: 0, totalSeconds: 0 };

export default function TVApp({ initialChannel }: { initialChannel?: string }) {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [catalogSummary, setCatalogSummary] = useState<CatalogSummary | null>(INITIAL_CATALOG_SUMMARY);
  const [activeStation, setActiveStation] = useState(initialChannel || stations[0].id);
  const [activeCategory, setActiveCategory] = useState("all");
  const [currentVideo, setCurrentVideo] = useState<Video | null>(null);
  const [status, setStatus] = useState<string>("Loading...");
  const [mode, setMode] = useState<"landing" | "lobby" | "playing">(initialChannel ? "lobby" : "landing");
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [stationBuilderOpen, setStationBuilderOpen] = useState(false);
  const [hideWatched, setHideWatched] = useState(true);
  const [watchedIds, setWatchedIds] = useState<Set<string>>(() => new Set());
  const [blockedSources, setBlockedSources] = useState<Set<string>>(() => new Set());
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
  const [embedHealth, setEmbedHealth] = useState<Record<string, EmbedHealthRecord>>(() => ({}));
  const [catalogError, setCatalogError] = useState(false);
  const [catalogRetrying, setCatalogRetrying] = useState(false);
  const queueRef = useRef<Video[]>([]);
  const [queueCount, setQueueCount] = useState(0);
  const skippedRef = useRef(new Set<string>());
  const blockedSourcesRef = useRef(new Set<string>());
  const historyRef = useRef<Video[]>([]);
  const [hasHistory, setHasHistory] = useState(false);
  const playerRef = useRef<PlayerHandle>(null);
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Defer time-dependent and localStorage-dependent state to after mount so
  // build-time SSR and the first client render produce identical HTML.
  const [mounted, setMounted] = useState(false);
  const [landingStats, setLandingStats] = useState(EMPTY_STATS);

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
      setLandingStats(getStats());
      setWatchedIds(getWatchedIds());
      const blocked = getBlockedSources();
      blockedSourcesRef.current = blocked;
      setBlockedSources(blocked);
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
    queueMicrotask(() => {
      setCatalogError(false);
      setCatalogRetrying(true);
    });
    loadCatalogSummary()
      .then(setCatalogSummary)
      .catch(() => {
        // The full catalog still powers playback; summary only improves first paint.
      });
    loadCatalog()
      .then((c) => { setCatalog(c); setStatus(""); setCatalogError(false); })
      .catch((err) => {
        console.error("TVApp: catalog load failed after retries", err);
        const isDev =
          typeof window !== "undefined" &&
          (window.location.hostname === "localhost" ||
            window.location.hostname === "127.0.0.1");
        setStatus(
          isDev
            ? "No catalog found. Run: pnpm run build:catalog"
            : "Catalog couldn't load. Showing sample channels — tap retry when you're back online.",
        );
        setCatalogError(true);
      })
      .finally(() => {
        setCatalogRetrying(false);
      });
  }, []);

  useEffect(() => {
    blockedSourcesRef.current = blockedSources;
  }, [blockedSources]);

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
        (v) => !skippedRef.current.has(v.id) && (!hideWatched || !watchedIds.has(v.id)) && (!v.source || !blockedSourcesRef.current.has(v.source)) && (!activeSources || !v.source || activeSources.has(v.source))
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
            blockedSources: blockedSourcesRef.current,
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
    [catalog, activeStation, activeCategory, currentVideo, hideWatched, watchedIds, activeSources, maybeMarkWatched, isSmartMix, smartMixProfile]
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
      (!activeSources || !v.source || activeSources.has(v.source))
    );
    const src = pool.length > 0 ? pool : videos.filter((v) => v.id !== currentVideo.id);
    setNextVideoPreview(src.length > 0 ? src[Math.floor(Math.random() * src.length)] : null);
  }, [catalog, currentVideo, activeStation, activeCategory, hideWatched, watchedIds, blockedSources, activeSources, isSmartMix]);

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
      setPlaybackIssue((prev) => ({ reason, skipped: (prev?.skipped ?? 0) + 1 }));
      setStatus(`Skipped: ${reason}. Trying next...`);
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = null;
      }
      retryTimeoutRef.current = setTimeout(() => {
        retryTimeoutRef.current = null;
        playNext();
      }, 500);
    },
    [currentVideo, playNext]
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
    () => mounted
      ? getCatalogFreshness(catalog?.lastUpdated ?? catalogSummary?.lastUpdated)
      : { state: "loading" as const, label: "Checking catalog freshness...", ageDays: null, updatedAt: null },
    [mounted, catalog?.lastUpdated, catalogSummary?.lastUpdated],
  );
  const catalogFreshnessLabel =
    catalogFreshness.state === "stale"
      ? `Channel catalog may be stale - ${catalogFreshness.label}`
      : catalogFreshness.label;

  // "Up next on Play All" preview: three random videos that prove the
  // catalog is loaded and what playback will actually look like. Picked in
  // an effect (not render) so the random draw stays out of React's pure
  // render path.
  const [previewQueue, setPreviewQueue] = useState<Video[]>([]);
  useEffect(() => {
    if (!catalog) return;
    const pool = Object.values(catalog.stations).flatMap((s) => s.videos);
    if (pool.length === 0) return;
    const picks: Video[] = [];
    const seen = new Set<string>();
    const max = Math.min(3, pool.length);
    let guard = 0;
    while (picks.length < max && guard < 50) {
      guard += 1;
      const v = pool[Math.floor(Math.random() * pool.length)];
      if (seen.has(v.id)) continue;
      seen.add(v.id);
      picks.push(v);
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPreviewQueue(picks);
  }, [catalog]);
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

  // ── Landing: channel picker with stats ──
  if (mode === "landing") {
    const stats = landingStats;
    const totalHours = Math.floor(stats.totalSeconds / 3600);
    const totalMins = Math.floor((stats.totalSeconds % 3600) / 60);

    return (
      <div className="min-h-screen bg-black flex flex-col items-center px-6 py-16 overflow-y-auto">
        <div className="text-center mb-10">
          <h1 className="text-white text-5xl font-bold tracking-tight mb-2">LoopTV</h1>
          <p className="text-white/40 text-base">Pick a channel. Random clips play nonstop.</p>
          <div
            className="mt-4 flex flex-wrap items-center justify-center gap-2 text-xs"
            data-testid="reliability-strip"
          >
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 ${
                catalogFreshness.state === "stale"
                  ? "bg-yellow-400/10 text-yellow-300 border border-yellow-400/30"
                  : catalogFreshness.state === "loading"
                  ? "bg-white/5 text-white/40 border border-white/10"
                  : "bg-emerald-400/10 text-emerald-300 border border-emerald-400/25"
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  catalogFreshness.state === "stale"
                    ? "bg-yellow-300"
                    : catalogFreshness.state === "loading"
                    ? "bg-white/30"
                    : "bg-emerald-300"
                }`}
              />
              {catalogFreshnessLabel}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/5 text-white/55 border border-white/10 px-2.5 py-1">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              Auto-skips unplayable clips
            </span>
            {totalCatalogVideos > 0 && (
              <span className="inline-flex items-center rounded-full bg-white/5 text-white/55 border border-white/10 px-2.5 py-1">
                {totalCatalogVideos.toLocaleString()} videos ready
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3 mt-5">
            <button
              onClick={() => { setActiveStation("all"); setMode("playing"); }}
              className="bg-red-600 hover:bg-red-500 text-white text-sm font-semibold px-5 py-3 min-h-11 rounded-xl transition-colors flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
              Play All
            </button>
            <button
              onClick={() => {
                const rand = stations[Math.floor(Math.random() * stations.length)];
                setActiveStation(rand.id);
                setMode("playing");
              }}
              className="bg-white/10 hover:bg-white/15 text-white text-sm px-5 py-3 min-h-11 rounded-xl transition-colors flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
              Shuffle
            </button>
            <button
              onClick={() => { setActiveStation(SMART_MIX_ID); setMode("playing"); }}
              className="bg-white text-black hover:bg-white/90 text-sm font-semibold px-5 py-3 min-h-11 rounded-xl transition-colors flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 4h2m-1 0v16m-7-5h14M5 9h14" /></svg>
              Smart Mix
            </button>
            <button
              onClick={() => setStationBuilderOpen(true)}
              className="bg-white/10 hover:bg-white/15 text-white text-sm px-5 py-3 min-h-11 rounded-xl transition-colors flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v14m7-7H5" />
              </svg>
              Build Station
            </button>
            <button
              onClick={() => setShowHealth(true)}
              className="bg-white/10 hover:bg-white/15 text-white text-sm px-5 py-3 min-h-11 rounded-xl transition-colors flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              Channel Health
            </button>
          </div>
          {stats.totalWatched > 0 && (
            <p className="text-white/20 text-sm mt-4">
              {stats.totalWatched.toLocaleString()} watched
              {totalHours > 0 ? ` · ${totalHours}h ${totalMins}m` : totalMins > 0 ? ` · ${totalMins}m` : ""}
            </p>
          )}
        </div>

        <div className="w-full max-w-4xl mb-8" data-testid="up-next">
          <div className="flex items-center justify-between mb-3 px-1">
            <p className="text-white/40 text-xs uppercase tracking-wider">
              Up next on Play All
            </p>
            <p className="text-white/25 text-xs">
              {catalogLoaded ? "Random shuffle · skips embeds that won't load" : "Loading queue..."}
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {(catalogLoaded ? previewQueue : Array.from({ length: 3 })).map((entry, idx) => {
              const video = catalogLoaded ? (entry as Video) : null;
              return (
                <button
                  key={video?.id ?? `skeleton-${idx}`}
                  onClick={() => {
                    if (!video) return;
                    setActiveStation("all");
                    setCurrentVideo(video);
                    setMode("playing");
                  }}
                  disabled={!video}
                  className="group relative overflow-hidden rounded-lg border border-white/10 bg-white/5 text-left transition-colors enabled:hover:bg-white/10 enabled:hover:border-white/20 disabled:cursor-default"
                >
                  <div className="relative aspect-video w-full bg-zinc-900">
                    {video && (
                      // YouTube thumb served straight from i.ytimg.com; static export means
                      // next/image's optimizer is disabled anyway, so a plain <img> is fine.
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={`https://i.ytimg.com/vi/${video.id}/mqdefault.jpg`}
                        alt=""
                        loading="lazy"
                        className="h-full w-full object-cover opacity-90 transition-opacity group-hover:opacity-100"
                      />
                    )}
                    {video && (
                      <span className="absolute bottom-1.5 right-1.5 rounded bg-black/80 px-1.5 py-0.5 text-[10px] font-mono text-white/85">
                        {formatDuration(video.duration)}
                      </span>
                    )}
                  </div>
                  <div className="p-3">
                    {video ? (
                      <>
                        <p className="text-white text-sm font-medium line-clamp-2">{video.title}</p>
                        <p className="text-white/40 text-xs mt-1 truncate">
                          {video.source || "LoopTV"}
                        </p>
                      </>
                    ) : (
                      <>
                        <div className="h-3.5 w-4/5 rounded bg-white/10" />
                        <div className="h-3 w-1/3 mt-2 rounded bg-white/5" />
                      </>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {catalogError && (
          <div
            data-testid="catalog-offline-banner"
            className="w-full max-w-4xl mb-6 rounded-xl border border-yellow-400/30 bg-yellow-400/10 px-5 py-4 text-sm text-yellow-100"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-semibold text-yellow-100">Catalog unavailable — showing sample channels</p>
                <p className="mt-1 text-yellow-100/70">
                  We couldn&apos;t reach <code className="rounded bg-black/30 px-1 py-0.5 text-xs">catalog.json</code>.
                  Browse the {stations.length} channels below, then retry once your connection is back.
                </p>
              </div>
              <button
                onClick={fetchCatalog}
                disabled={catalogRetrying}
                className="self-start rounded-lg bg-yellow-300/20 px-4 py-2 font-medium text-yellow-100 transition-colors hover:bg-yellow-300/30 disabled:cursor-wait disabled:opacity-60 sm:self-auto"
              >
                {catalogRetrying ? "Retrying..." : "Retry"}
              </button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 w-full max-w-4xl">
          {stations.map((st) => {
            const count =
              catalog?.stations?.[st.id]?.videos?.length ??
              catalogSummary?.stations?.[st.id]?.videoCount ??
              0;
            return (
              <Link
                key={st.id}
                href={`/${st.id}`}
                className="text-left p-5 rounded-xl border transition-all border-white/10 bg-white/5 hover:bg-white/10 hover:border-white/20 hover:scale-[1.02] block no-underline"
              >
                <h2 className="text-white text-lg font-semibold">{st.name}</h2>
                <p className="text-white/40 text-sm mt-1">{st.description}</p>
                <p className="text-white/30 text-xs mt-2">
                  {count ? `${count.toLocaleString()} videos` : catalogLoaded ? "No videos" : "Loading..."}
                </p>
                {catalogFreshness.state === "stale" && (
                  <p className="text-xs mt-1 text-yellow-400/80">{catalogFreshnessLabel}</p>
                )}
              </Link>
            );
          })}
        </div>
        <StationBuilder
          catalog={catalog}
          stations={stations}
          visible={stationBuilderOpen}
          onClose={() => setStationBuilderOpen(false)}
        />
        <ChannelHealth
          visible={showHealth}
          onClose={() => setShowHealth(false)}
          stations={stations}
          catalog={catalog}
          embedHealth={embedHealth}
          blockedSources={blockedSources}
          onToggleBlock={handleToggleBlock}
        />
      </div>
    );
  }

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
                const blockRate = health && health.checked >= 5 ? health.blocked / health.checked : 0;
                const isUnhealthy = blockRate > 0.3;
                const title = [
                  freshness.state !== "unknown" ? freshness.label : null,
                  isUnhealthy ? `${Math.round(blockRate * 100)}% embed blocks` : null,
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
                    {isUnhealthy && (
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
          <p className={`text-xs mt-2 ${catalogFreshness.state === "stale" ? "text-yellow-400" : "text-white/25"}`}>
            {catalogFreshnessLabel}
          </p>
        </div>

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
          onToggleBlock={handleToggleBlock}
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
        {playbackIssue && currentVideo && (
          <div className="absolute left-3 right-3 top-3 z-10 mx-auto max-w-xl rounded-lg border border-yellow-400/25 bg-black/80 px-4 py-3 text-sm shadow-lg backdrop-blur">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-medium text-yellow-200">
                  Skipped {playbackIssue.skipped} unplayable {playbackIssue.skipped === 1 ? "video" : "videos"}
                </p>
                <p className="mt-0.5 text-white/55">
                  Last failure: {playbackIssue.reason}. LoopTV is trying the next item.
                </p>
              </div>
              <button
                onClick={() => setSearchOpen(true)}
                className="self-start rounded-lg bg-white/10 px-3 py-2 text-white transition-colors hover:bg-white/15 sm:self-auto"
              >
                Search
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="bg-zinc-950 border-t border-white/10 shrink-0">
        {/* Wrap on mobile so the ~14 controls never overflow the 390px viewport. */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 sm:flex-nowrap sm:px-4">
          <button
            onClick={() => { maybeMarkWatched(currentVideo); setMode("lobby"); setCurrentVideo(null); setEmbedHealth(getEmbedHealth()); }}
            className="p-3 min-h-11 min-w-11 flex items-center justify-center rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition-colors shrink-0"
            title="Back to channel"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>

          <div className="min-w-0 flex-1 basis-[60%] sm:basis-auto">
            {currentVideo && (
              <div>
                <p className="text-white text-sm font-medium truncate">{currentVideo.title}</p>
                <p className="text-white/40 text-xs mt-0.5 flex flex-wrap items-center gap-2">
                  <span className="text-red-500 font-semibold">{config.name}</span>
                  {currentVideo.source && (
                    <span className="text-white/30 inline-flex items-center gap-1">
                      via {currentVideo.source}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          blockSource(currentVideo.source!);
                          const next = new Set(blockedSourcesRef.current);
                          next.add(currentVideo.source!);
                          syncBlockedSources(next);
                          playNext();
                        }}
                        className="text-white/20 hover:text-red-400 transition-colors ml-0.5"
                        title={`Block ${currentVideo.source}`}
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                        </svg>
                      </button>
                    </span>
                  )}
                  <span>{formatDuration(currentVideo.duration)}</span>
                  {queueCount > 0 && <span className="text-blue-400">{queueCount} queued</span>}
                  {status && <span className="text-yellow-500">{status}</span>}
                  <span className={catalogFreshness.state === "stale" ? "text-yellow-400" : "text-white/25"}>
                    {catalogFreshnessLabel}
                  </span>
                </p>
                {isSmartMix && (
                  <p className="text-white/30 text-xs mt-1 truncate">
                    {smartMixReason || "Learning from favorites, dislikes, tags, sources, skips, and watch history."}
                  </p>
                )}
                {nextVideoPreview && !isSmartMix && (
                  <p className="hidden sm:block text-white/20 text-xs mt-0.5 truncate">
                    Up next: {nextVideoPreview.title}
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-end gap-1 shrink-0">
            {currentVideo && (
              <>
                <button
                  onClick={() => {
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
                  className={`p-2 rounded-lg transition-colors ${savedForPlaybackIds.has(currentVideo.id) ? "text-blue-300" : "text-white/40 hover:text-blue-300 hover:bg-white/10"}`}
                  title={savedForPlaybackIds.has(currentVideo.id) ? "Remove browser save" : "Save in browser until watched"}
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v10m0 0l4-4m-4 4L8 9m-4 9h16" />
                  </svg>
                </button>
                <button
                  onClick={() => updateSmartPreference("favorite")}
                  className={`p-2 rounded-lg transition-colors ${smartMixProfile.favorites.includes(currentVideo.id) ? "text-yellow-300" : "text-white/40 hover:text-yellow-300 hover:bg-white/10"}`}
                  title="Favorite for Smart Mix"
                >
                  <svg className="w-5 h-5" fill={smartMixProfile.favorites.includes(currentVideo.id) ? "currentColor" : "none"} stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.48 3.499l2.006 4.064 4.486.652-3.246 3.164.766 4.468-4.012-2.109-4.012 2.109.766-4.468-3.246-3.164 4.486-.652 2.006-4.064z" />
                  </svg>
                </button>
                <button
                  onClick={() => updateSmartPreference("dislike")}
                  className={`p-2 rounded-lg transition-colors ${smartMixProfile.dislikes.includes(currentVideo.id) ? "text-red-400" : "text-white/40 hover:text-red-400 hover:bg-white/10"}`}
                  title="Dislike and skip in Smart Mix"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14H5.236a2 2 0 01-1.789-2.894l2.682-5.364A2 2 0 017.918 4H15v10l-4 7-1-1v-6zM15 4h4v10h-4V4z" />
                  </svg>
                </button>
              </>
            )}
            {isSmartMix && (
              <>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(serializeSmartMixProfile(smartMixProfile));
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }}
                  className="p-2 rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-colors"
                  title="Export Smart Mix profile"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v12m0-12l4 4m-4-4L8 7m-4 10h16v4H4v-4z" /></svg>
                </button>
                <button
                  onClick={() => {
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
                  className="p-2 rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-colors"
                  title="Import Smart Mix profile"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 21V9m0 12l4-4m-4 4l-4-4m-4-10h16V3H4v4z" /></svg>
                </button>
                <button
                  onClick={() => {
                    resetSmartMixProfile();
                    setSmartMixProfile(createSmartMixProfile());
                    setSmartMixReason("");
                  }}
                  className="p-2 rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-colors"
                  title="Reset Smart Mix profile"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v6h6M20 20v-6h-6M5 19A9 9 0 0019 5m0 0h-5m5 0v5" /></svg>
                </button>
              </>
            )}
            {/* Hide watched toggle */}
            <button
              onClick={() => setHideWatched((h) => !h)}
              className={`p-2 rounded-lg transition-colors ${hideWatched ? "text-green-400 hover:bg-white/10" : "text-white/30 hover:text-white/60 hover:bg-white/10"}`}
              title={`${hideWatched ? "Showing unwatched only" : "Showing all"} (W)`}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {hideWatched ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                )}
              </svg>
            </button>

            <button
              onClick={() => {
                if (currentVideo) {
                  navigator.clipboard.writeText(`https://youtube.com/watch?v=${currentVideo.id}`);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }
              }}
              className={`p-2 rounded-lg transition-colors ${copied ? "text-green-400" : "text-white/60 hover:text-white hover:bg-white/10"}`}
              title="Copy YouTube link"
            >
              {copied ? (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" /></svg>
              )}
            </button>
            <button onClick={() => setSearchOpen(true)} className="p-2 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors" title="Search (/)">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
            </button>
            <button
              onClick={() => setShowGuide((g) => !g)}
              className={`p-2 rounded-lg transition-colors ${showGuide ? "text-white bg-white/10" : "text-white/60 hover:text-white hover:bg-white/10"}`}
              title="Channel guide (G)"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h8M4 18h8" />
              </svg>
            </button>
            <div className="w-px h-5 bg-white/10 mx-1" />
            <button onClick={playPrev} className={`p-3 min-h-11 min-w-11 flex items-center justify-center rounded-lg transition-colors ${hasHistory ? "text-white/60 hover:text-white hover:bg-white/10" : "text-white/20 cursor-not-allowed"}`} title="Previous (P)">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" /></svg>
            </button>
            <button onClick={() => { playerRef.current?.togglePlay(); setPaused((p) => !p); }} className="p-3 min-h-11 min-w-11 flex items-center justify-center rounded-lg text-white hover:bg-white/10 transition-colors" title="Play/Pause (Space)">
              {paused ? (
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
              ) : (
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></svg>
              )}
            </button>
            <button onClick={() => playNext()} className="p-3 min-h-11 min-w-11 flex items-center justify-center rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors" title="Next (N)">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" /></svg>
            </button>
            <div className="w-px h-5 bg-white/10 mx-1" />
            <button onClick={() => { playerRef.current?.toggleMute(); setMuted((m) => !m); }} className="p-2 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors" title="Mute (M)">
              {muted ? (
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" /></svg>
              ) : (
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" /></svg>
              )}
            </button>
            <button onClick={() => { if (document.fullscreenElement) { document.exitFullscreen(); } else { document.documentElement.requestFullscreen(); } }} className="p-2 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors" title="Fullscreen (F)">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" /></svg>
            </button>
          </div>
        </div>

      </div>

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
        onToggleBlock={handleToggleBlock}
      />
    </div>
  );
}
