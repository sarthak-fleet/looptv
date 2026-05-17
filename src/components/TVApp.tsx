"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import type { Catalog, CatalogSummary, Video } from "@/lib/types";
import { loadCatalog, loadCatalogSummary, getVideosForStation, pickRandom, formatDuration } from "@/lib/catalog";
import { getWatchedIds, markWatched, getStats, getBlockedSources, blockSource, getWatchLater, addWatchLater, removeWatchLater, getSmartMixProfileRaw, setSmartMixProfileRaw, resetSmartMixProfile } from "@/lib/watched";
import { applyPreference, createSmartMixProfile, parseSmartMixProfile, pickSmartMixVideo, serializeSmartMixProfile, type SmartMixProfile } from "@/lib/smartmix";
import { ytErrorReason } from "@/lib/yt-errors";
import Link from "next/link";
import Player, { type PlayerHandle } from "./Player";
import Search from "./Search";
import StationBuilder from "./StationBuilder";
import stations from "../../channels.config";

const SMART_MIX_ID = "smart-mix";

export default function TVApp({ initialChannel }: { initialChannel?: string }) {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [catalogSummary, setCatalogSummary] = useState<CatalogSummary | null>(null);
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
  const [watchedIds, setWatchedIds] = useState<Set<string>>(() => getWatchedIds());
  const [blockedSources, setBlockedSources] = useState<Set<string>>(() => getBlockedSources());
  const [activeSources, setActiveSources] = useState<Set<string> | null>(null); // null = all active
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [copied, setCopied] = useState(false);
  const [watchLaterIds, setWatchLaterIds] = useState<Set<string>>(() => new Set(getWatchLater()));
  const [smartMixProfile, setSmartMixProfile] = useState<SmartMixProfile>(() => {
    const raw = getSmartMixProfileRaw();
    if (!raw) return createSmartMixProfile();
    try {
      return parseSmartMixProfile(raw);
    } catch {
      return createSmartMixProfile();
    }
  });
  const [smartMixReason, setSmartMixReason] = useState("");
  const queueRef = useRef<Video[]>([]);
  const [queueCount, setQueueCount] = useState(0);
  const skippedRef = useRef(new Set<string>());
  const historyRef = useRef<Video[]>([]);
  const [hasHistory, setHasHistory] = useState(false);
  const playerRef = useRef<PlayerHandle>(null);

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
    loadCatalogSummary()
      .then(setCatalogSummary)
      .catch(() => {
        // The full catalog still powers playback; summary only improves first paint.
      });
    loadCatalog()
      .then((c) => { setCatalog(c); setStatus(""); })
      .catch((err) => {
        console.error("TVApp: catalog load failed after retries", err);
        const isDev =
          typeof window !== "undefined" &&
          (window.location.hostname === "localhost" ||
            window.location.hostname === "127.0.0.1");
        setStatus(
          isDev
            ? "No catalog found. Run: pnpm run build:catalog"
            : "Catalog couldn't load. Check your connection and refresh.",
        );
      });
  }, []);

  // Mark video as watched only if user watched >= 50%
  const maybeMarkWatched = useCallback((video: Video | null, forceWatched = false) => {
    if (!video) return;
    const progress = playerRef.current?.getWatchProgress() ?? 0;
    if (forceWatched || progress >= 0.5) {
      markWatched(video.id, video.duration, activeStation, video.source || "");
      setWatchedIds((prev) => {
        if (prev.has(video.id)) return prev;
        return new Set([...prev, video.id]);
      });
    }
  }, [activeStation]);

  const playNext = useCallback(
    (cat?: string) => {
      if (!catalog) return;

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
        (v) => !skippedRef.current.has(v.id) && (!hideWatched || !watchedIds.has(v.id)) && (!v.source || !blockedSources.has(v.source)) && (!activeSources || !v.source || activeSources.has(v.source))
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
            blockedSources,
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
    [catalog, activeStation, activeCategory, currentVideo, hideWatched, watchedIds, blockedSources, activeSources, maybeMarkWatched, isSmartMix, smartMixProfile]
  );

  const playPrev = useCallback(() => {
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

  // Keyboard shortcuts
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.key === "?") { e.preventDefault(); setShowShortcuts((s) => !s); return; }
      if (e.key === "/") { e.preventDefault(); setSearchOpen(true); return; }
      if (e.key === "Escape") { e.preventDefault(); setSearchOpen(false); setShowShortcuts(false); return; }
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
  }, [mode, playNext, playPrev, handleCategoryChange, categories, searchOpen, startPlaying]);

  const handleError = useCallback(
    (code: number) => {
      if (currentVideo) skippedRef.current.add(currentVideo.id);
      setStatus(`Skipping (${ytErrorReason(code)})...`);
      setTimeout(() => playNext(), 500);
    },
    [currentVideo, playNext]
  );

  const allVideos = isPlayAll || isSmartMix
    ? Object.values(catalog?.stations ?? {}).flatMap((s) => s.videos)
    : catalog?.stations?.[activeStation]?.videos ?? [];
  const catalogLoaded = catalog !== null;
  const unwatchedCount = allVideos.filter((v) => !watchedIds.has(v.id)).length;

  const updateSmartPreference = useCallback((preference: "favorite" | "dislike") => {
    if (!currentVideo) return;
    const next = applyPreference(smartMixProfile, currentVideo, preference);
    setSmartMixProfile(next);
    setSmartMixProfileRaw(serializeSmartMixProfile(next));
    if (preference === "dislike") playNext();
  }, [currentVideo, playNext, smartMixProfile]);

  // ── Landing: channel picker with stats ──
  if (mode === "landing") {
    const stats = getStats();
    const totalHours = Math.floor(stats.totalSeconds / 3600);
    const totalMins = Math.floor((stats.totalSeconds % 3600) / 60);

    return (
      <div className="min-h-screen bg-black flex flex-col items-center px-6 py-16 overflow-y-auto">
        <div className="text-center mb-10">
          <h1 className="text-white text-5xl font-bold tracking-tight mb-2">LoopTV</h1>
          <p className="text-white/40 text-base">Pick a channel. Random clips play nonstop.</p>
          <div className="flex items-center justify-center gap-3 mt-5">
            <button
              onClick={() => { setActiveStation("all"); setMode("playing"); }}
              className="bg-red-600 hover:bg-red-500 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-colors flex items-center gap-2"
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
              className="bg-white/10 hover:bg-white/15 text-white text-sm px-5 py-2.5 rounded-xl transition-colors flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
              Shuffle
            </button>
            <button
              onClick={() => { setActiveStation(SMART_MIX_ID); setMode("playing"); }}
              className="bg-white text-black hover:bg-white/90 text-sm font-semibold px-5 py-2.5 rounded-xl transition-colors flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 4h2m-1 0v16m-7-5h14M5 9h14" /></svg>
              Smart Mix
            </button>
            <button
              onClick={() => setStationBuilderOpen(true)}
              className="bg-white/10 hover:bg-white/15 text-white text-sm px-5 py-2.5 rounded-xl transition-colors flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v14m7-7H5" />
              </svg>
              Build Station
            </button>
          </div>
          {stats.totalWatched > 0 && (
            <p className="text-white/20 text-sm mt-4">
              {stats.totalWatched.toLocaleString()} watched
              {totalHours > 0 ? ` · ${totalHours}h ${totalMins}m` : totalMins > 0 ? ` · ${totalMins}m` : ""}
            </p>
          )}
        </div>
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
                return (
                  <button
                    key={s.handle}
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
                    className={`px-2.5 py-1 rounded-full text-xs transition-colors ${
                      isActive
                        ? "bg-white/15 text-white/70"
                        : "bg-white/5 text-white/20 line-through"
                    }`}
                  >
                    {s.name}
                  </button>
                );
              })}
            </div>
          )}
          <p className="text-white/40 text-sm">
            {allVideos.length > 0 ? `${unwatchedCount.toLocaleString()} unwatched of ${allVideos.length.toLocaleString()}` : catalogLoaded ? "No videos" : "Loading..."}
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
      </div>
    );
  }

  // ── Player view ──
  return (
    <div className="fixed inset-0 bg-black flex flex-col">
      <div className="relative" style={{ height: "calc(100vh - 88px)" }}>
        {currentVideo && (
          <Player
            ref={playerRef}
            videoId={currentVideo.id}
            onEnded={playNext}
            onError={handleError}
            onReady={() => setStatus("")}
            onPlay={() => setPaused(false)}
            onPause={() => setPaused(true)}
          />
        )}
      </div>

      <div className="bg-zinc-950 border-t border-white/10 shrink-0">
        <div className="flex items-center gap-3 px-4 py-2">
          <button
            onClick={() => { maybeMarkWatched(currentVideo); setMode("lobby"); setCurrentVideo(null); }}
            className="p-2 rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition-colors shrink-0"
            title="Back to channel"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>

          <div className="min-w-0 flex-1">
            {currentVideo && (
              <div>
                <p className="text-white text-sm font-medium truncate">{currentVideo.title}</p>
                <p className="text-white/40 text-xs mt-0.5 flex items-center gap-2">
                  <span className="text-red-500 font-semibold">{config.name}</span>
                  {currentVideo.source && (
                    <span className="text-white/30 inline-flex items-center gap-1">
                      via {currentVideo.source}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          blockSource(currentVideo.source!);
                          setBlockedSources(new Set([...blockedSources, currentVideo.source!]));
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
                </p>
                {isSmartMix && (
                  <p className="text-white/30 text-xs mt-1 truncate">
                    {smartMixReason || "Learning from favorites, dislikes, tags, sources, skips, and watch history."}
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {currentVideo && (
              <>
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
                    const next = parseSmartMixProfile(raw);
                    setSmartMixProfile(next);
                    setSmartMixProfileRaw(serializeSmartMixProfile(next));
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
            <div className="w-px h-5 bg-white/10 mx-1" />
            <button onClick={playPrev} className={`p-2 rounded-lg transition-colors ${hasHistory ? "text-white/60 hover:text-white hover:bg-white/10" : "text-white/20 cursor-not-allowed"}`} title="Previous (P)">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" /></svg>
            </button>
            <button onClick={() => { playerRef.current?.togglePlay(); setPaused((p) => !p); }} className="p-2 rounded-lg text-white hover:bg-white/10 transition-colors" title="Play/Pause (Space)">
              {paused ? (
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
              ) : (
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></svg>
              )}
            </button>
            <button onClick={() => playNext()} className="p-2 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors" title="Next (N)">
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
    </div>
  );
}
