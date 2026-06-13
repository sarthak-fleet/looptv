import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  addWatchLater,
  addSavedForPlayback,
  blockSource,
  clearWatched,
  getBlockedSources,
  getEmbedHealth,
  getSavedForPlayback,
  getSmartMixProfileRaw,
  getSourceEmbedBlockRate,
  getStats,
  getUserPrefs,
  getWatchedIds,
  getWatchLater,
  markWatched,
  recordEmbedAttempt,
  removeSavedForPlayback,
  removeWatchLater,
  resetSmartMixProfile,
  resetUserPrefs,
  setSmartMixProfileRaw,
  setUserPrefs,
  unblockSource,
} from "../watched";

// Mock localStorage
const store: Record<string, string> = {};

const localStorageMock: Storage = {
  getItem: vi.fn((key: string) => store[key] ?? null),
  setItem: vi.fn((key: string, value: string) => {
    store[key] = value;
  }),
  removeItem: vi.fn((key: string) => {
    delete store[key];
  }),
  clear: vi.fn(() => {
    for (const key of Object.keys(store)) delete store[key];
  }),
  get length() {
    return Object.keys(store).length;
  },
  key: vi.fn((index: number) => Object.keys(store)[index] ?? null),
};

// The watched.ts module checks `typeof window` to guard SSR.
// We need both `window` and `localStorage` available.
beforeEach(() => {
  // Clear backing store between tests
  for (const key of Object.keys(store)) delete store[key];
  vi.stubGlobal("window", { localStorage: localStorageMock });
  vi.stubGlobal("localStorage", localStorageMock);
  vi.clearAllMocks();
});

describe("getWatchedIds", () => {
  it("returns an empty Set when nothing is stored", () => {
    const ids = getWatchedIds();
    expect(ids).toBeInstanceOf(Set);
    expect(ids.size).toBe(0);
  });

  it("returns stored ids after markWatched", () => {
    markWatched("vid1", 120, "station1", "YouTube");
    const ids = getWatchedIds();
    expect(ids.has("vid1")).toBe(true);
  });

  it("falls back to an empty set when stored data is malformed", () => {
    store.looptv_watched = "{}";
    expect(getWatchedIds().size).toBe(0);
  });
});

describe("markWatched", () => {
  it("adds a video id to the watched set", () => {
    markWatched("v1", 60, "s1", "src1");
    const ids = getWatchedIds();
    expect(ids.has("v1")).toBe(true);
    expect(ids.size).toBe(1);
  });

  it("does not double-count a video that is already watched", () => {
    markWatched("v1", 60, "s1", "src1");
    markWatched("v1", 60, "s1", "src1");
    const ids = getWatchedIds();
    expect(ids.size).toBe(1);
    const stats = getStats();
    expect(stats.totalWatched).toBe(1);
  });

  it("tracks multiple distinct videos", () => {
    markWatched("v1", 60, "s1", "src1");
    markWatched("v2", 90, "s1", "src1");
    const ids = getWatchedIds();
    expect(ids.size).toBe(2);
  });
});

describe("getStats", () => {
  it("returns default stats when nothing is stored", () => {
    const stats = getStats();
    expect(stats.totalWatched).toBe(0);
    expect(stats.totalSeconds).toBe(0);
    expect(stats.byStation).toEqual({});
    expect(stats.bySource).toEqual({});
    expect(stats.lastWatched).toBe("");
  });

  it("returns correct totals after marking videos", () => {
    markWatched("v1", 100, "s1", "YouTube");
    markWatched("v2", 200, "s2", "Vimeo");
    const stats = getStats();
    expect(stats.totalWatched).toBe(2);
    expect(stats.totalSeconds).toBe(300);
    expect(stats.byStation).toEqual({ s1: 1, s2: 1 });
    expect(stats.bySource).toEqual({ YouTube: 1, Vimeo: 1 });
    expect(stats.lastWatched).not.toBe("");
  });

  it("aggregates counts per station", () => {
    markWatched("v1", 60, "snl", "src1");
    markWatched("v2", 60, "snl", "src1");
    markWatched("v3", 60, "comedy", "src1");
    const stats = getStats();
    expect(stats.byStation.snl).toBe(2);
    expect(stats.byStation.comedy).toBe(1);
  });
});

describe("clearWatched", () => {
  it("resets watched ids and stats", () => {
    markWatched("v1", 120, "s1", "src1");
    expect(getWatchedIds().size).toBe(1);
    expect(getStats().totalWatched).toBe(1);

    clearWatched();

    expect(getWatchedIds().size).toBe(0);
    expect(getStats().totalWatched).toBe(0);
  });
});

describe("blocked sources", () => {
  it("starts empty", () => {
    expect(getBlockedSources().size).toBe(0);
  });

  it("blocks and unblocks a source", () => {
    blockSource("Comedy Central");
    expect(getBlockedSources().has("Comedy Central")).toBe(true);
    unblockSource("Comedy Central");
    expect(getBlockedSources().has("Comedy Central")).toBe(false);
  });

  it("does not duplicate when blocked twice", () => {
    blockSource("SNL");
    blockSource("SNL");
    expect(getBlockedSources().size).toBe(1);
  });

  it("unblock is a no-op if not previously blocked", () => {
    unblockSource("never-blocked");
    expect(getBlockedSources().size).toBe(0);
  });
});

describe("watch later", () => {
  it("starts empty", () => {
    expect(getWatchLater()).toEqual([]);
  });

  it("adds an id and preserves insertion order", () => {
    addWatchLater("v1");
    addWatchLater("v2");
    expect(getWatchLater()).toEqual(["v1", "v2"]);
  });

  it("does not duplicate ids", () => {
    addWatchLater("v1");
    addWatchLater("v1");
    expect(getWatchLater()).toEqual(["v1"]);
  });

  it("falls back to an empty list when stored data is malformed", () => {
    store.looptv_watch_later = "{}";
    expect(getWatchLater()).toEqual([]);
  });

  it("removes a specific id without disturbing others", () => {
    addWatchLater("v1");
    addWatchLater("v2");
    addWatchLater("v3");
    removeWatchLater("v2");
    expect(getWatchLater()).toEqual(["v1", "v3"]);
  });
});

describe("saved for playback", () => {
  it("starts empty", () => {
    expect(getSavedForPlayback()).toEqual([]);
  });

  it("adds an id without duplicating it", () => {
    addSavedForPlayback("v1");
    addSavedForPlayback("v1");
    expect(getSavedForPlayback()).toEqual(["v1"]);
  });

  it("falls back to an empty list when stored data is malformed", () => {
    store.looptv_saved_for_playback = "{}";
    expect(getSavedForPlayback()).toEqual([]);
  });

  it("removes a specific id without disturbing others", () => {
    addSavedForPlayback("v1");
    addSavedForPlayback("v2");
    removeSavedForPlayback("v1");
    expect(getSavedForPlayback()).toEqual(["v2"]);
  });
});

describe("smart mix profile raw I/O", () => {
  it("returns null when unset", () => {
    expect(getSmartMixProfileRaw()).toBeNull();
  });

  it("round-trips an arbitrary JSON string", () => {
    setSmartMixProfileRaw('{"favorites":["a","b"]}');
    expect(getSmartMixProfileRaw()).toBe('{"favorites":["a","b"]}');
  });

  it("reset clears the stored profile", () => {
    setSmartMixProfileRaw("{}");
    resetSmartMixProfile();
    expect(getSmartMixProfileRaw()).toBeNull();
  });
});

describe("user prefs", () => {
  it("returns defaults when unset", () => {
    const prefs = getUserPrefs();
    expect(prefs).toEqual({
      defaultStation: null,
      hideWatched: true,
      autoplayOnLoad: false,
      startMuted: false,
    });
  });

  it("patches a single key without disturbing the rest", () => {
    const updated = setUserPrefs({ defaultStation: "comedy" });
    expect(updated.defaultStation).toBe("comedy");
    expect(updated.hideWatched).toBe(true);
    expect(getUserPrefs().defaultStation).toBe("comedy");
  });

  it("survives an arbitrary unknown field in stored prefs", () => {
    localStorage.setItem(
      "looptv_prefs",
      JSON.stringify({ defaultStation: "snl", legacyField: 1 }),
    );
    const prefs = getUserPrefs();
    expect(prefs.defaultStation).toBe("snl");
    expect(prefs.hideWatched).toBe(true);
  });

  it("reset wipes prefs back to defaults", () => {
    setUserPrefs({ defaultStation: "snl", autoplayOnLoad: true });
    resetUserPrefs();
    expect(getUserPrefs().defaultStation).toBeNull();
    expect(getUserPrefs().autoplayOnLoad).toBe(false);
  });

  it("recovers from malformed JSON in storage", () => {
    localStorage.setItem("looptv_prefs", "}{");
    expect(getUserPrefs().defaultStation).toBeNull();
  });
});

describe("embed health tracking", () => {
  it("returns empty object when nothing is stored", () => {
    expect(getEmbedHealth()).toEqual({});
  });

  it("records a successful embed attempt", () => {
    recordEmbedAttempt("Kurzgesagt", false);
    const health = getEmbedHealth();
    expect(health["Kurzgesagt"].checked).toBe(1);
    expect(health["Kurzgesagt"].blocked).toBe(0);
  });

  it("records a blocked embed attempt", () => {
    recordEmbedAttempt("BrokenChannel", true);
    const health = getEmbedHealth();
    expect(health["BrokenChannel"].checked).toBe(1);
    expect(health["BrokenChannel"].blocked).toBe(1);
  });

  it("accumulates multiple attempts for the same source", () => {
    recordEmbedAttempt("MySource", false);
    recordEmbedAttempt("MySource", false);
    recordEmbedAttempt("MySource", true);
    const health = getEmbedHealth();
    expect(health["MySource"].checked).toBe(3);
    expect(health["MySource"].blocked).toBe(1);
  });

  it("tracks multiple sources independently", () => {
    recordEmbedAttempt("Alpha", false);
    recordEmbedAttempt("Beta", true);
    const health = getEmbedHealth();
    expect(health["Alpha"].blocked).toBe(0);
    expect(health["Beta"].blocked).toBe(1);
  });

  it("getSourceEmbedBlockRate returns 0 when no data exists", () => {
    expect(getSourceEmbedBlockRate("unknown")).toBe(0);
  });

  it("getSourceEmbedBlockRate calculates block rate correctly", () => {
    recordEmbedAttempt("Partial", true);
    recordEmbedAttempt("Partial", true);
    recordEmbedAttempt("Partial", false);
    recordEmbedAttempt("Partial", false);
    expect(getSourceEmbedBlockRate("Partial")).toBeCloseTo(0.5);
  });

  it("sets sampledAt on each attempt", () => {
    recordEmbedAttempt("Timed", false);
    const health = getEmbedHealth();
    expect(health["Timed"].sampledAt).not.toBe("");
    expect(new Date(health["Timed"].sampledAt).getTime()).toBeLessThanOrEqual(Date.now());
  });

  it("is a no-op for empty source string", () => {
    recordEmbedAttempt("", false);
    expect(getEmbedHealth()).toEqual({});
  });
});

describe("malformed localStorage tolerance", () => {
  it("getWatchedIds recovers from invalid JSON", () => {
    localStorage.setItem("looptv_watched", "{not json");
    expect(getWatchedIds().size).toBe(0);
  });

  it("getStats returns defaults on invalid JSON", () => {
    localStorage.setItem("looptv_stats", "[broken");
    expect(getStats().totalWatched).toBe(0);
  });

  it("getWatchLater recovers from invalid JSON", () => {
    localStorage.setItem("looptv_watch_later", "}{");
    expect(getWatchLater()).toEqual([]);
  });

  it("getSavedForPlayback recovers from invalid JSON", () => {
    localStorage.setItem("looptv_saved_for_playback", "}{");
    expect(getSavedForPlayback()).toEqual([]);
  });
});
