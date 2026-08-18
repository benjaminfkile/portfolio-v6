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
 * Shared now-playing state (spec §3.5, §4.6; REALTIME.md; tasks 85, 91) — ONE
 * module-level store consumed by every component that renders the current
 * track. Refcounted subscribers via `useSyncExternalStore`: the underlying
 * fetch and hub subscription start with the first mounted consumer and stop
 * with the last, so a page without any now-playing UI never polls or connects.
 *
 * Realtime path (REALTIME.md): the store joins the app-wide SignalR hub on the
 * `<prefix>:now-playing` channel (see {@link hubChannelPrefix}) and applies
 * `ChannelEvent` payloads directly.
 *
 * HTTP is strictly a fallback (task 91):
 *   - On subscribe: one fetch to render before the hub is confirmed up.
 *   - On hub connect and every reconnect: one fetch to catch anything that
 *     changed while we were offline.
 *   - On visibilitychange back to foreground: one fetch (a hidden tab receives
 *     no events reliably, so this is a cheap resync).
 *   - When the hub is unavailable, disconnected, or heartbeats go stale: start
 *     the 5s polling interval. When the hub recovers, refetch once and stop
 *     the interval again.
 * In steady state with a healthy hub, there is ZERO recurring HTTP traffic —
 * the visible product is one fetch on load, then a live websocket.
 *
 * The store is deliberately plain module state + `useSyncExternalStore` — no
 * context provider, no state-management dependency (DESIGN.md §8 spirit: the
 * smallest thing that works). Both the fallback poller AND the hub subscription
 * are refcounted: they start when the first subscriber mounts and stop when the
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
 * HTTP fallback cadence — only used when the hub is unavailable, disconnected,
 * or stale. Matches the API's server-side now-playing cache TTL (§4.6), so a
 * faster poll would just re-read the cached payload without seeing anything new.
 */
export const NOW_PLAYING_POLL_INTERVAL_MS = 5_000;

/**
 * If no ChannelEvent (heartbeat or otherwise) arrives for this long while the
 * hub claims to be connected, treat the hub as sick and drop back to the HTTP
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
let inFlight: AbortController | null = null;

/** Hub state — driven by callbacks from {@link ../lib/hubClient}. */
let hubHealthy = false;
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

function startPolling(): void {
  if (intervalId != null) return;
  intervalId = window.setInterval(onTick, NOW_PLAYING_POLL_INTERVAL_MS);
}

function stopPolling(): void {
  if (intervalId == null) return;
  window.clearInterval(intervalId);
  intervalId = null;
}

function isNowPlayingPayload(x: unknown): x is NowPlayingResponse {
  if (!x || typeof x !== 'object') return false;
  return typeof (x as { playing?: unknown }).playing === 'boolean';
}

function checkHeartbeat(): void {
  if (!hubHealthy) return;
  if (Date.now() - lastHubMessageAt > HUB_HEARTBEAT_STALE_MS) {
    // Hub claims connected but stopped talking — fetch is truth.
    hubHealthy = false;
    startPolling();
  }
}

function applyHubEvent(env: ChannelEnvelope): void {
  lastHubMessageAt = Date.now();
  // `joined` is an ack per REALTIME.md — arrival tells us we're live, but the
  // payload is not track data. `heartbeat` similarly just refreshes liveness.
  if (env.type === 'joined' || env.type === 'heartbeat') return;
  // Everything else is a hint carrying a now-playing payload. Apply it
  // directly — the HTTP path stays the source of truth and refreshes on
  // reconnect / visibility / recovery, so drift can't accumulate.
  if (isNowPlayingPayload(env.data)) {
    emit({ status: 'ready', data: env.data });
  }
}

const hubSubscriber: ChannelSubscriber = {
  onEvent(env) {
    const wasFallback = !hubHealthy;
    applyHubEvent(env);
    hubHealthy = true;
    if (wasFallback) {
      // Recovery: hub is talking again after being unavailable/stale. Grab
      // one fresh HTTP payload (offline events are lost by design) and stop
      // the fallback interval.
      stopPolling();
      load();
    }
  },
  onReconnected() {
    // Membership dies on reconnect (REALTIME.md) — the hub client has already
    // re-joined for us; we re-fetch to catch anything that happened offline
    // and drop the fallback interval that the transient disconnect started.
    lastHubMessageAt = Date.now();
    hubHealthy = true;
    stopPolling();
    load();
  },
  onStatusChange(connected) {
    if (connected) {
      lastHubMessageAt = Date.now();
      hubHealthy = true;
      // Initial connect: re-fetch over HTTP as required by REALTIME.md and
      // stop any fallback interval that ran while we were connecting.
      stopPolling();
      load();
    } else {
      hubHealthy = false;
      startPolling();
    }
  },
};

function start(): void {
  // Render from HTTP first — the hub is an enhancement and MUST NOT delay first
  // paint (task 85). No polling interval yet: it starts only when the hub is
  // proven unhealthy (task 91).
  load();

  document.addEventListener('visibilitychange', onVisibilityChange);

  hubHealthy = false;
  lastHubMessageAt = 0;
  staleCheckId = window.setInterval(checkHeartbeat, STALE_CHECK_INTERVAL_MS);

  unsubHub = subscribeChannel(nowPlayingChannel(), hubSubscriber);
}

function stop(): void {
  stopPolling();
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
  hubHealthy = false;
  lastHubMessageAt = 0;
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
