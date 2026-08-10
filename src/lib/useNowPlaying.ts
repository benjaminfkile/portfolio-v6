import { useSyncExternalStore } from 'react';
import { getNowPlaying } from './api';
import type { NowPlayingResponse } from './api';

/**
 * Shared now-playing state (spec §3.5, §4.6) — ONE module-level store polling
 * `GET /api/now-playing`, consumed by every component that renders the current
 * track (`NowPlayingSection`, `HeroInstrumentStrip`). Before this existed each
 * consumer fetched privately: the section polled while the hero strip fetched
 * once and went stale on track changes, and a page showing both paid for two
 * identical requests.
 *
 * The store is deliberately plain module state + `useSyncExternalStore` — no
 * context provider, no state-management dependency (DESIGN.md §8 spirit: the
 * smallest thing that works). The poller is refcounted: it starts when the
 * first subscriber mounts and stops when the last unmounts, so a page with no
 * now-playing UI never polls at all.
 *
 * Live-section rules carry over from the section's original implementation:
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
 * Poll cadence, matching the API's server-side now-playing cache TTL (§4.6,
 * lowered from ~30s to 5s on 2026-08-10 so track changes surface quickly).
 * Polling faster than the server cache would just re-read the cached payload.
 */
export const NOW_PLAYING_POLL_INTERVAL_MS = 5_000;

const INITIAL: NowPlayingState = { status: 'loading' };

let state: NowPlayingState = INITIAL;
const subscribers = new Set<() => void>();
let intervalId: number | null = null;
let inFlight: AbortController | null = null;

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

function start(): void {
  load();
  intervalId = window.setInterval(onTick, NOW_PLAYING_POLL_INTERVAL_MS);
  document.addEventListener('visibilitychange', onVisibilityChange);
}

function stop(): void {
  if (intervalId != null) {
    window.clearInterval(intervalId);
    intervalId = null;
  }
  document.removeEventListener('visibilitychange', onVisibilityChange);
  if (inFlight) {
    inFlight.abort();
    inFlight = null;
  }
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
 * same snapshot and re-renders together on each poll; the fetch itself happens
 * exactly once per tick regardless of how many consumers are mounted.
 */
export function useNowPlaying(): NowPlayingState {
  return useSyncExternalStore(subscribe, getSnapshot);
}

/**
 * Test-only: tear down the poller and reset to the initial state so module
 * state can't leak between test cases.
 */
export function __resetNowPlayingForTests(): void {
  stop();
  subscribers.clear();
  state = INITIAL;
}
