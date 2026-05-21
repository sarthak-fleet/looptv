/**
 * Owner-facing analytics — the fixed 4-event taxonomy.
 *
 * Every fleet project emits exactly these four events — `signup`, `activated`,
 * `core_action`, `returned` — so a single PostHog project can build one
 * cross-fleet funnel (signup -> activated -> core_action) and a D1/D7
 * retention insight, with no custom dashboard.
 *
 * Every event carries `project: "looptv"`.
 *
 * LoopTV is a static, no-auth app: there is no account. The taxonomy is
 * adapted to a device-level identity backed by localStorage:
 *  - `signup`    — the first-ever visit from this browser (a "new viewer").
 *  - `activated` — the viewer reaches first real value: their first video play.
 *  - `core_action` — the thing the product exists to do: play a video, or
 *    build a custom station.
 *  - `returned`  — a later session from a viewer who already has watch history.
 *
 * Browser-only: LoopTV is a static export with no server runtime, so this
 * routes exclusively through `@saas-maker/posthog-client` (`track`).
 */
"use client";

import { track } from "@saas-maker/posthog-client";

const PROJECT = "looptv" as const;

/** The product-specific action behind a `core_action` event. */
export type CoreAction = "video_played" | "station_built";

interface AnalyticsEventMap {
  /** The first-ever visit from this browser. */
  signup: { project: typeof PROJECT };
  /** The viewer reaches first real value — their first video play. */
  activated: { project: typeof PROJECT };
  /** The thing the product exists to do. */
  core_action: { project: typeof PROJECT; action: CoreAction };
  /** A return session by a viewer with prior watch activity. */
  returned: { project: typeof PROJECT };
}

function emit<K extends keyof AnalyticsEventMap>(
  event: K,
  props: Omit<AnalyticsEventMap[K], "project">,
): void {
  try {
    if (typeof window === "undefined") return;
    track(event, { project: PROJECT, ...props });
  } catch {
    // Analytics must NEVER break a user flow. Swallow and move on.
  }
}

// localStorage keys recording lifecycle milestones for the device identity.
const SIGNUP_KEY = "looptv:signed-up";
const ACTIVATED_KEY = "looptv:activated";
// Per-tab guard so `returned` fires at most once per session start.
const RETURNED_FIRED_KEY = "looptv:returned-fired";

function readFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function writeFlag(key: string): void {
  try {
    localStorage.setItem(key, "1");
  } catch {
    // Non-fatal — worst case the event de-dupes on the next visit.
  }
}

/** Fire once, on the first-ever visit from this browser. */
export function trackSignup(): void {
  if (typeof window === "undefined" || readFlag(SIGNUP_KEY)) return;
  writeFlag(SIGNUP_KEY);
  emit("signup", {});
}

/** Fire once, when the viewer plays their first video. */
export function trackActivated(): void {
  if (typeof window === "undefined" || readFlag(ACTIVATED_KEY)) return;
  writeFlag(ACTIVATED_KEY);
  emit("activated", {});
}

/** Fire on each completion of the core product action. */
export function trackCoreAction(action: CoreAction): void {
  emit("core_action", { action });
}

/**
 * Fire on session start for a viewer who has prior watch activity.
 * `hasPriorActivity` — true when the device already has watch history (so a
 * fresh session counts as a return visit, not a first-ever `signup`).
 */
export function trackReturned(hasPriorActivity: boolean): void {
  if (typeof window === "undefined" || !hasPriorActivity) return;
  try {
    if (sessionStorage.getItem(RETURNED_FIRED_KEY) === "1") return;
    sessionStorage.setItem(RETURNED_FIRED_KEY, "1");
  } catch {
    // sessionStorage unavailable — fall through, worst case it re-fires.
  }
  emit("returned", {});
}
