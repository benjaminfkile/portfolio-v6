/*
 * Small SignalR hub client for the app-wide realtime channel (REALTIME.md,
 * task 85). ONE `HubConnection` for the whole app — WebSockets-only with
 * `skipNegotiation: true`, one `ChannelEvent` client method, refcounted per
 * channel so it connects when the first consumer subscribes and disconnects
 * when the last one unmounts.
 *
 * The rules that shape this file, straight from REALTIME.md:
 *   - WebSockets-only, `skipNegotiation: true` (no long-poll fallback).
 *   - The server pushes ONE client method: `ChannelEvent(envelope)`. The
 *     envelope carries the channel, event type, and payload — we route to
 *     subscribers by channel and let the consumer switch on `type`.
 *   - Membership dies on reconnect. When SignalR reconnects we MUST re-join
 *     every active channel, and each consumer MUST re-fetch — otherwise the
 *     UI silently misses whatever changed while we were offline.
 *   - Events are hints; fetch is truth. This module does not fetch — the
 *     consumer's own HTTP path stays the source of truth.
 *   - The `joined` envelope is an ack, not data. Consumers should ignore its
 *     payload (they may use its arrival as a "hub is live" indicator).
 *
 * The hub URL is `<VITE_HUB_BASE_URL || VITE_API_BASE_URL>/hub`. In deployed
 * environments the hub and API share an origin, so the API base is a sensible
 * fallback; setting `VITE_HUB_BASE_URL` explicitly lets ops move the hub off
 * later without churning `VITE_API_BASE_URL`.
 *
 * Channel names carry a per-environment prefix (the API's manifest service
 * name — `portfolio-v6-api` in prod, `portfolio-v6-api-dev` in dev). Consumers
 * compose their channel string from {@link hubChannelPrefix} rather than
 * hardcoding — otherwise the dev site would subscribe to channels the dev API
 * can never publish on. See {@link hubChannelPrefix} for the env override.
 */

import {
  HubConnection,
  HubConnectionBuilder,
  HubConnectionState,
  HttpTransportType,
} from '@microsoft/signalr';

/** ChannelEvent envelope shape (REALTIME.md). `data` is opaque to this layer. */
export interface ChannelEnvelope {
  channel: string;
  /** e.g. `"joined"`, `"heartbeat"`, or a channel-specific event name. */
  type: string;
  /** ISO-8601 timestamp emitted by the server; optional. */
  ts?: string;
  /** Payload for typed events; absent on `joined`/`heartbeat`. */
  data?: unknown;
}

/**
 * Callbacks the hub client will invoke for a subscribed channel. The consumer
 * handles the semantics — this module just delivers envelopes and lifecycle
 * ticks. Each method is called on the current tick, never re-entrantly.
 */
export interface ChannelSubscriber {
  /** Any envelope for this channel — `joined`/`heartbeat` included. */
  onEvent(envelope: ChannelEnvelope): void;
  /**
   * Fired after SignalR reconnects (membership was dropped) once the channel
   * has been re-joined. Consumers MUST re-fetch their HTTP source of truth
   * here — hub events between disconnect and reconnect are lost by design.
   */
  onReconnected(): void;
  /**
   * Hub connect/disconnect edges: `true` when the hub is up and the channel
   * has been joined; `false` when the hub is down or the connection failed.
   * A synchronous initial call is delivered on subscribe with the current state.
   */
  onStatusChange(connected: boolean): void;
}

const HUB_BASE_URL = (
  import.meta.env.VITE_HUB_BASE_URL ??
  import.meta.env.VITE_API_BASE_URL ??
  ''
).replace(/\/$/, '');

const HUB_PATH = '/hub';

/**
 * Default channel prefix — the API's prod manifest service name. Kept exported
 * so tests and consumers can reference it without duplicating the literal.
 */
export const DEFAULT_HUB_CHANNEL_PREFIX = 'portfolio-v6-api';

/**
 * The realtime channel namespace this build subscribes under. Read from
 * `VITE_HUB_CHANNEL_PREFIX` at call time so tests can stub it via `vi.stubEnv`;
 * defaults to {@link DEFAULT_HUB_CHANNEL_PREFIX} so prod needs no new config.
 *
 * Consumers MUST compose their channel string from this — a literal prefix
 * would join a channel the dev API cannot publish on.
 */
export function hubChannelPrefix(): string {
  return import.meta.env.VITE_HUB_CHANNEL_PREFIX || DEFAULT_HUB_CHANNEL_PREFIX;
}

/** Test seam — the tests replace this with a controllable double. */
export type HubConnectionFactory = () => HubConnection;

function defaultFactory(): HubConnection {
  return new HubConnectionBuilder()
    .withUrl(`${HUB_BASE_URL}${HUB_PATH}`, {
      transport: HttpTransportType.WebSockets,
      skipNegotiation: true,
    })
    .withAutomaticReconnect()
    .build();
}

let factory: HubConnectionFactory = defaultFactory;

/** Test-only: swap in a stub connection factory. */
export function __setHubConnectionFactoryForTests(f: HubConnectionFactory | null): void {
  factory = f ?? defaultFactory;
}

const subs = new Map<string, Set<ChannelSubscriber>>();
let connection: HubConnection | null = null;
let starting: Promise<void> | null = null;
/**
 * `true` after a start() rejection — subsequent subscribers get a synthetic
 * `onStatusChange(false)` instead of re-attempting a doomed connect. Cleared
 * only when every subscriber has unmounted, so the next mount (potentially
 * long after the hub came back) gets a fresh attempt.
 */
let unavailable = false;

function forEachSubscriber(fn: (sub: ChannelSubscriber, channel: string) => void): void {
  subs.forEach((set, channel) => {
    set.forEach((sub) => fn(sub, channel));
  });
}

function notifyStatus(connected: boolean): void {
  forEachSubscriber((sub) => sub.onStatusChange(connected));
}

async function joinAllChannels(): Promise<void> {
  const c = connection;
  if (!c || c.state !== HubConnectionState.Connected) return;
  const channels = Array.from(subs.keys());
  await Promise.all(
    channels.map((channel) =>
      c.invoke('JoinChannel', channel).catch((err: unknown) => {
        console.error('JoinChannel failed', channel, err);
      }),
    ),
  );
}

function bindConnection(c: HubConnection): void {
  // Single client method per REALTIME.md — route by envelope.channel.
  c.on('ChannelEvent', (env: unknown) => {
    if (!env || typeof env !== 'object') return;
    const envelope = env as ChannelEnvelope;
    if (typeof envelope.channel !== 'string' || typeof envelope.type !== 'string') {
      return;
    }
    const set = subs.get(envelope.channel);
    if (!set) return;
    set.forEach((sub) => sub.onEvent(envelope));
  });

  c.onreconnecting(() => {
    notifyStatus(false);
  });

  c.onreconnected(() => {
    // Membership dies on reconnect — re-join every active channel and fire the
    // per-subscriber reconnect callback so consumers can re-fetch.
    joinAllChannels().finally(() => {
      forEachSubscriber((sub) => sub.onReconnected());
      notifyStatus(true);
    });
  });

  c.onclose(() => {
    notifyStatus(false);
    // A hard close without a successful reconnect means we're back to square
    // one. Drop the connection reference so the next subscriber tries afresh.
    connection = null;
  });
}

function startConnection(): Promise<void> {
  if (starting) return starting;
  const c = factory();
  connection = c;
  bindConnection(c);
  starting = c.start().then(
    async () => {
      starting = null;
      await joinAllChannels();
      notifyStatus(true);
    },
    (err: unknown) => {
      starting = null;
      unavailable = true;
      connection = null;
      // Not error-level — an unreachable hub degrades to HTTP polling, which
      // is a supported mode, not a crash. Log once so the fallback isn't silent.
      console.warn('Now-playing hub unavailable — HTTP polling fallback', err);
      notifyStatus(false);
      try {
        void c.stop();
      } catch {
        /* stop-on-failed-start may throw; safe to ignore */
      }
      throw err;
    },
  );
  return starting;
}

function stopConnection(): void {
  const c = connection;
  connection = null;
  starting = null;
  unavailable = false;
  if (!c) return;
  try {
    void c.stop();
  } catch {
    /* stop errors are benign during teardown */
  }
}

/**
 * Subscribe to a channel. Returns an unsubscribe function; when the last
 * subscriber for the last channel unsubscribes, the connection is stopped.
 *
 * The subscriber's `onStatusChange` is guaranteed to fire at least once — on
 * subscribe with the current state, or when the pending start settles.
 */
export function subscribeChannel(
  channel: string,
  sub: ChannelSubscriber,
): () => void {
  let set = subs.get(channel);
  const isNewChannel = !set;
  if (!set) {
    set = new Set();
    subs.set(channel, set);
  }
  set.add(sub);

  if (unavailable) {
    // A prior connect failed — don't retry, just report degraded state.
    queueMicrotask(() => {
      if (subs.get(channel)?.has(sub)) sub.onStatusChange(false);
    });
  } else if (connection && connection.state === HubConnectionState.Connected) {
    // Already up. Join the channel if it's new, then tell the subscriber.
    if (isNewChannel) {
      connection.invoke('JoinChannel', channel).catch((err: unknown) => {
        console.error('JoinChannel failed', channel, err);
      });
    }
    queueMicrotask(() => {
      if (subs.get(channel)?.has(sub)) sub.onStatusChange(true);
    });
  } else {
    // No connection yet — kick one off. The subscriber will be notified when
    // start() resolves (via notifyStatus) or rejects (via the catch above).
    void startConnection().catch(() => {
      /* already logged and notified */
    });
  }

  return () => {
    const s = subs.get(channel);
    if (!s) return;
    s.delete(sub);
    if (s.size === 0) {
      subs.delete(channel);
      if (subs.size === 0) {
        stopConnection();
      }
    }
  };
}

/**
 * Test-only: tear down all state so module-level state can't leak between
 * tests. Mirrors {@link __resetNowPlayingForTests}.
 */
export function __resetHubClientForTests(): void {
  subs.clear();
  stopConnection();
}
