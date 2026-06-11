"use client";

import { useEffect, useRef, useCallback, useImperativeHandle, useState, forwardRef } from "react";
import { recordEmbedAttempt } from "@/lib/watched";

declare global {
  interface Window {
    YT: unknown;
    onYouTubeIframeAPIReady: () => void;
  }
}

export interface PlayerHandle {
  togglePlay: () => void;
  toggleMute: () => void;
  volumeUp: () => void;
  volumeDown: () => void;
  getState: () => { paused: boolean; muted: boolean; volume: number };
  getWatchProgress: () => number; // 0-1, how far through the video
}

interface PlayerProps {
  videoId: string;
  source?: string; // YouTube channel name for embed-health tracking
  onEnded: () => void;
  onError: (code: number) => void;
  onReady: () => void;
  onPlay: () => void;
  onPause: () => void;
}

let apiLoaded = false;
let apiReady = false;
let apiFailed = false;
let apiLoadTimeout: ReturnType<typeof setTimeout> | null = null;
const readyCallbacks: (() => void)[] = [];
const failCallbacks: (() => void)[] = [];
// YouTube's iframe_api normally fires onYouTubeIframeAPIReady within a few
// seconds. If the script is blocked (offline, network filter, ad-block) the
// callback never fires — guard with a timeout so the UI can degrade.
const API_LOAD_TIMEOUT_MS = 12000;

function failApi() {
  if (apiFailed || apiReady) return;
  apiFailed = true;
  failCallbacks.forEach((cb) => cb());
  failCallbacks.length = 0;
  readyCallbacks.length = 0;
}

function loadYTApi() {
  if (apiLoaded) return;
  apiLoaded = true;

  const tag = document.createElement("script");
  tag.src = "https://www.youtube.com/iframe_api";
  tag.onerror = failApi;
  document.head.appendChild(tag);

  window.onYouTubeIframeAPIReady = () => {
    apiReady = true;
    readyCallbacks.forEach((cb) => cb());
    readyCallbacks.length = 0;
    failCallbacks.length = 0;
  };

  apiLoadTimeout = setTimeout(() => {
    apiLoadTimeout = null;
    if (!apiReady) failApi();
  }, API_LOAD_TIMEOUT_MS);
}

function onApiReady(cb: () => void, onFail?: () => void) {
  if (apiReady) {
    cb();
    return;
  }
  if (apiFailed) {
    onFail?.();
    return;
  }
  readyCallbacks.push(cb);
  if (onFail) failCallbacks.push(onFail);
  loadYTApi();
}

const Player = forwardRef<PlayerHandle, PlayerProps>(function Player(
  { videoId, source, onEnded, onError, onReady, onPlay, onPause },
  ref
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YT.Player | null>(null);
  const currentVideoRef = useRef(videoId);
  const embedTrackedRef = useRef(false); // one record per video load
  const [apiUnavailable, setApiUnavailable] = useState(false);

  const onEndedRef = useRef(onEnded);
  const onErrorRef = useRef(onError);
  const onReadyRef = useRef(onReady);
  const onPlayRef = useRef(onPlay);
  const onPauseRef = useRef(onPause);
  const sourceRef = useRef(source);
  useEffect(() => {
    onEndedRef.current = onEnded;
    onErrorRef.current = onError;
    onReadyRef.current = onReady;
    onPlayRef.current = onPlay;
    onPauseRef.current = onPause;
    sourceRef.current = source;
  });

  useImperativeHandle(ref, () => ({
    togglePlay() {
      const p = playerRef.current;
      if (!p) return;
      const state = p.getPlayerState();
      if (state === window.YT.PlayerState.PLAYING) {
        p.pauseVideo();
      } else {
        p.playVideo();
      }
    },
    toggleMute() {
      const p = playerRef.current;
      if (!p) return;
      if (p.isMuted()) {
        p.unMute();
      } else {
        p.mute();
      }
    },
    volumeUp() {
      const p = playerRef.current;
      if (!p) return;
      p.setVolume(Math.min(100, p.getVolume() + 10));
    },
    volumeDown() {
      const p = playerRef.current;
      if (!p) return;
      p.setVolume(Math.max(0, p.getVolume() - 10));
    },
    getState() {
      const p = playerRef.current;
      if (!p) return { paused: false, muted: false, volume: 100 };
      return {
        paused: p.getPlayerState() !== window.YT.PlayerState.PLAYING,
        muted: p.isMuted(),
        volume: p.getVolume(),
      };
    },
    getWatchProgress() {
      const p = playerRef.current;
      if (!p || typeof p.getCurrentTime !== "function" || typeof p.getDuration !== "function") return 0;
      const duration = p.getDuration();
      if (!duration || duration <= 0) return 0;
      return p.getCurrentTime() / duration;
    },
  }));

  const createPlayer = useCallback(() => {
    if (!containerRef.current || playerRef.current) return;

    playerRef.current = new window.YT.Player(containerRef.current, {
      width: "100%",
      height: "100%",
      videoId: currentVideoRef.current,
      playerVars: {
        autoplay: 1,
        controls: 1,
        modestbranding: 1,
        rel: 0,
        iv_load_policy: 3,
        fs: 1,
        playsinline: 1,
      },
      events: {
        onReady: () => onReadyRef.current(),
        onStateChange: (e: YT.OnStateChangeEvent) => {
          switch (e.data) {
            case window.YT.PlayerState.ENDED:
              onEndedRef.current();
              break;
            case window.YT.PlayerState.PLAYING:
              if (!embedTrackedRef.current && sourceRef.current) {
                embedTrackedRef.current = true;
                recordEmbedAttempt(sourceRef.current, false);
              }
              onPlayRef.current();
              break;
            case window.YT.PlayerState.PAUSED:
              onPauseRef.current();
              break;
          }
        },
        onError: (e: YT.OnErrorEvent) => {
          if ((e.data === 101 || e.data === 150) && !embedTrackedRef.current && sourceRef.current) {
            embedTrackedRef.current = true;
            recordEmbedAttempt(sourceRef.current, true);
          }
          onErrorRef.current(e.data);
        },
      },
    });
  }, []);

  useEffect(() => {
    onApiReady(createPlayer, () => setApiUnavailable(true));
    return () => {
      if (apiLoadTimeout) {
        clearTimeout(apiLoadTimeout);
        apiLoadTimeout = null;
      }
      playerRef.current?.destroy();
      playerRef.current = null;
    };
  }, [createPlayer]);

  useEffect(() => {
    currentVideoRef.current = videoId;
    embedTrackedRef.current = false;
    if (playerRef.current && typeof playerRef.current.loadVideoById === "function") {
      playerRef.current.loadVideoById(videoId);
    }
  }, [videoId]);

  if (apiUnavailable) {
    return (
      <div className="player-container absolute inset-0 bg-black flex items-center justify-center p-8">
        <div className="text-center max-w-sm">
          <p className="text-white text-base font-medium mb-2">
            Couldn&apos;t load the video player
          </p>
          <p className="text-white/50 text-sm mb-5">
            The YouTube player couldn&apos;t be reached. Check your connection —
            a network filter or ad-blocker can also block it.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/15 text-white text-sm transition-colors"
          >
            Reload
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="player-container absolute inset-0 bg-black">
      <div ref={containerRef} className="w-full h-full" />
    </div>
  );
});

export default Player;
