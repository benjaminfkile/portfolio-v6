import { useSyncExternalStore } from 'react';
import { getNowPlaying } from './api';
import type { NowPlayingResponse } from './api';
import {
  envelopeEvent,
  hubChannelPrefix,
  subscribeChannel,
  type ChannelEnvelope,
  type ChannelSubscriber,
} from './hubClient';

/**
 * Shared now-playing state — ONE module-level store consumed by every component
 * that renders the current track. Refcounted subscribers via
 * `useSyncExternalStore`: the fetch and hub subscription start with the first
 * mounted consumer and stop with the last, so a page without any now-playing UI
 * never connects.
 *
 * EVENT-DRIVEN ONLY (no polling). The now-playing feed is the dealer-listener
 * pushing over the realtime hub; the API persists the last event to the
 * database and serves it as the initial state. This store therefore:
 *   - fetches ONCE on mount to render the last-known track (durable, from the
 *     DB) before the socket is confirmed up,
 *   - fetches ONCE more whenever the hub connects or reconnects, to catch a
 *     track change that happened while we were offline,
 *   - applies every subsequent `ChannelEvent` payload directly.
 * There is NO recurring poll and NO heartbeat-staleness fallback. If the hub is
 * unavailable the page simply keeps showing the last-known track (or nothing,
 * if there is none); it never falls back to polling the HTTP endpoint.
 *
 * A failed initial fetch with no hub data degrades to `{ status: 'error' }`,
 * which consumers map to their own quiet fallback (render nothing / a dim
 * placeholder). Errors are logged, never thrown.
 */
export type NowPlayingState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; data: NowPlayingResponse };

/**
 * Channel name owned by the API for now-playing pushes. Composed from the
 * env-driven {@link hubChannelPrefix} at call time so the dev site subscribes
 * to `portfolio-v6-api-dev:now-playing` while prod stays on
 * `portfolio-v6-api:now-playing`. Read on each `start()` — never cached at
 * module load — so tests can override the prefix via `vi.stubEnv`.
 */
export function nowPlayingChannel(): string {
  return `${hubChannelPrefix()}:now-playing`;
}

const INITIAL: NowPlayingState = { status: 'loading' };

let state: NowPlayingState = INITIAL;
const subscribers = new Set<() => void>();
let inFlight: AbortController | null = null;
let unsubHub: (() => void) | null = null;

function emit(next: NowPlayingState): void {
  state = next;
  subscribers.forEach((listener) => listener());
}

/**
 * Fetch the last-known now-playing state once (the API serves the DB-persisted
 * last event). Concurrent callers collapse onto the in-flight request. A
 * failure only downgrades to `error` when we have nothing better already shown,
 * so a transient fetch blip never blanks a track the socket already delivered.
 */
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
      if (state.status !== 'ready') emit({ status: 'error' });
      console.error('Failed to load now-playing', error);
    });
}

function isNowPlayingPayload(x: unknown): x is NowPlayingResponse {
  if (!x || typeof x !== 'object') return false;
  return typeof (x as { playing?: unknown }).playing === 'boolean';
}

function applyHubEvent(env: ChannelEnvelope): void {
  // `joined` is a membership ack and `heartbeat` (if any) carries no track
  // data — neither changes what we render. The event name is on `event` (the
  // gateway) or `type` (legacy), so normalize before comparing.
  const name = envelopeEvent(env);
  if (name === 'joined' || name === 'heartbeat') return;
  if (isNowPlayingPayload(env.data)) {
    emit({ status: 'ready', data: env.data });
  }
}

const hubSubscriber: ChannelSubscriber = {
  onEvent(env) {
    applyHubEvent(env);
  },
  onReconnected() {
    // Membership dies on reconnect (the hub client re-joins for us); events
    // between disconnect and reconnect are lost, so grab one fresh payload.
    load();
  },
  onStatusChange(connected) {
    // On (re)connect, catch up with one fetch. On disconnect, do NOTHING —
    // event-driven only, no polling fallback; the last-known track stays put.
    if (connected) load();
  },
};

function start(): void {
  // Render the last-known track from HTTP first (one fetch); the socket is the
  // live source from there on. No polling interval is ever started.
  load();
  unsubHub = subscribeChannel(nowPlayingChannel(), hubSubscriber);
}

function stop(): void {
  if (inFlight) {
    inFlight.abort();
    inFlight = null;
  }
  if (unsubHub) {
    unsubHub();
    unsubHub = null;
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
 * same snapshot and re-renders together; the underlying HTTP fetch and the hub
 * subscription are each single, shared, and refcounted.
 */
export function useNowPlaying(): NowPlayingState {
  return useSyncExternalStore(subscribe, getSnapshot);
}

/**
 * Test-only: tear down the hub subscription and reset to the initial state so
 * module state can't leak between test cases.
 */
export function __resetNowPlayingForTests(): void {
  stop();
  subscribers.clear();
  state = INITIAL;
}
