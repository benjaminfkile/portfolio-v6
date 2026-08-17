import { useSyncExternalStore } from 'react';
import { getNowPlaying } from './api';
import type { NowPlayingResponse } from './api';
import {
  hubChannelPrefix,
  subscribeChannel,
  type ChannelEnvelope,
  type ChannelSubscriber,
} from './hubClient';

/**
 * Shared now-playing state (spec §3.5, §4.6; REALTIME.md; task 85) — ONE
 * module-level store consumed by every component that renders the current
 * track (`NowPlayingSection`, `HeroInstrumentStrip`). Before this existed each
 * consumer fetched privately: the section polled while the hero strip fetched
 * once and went stale on track changes, and a page showing both paid for two
 * identical requests.
 *
 * Realtime path (REALTIME.md): the store joins the app-wide SignalR hub on the
 * `<prefix>:now-playing` channel (see {@link hubChannelPrefix}) and applies
 * `ChannelEvent` payloads directly. Events are hints — the HTTP endpoint
 * stays the source of truth —
 * so we still poll, just at a 30s FLOOR while the hub is healthy (and the
 * usual 5s FALLBACK when it isn't). On initial connect and after every
 * reconnect the hub client re-joins us to the channel and we re-fetch over
 * HTTP so we can't miss whatever changed while we were offline.
 *
 * The store is deliberately plain module state + `useSyncExternalStore` — no
 * context provider, no state-management dependency (DESIGN.md §8 spirit: the
 * smallest thing that works). Both the poller AND the hub subscription are
 * refcounted: they start when the first subscriber mounts and stop when the
 * last unmounts, so a page with no now-playing UI never polls or connects.
 *
 * Live-section rules carry over:
 *   - Interval ticks are no-ops while the tab is hidden — a backgrounded tab
 *     must not poll (§3.5) — and returning to the foreground refetches
 *     immediately so the visitor sees a fresh track.
 *   - A failed fetch degrades to `{ status: 'error' }`; consumers map that to
 *     their own quiet fallback (the section renders idle, the strip a dim "—").
 *     Errors are logged, never thrown.
 */
export type NowPlayingState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; data: NowPlayingResponse };

/**
 * Fast HTTP fallback cadence — used when the hub is unavailable. Matches the
 * API's server-side now-playing cache TTL (§4.6), so a faster poll would just
 * re-read the cached payload without seeing anything new.
 */
export const NOW_PLAYING_POLL_INTERVAL_MS = 5_000;

/**
 * Slow HTTP floor while the hub is healthy (REALTIME.md, task 85). The hub
 * pushes track changes live; this floor is just a safety re-fetch in case an
 * event was dropped or the payload drifted.
 */
export const NOW_PLAYING_POLL_FLOOR_MS = 30_000;

/**
 * If no ChannelEvent (heartbeat or otherwise) arrives for this long while the
 * hub claims to be connected, treat the hub as sick and drop back to the fast
 * fallback cadence. REALTIME.md guidance: heartbeats stop → fetch is truth.
 */
export const HUB_HEARTBEAT_STALE_MS = 45_000;

/** How often to check the hub heartbeat freshness — coarse is fine. */
const STALE_CHECK_INTERVAL_MS = 5_000;

/**
 * Channel name owned by the API for now-playing pushes (REALTIME.md, task 88).
 * Composed from the env-driven {@link hubChannelPrefix} at call time so the
 * dev site subscribes to `portfolio-v6-api-dev:now-playing` while prod stays on
 * `portfolio-v6-api:now-playing`. Read on each `start()` — never cached at
 * module load — so tests can override the prefix via `vi.stubEnv`.
 */
export function nowPlayingChannel(): string {
  return `${hubChannelPrefix()}:now-playing`;
}

const INITIAL: NowPlayingState = { status: 'loading' };

let state: NowPlayingState = INITIAL;
const subscribers = new Set<() => void>();
let intervalId: number | null = null;
let currentIntervalMs: number = NOW_PLAYING_POLL_INTERVAL_MS;
let inFlight: AbortController | null = null;

/** Hub state — driven by callbacks from {@link ../lib/hubClient}. */
let hubConnected = false;
let lastHubMessageAt = 0;
let staleCheckId: number | null = null;
let unsubHub: (() => void) | null = null;

function emit(next: NowPlayingState): void {
  state = next;
  subscribers.forEach((listener) => listener());
}

/** Fetch once; concurrent callers collapse onto the in-flight request. */
function load(): void {
  if (inFlight) return;
  const controller = new AbortController();
  inFlight = controller;
  getNowPlaying({ signal: controller.signal })
    .then((data) => {
      inFlight = null;
      emit({ status: 'ready', data });
    })
    .catch((error: unknown) => {
      if (controller.signal.aborted) return; // teardown, not a failure
      inFlight = null;
      emit({ status: 'error' });
      console.error('Failed to load now-playing', error);
    });
}

/** A tick only fetches while the tab is visible (§3.5). */
function onTick(): void {
  if (document.visibilityState === 'visible') load();
}

/** Refetch immediately when the tab returns to the foreground. */
function onVisibilityChange(): void {
  if (document.visibilityState === 'visible') load();
}

function scheduleInterval(ms: number): void {
  if (intervalId != null) window.clearInterval(intervalId);
  currentIntervalMs = ms;
  intervalId = window.setInterval(onTick, ms);
}

function isNowPlayingPayload(x: unknown): x is NowPlayingResponse {
  if (!x || typeof x !== 'object') return false;
  return typeof (x as { playing?: unknown }).playing === 'boolean';
}

function switchToFastPoll(): void {
  hubConnected = false;
  if (currentIntervalMs !== NOW_PLAYING_POLL_INTERVAL_MS) {
    scheduleInterval(NOW_PLAYING_POLL_INTERVAL_MS);
    // The fallback exists to keep the UI fresh — grab a fresh payload right
    // away rather than waiting up to a full fast tick for the next scheduled
    // fetch. `load()` coalesces so a stray in-flight request isn't duplicated.
    load();
  }
}

function switchToFloorPoll(): void {
  hubConnected = true;
  if (currentIntervalMs !== NOW_PLAYING_POLL_FLOOR_MS) {
    scheduleInterval(NOW_PLAYING_POLL_FLOOR_MS);
  }
}

function checkHeartbeat(): void {
  if (!hubConnected) return;
  if (Date.now() - lastHubMessageAt > HUB_HEARTBEAT_STALE_MS) {
    // Hub claims connected but stopped talking — fetch is truth.
    switchToFastPoll();
  }
}

function applyHubEvent(env: ChannelEnvelope): void {
  lastHubMessageAt = Date.now();
  // `joined` is an ack per REALTIME.md — arrival tells us we're live, but the
  // payload is not track data. `heartbeat` similarly just refreshes liveness.
  if (env.type === 'joined' || env.type === 'heartbeat') return;
  // Everything else is a hint carrying a now-playing payload. Apply it
  // directly — the periodic floor fetch will correct any drift.
  if (isNowPlayingPayload(env.data)) {
    emit({ status: 'ready', data: env.data });
  }
}

const hubSubscriber: ChannelSubscriber = {
  onEvent(env) {
    applyHubEvent(env);
    // Any event proves the hub is delivering — slow the poll if we hadn't yet.
    if (!hubConnected) switchToFloorPoll();
  },
  onReconnected() {
    // Membership dies on reconnect (REALTIME.md) — the hub client has already
    // re-joined for us; we re-fetch to catch anything that happened offline.
    lastHubMessageAt = Date.now();
    switchToFloorPoll();
    load();
  },
  onStatusChange(connected) {
    if (connected) {
      lastHubMessageAt = Date.now();
      switchToFloorPoll();
      // Initial connect: re-fetch over HTTP as required by REALTIME.md.
      load();
    } else {
      switchToFastPoll();
    }
  },
};

function start(): void {
  // Render from HTTP first — the hub is an enhancement and MUST NOT delay first
  // paint (task 85).
  load();

  currentIntervalMs = NOW_PLAYING_POLL_INTERVAL_MS;
  intervalId = window.setInterval(onTick, NOW_PLAYING_POLL_INTERVAL_MS);
  document.addEventListener('visibilitychange', onVisibilityChange);

  hubConnected = false;
  lastHubMessageAt = 0;
  staleCheckId = window.setInterval(checkHeartbeat, STALE_CHECK_INTERVAL_MS);

  unsubHub = subscribeChannel(nowPlayingChannel(), hubSubscriber);
}

function stop(): void {
  if (intervalId != null) {
    window.clearInterval(intervalId);
    intervalId = null;
  }
  if (staleCheckId != null) {
    window.clearInterval(staleCheckId);
    staleCheckId = null;
  }
  document.removeEventListener('visibilitychange', onVisibilityChange);
  if (inFlight) {
    inFlight.abort();
    inFlight = null;
  }
  if (unsubHub) {
    unsubHub();
    unsubHub = null;
  }
  hubConnected = false;
  lastHubMessageAt = 0;
  currentIntervalMs = NOW_PLAYING_POLL_INTERVAL_MS;
}

function subscribe(listener: () => void): () => void {
  if (subscribers.size === 0) start();
  subscribers.add(listener);
  return () => {
    subscribers.delete(listener);
    if (subscribers.size === 0) stop();
  };
}

function getSnapshot(): NowPlayingState {
  return state;
}

/**
 * Subscribe to the shared now-playing state. Every mounted consumer sees the
 * same snapshot and re-renders together; the underlying HTTP fetch and the hub
 * subscription are each single, shared, and refcounted (§3.5, REALTIME.md).
 */
export function useNowPlaying(): NowPlayingState {
  return useSyncExternalStore(subscribe, getSnapshot);
}

/**
 * Test-only: tear down the poller/hub and reset to the initial state so module
 * state can't leak between test cases.
 */
export function __resetNowPlayingForTests(): void {
  stop();
  subscribers.clear();
  state = INITIAL;
}
