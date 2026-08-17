/*
 * Controllable SignalR hub double for tests. Installs into `hubClient.ts` via
 * its `__setHubConnectionFactoryForTests` seam, so the real `@microsoft/signalr`
 * transport is never used in unit tests.
 *
 * Default behavior: `start()` returns a promise that never resolves — so any
 * test that doesn't care about the hub simply exercises the HTTP fallback
 * path. Tests that DO care about the hub call `hubDouble.control()` and drive
 * `.resolveStart()`, `.emit(...)`, `.reconnect()`, etc. explicitly.
 */

import {
  HubConnection,
  HubConnectionState,
} from '@microsoft/signalr';
import {
  __resetHubClientForTests,
  __setHubConnectionFactoryForTests,
} from '../lib/hubClient';

interface Handlers {
  channelEvent: ((env: unknown) => void) | null;
  onReconnected: Array<(connectionId?: string) => void>;
  onReconnecting: Array<(err?: Error) => void>;
  onClose: Array<(err?: Error) => void>;
}

export interface FakeHubControl {
  /** The most-recent connection returned to the client (or null if none yet). */
  current(): FakeConnection | null;
  /** Number of connections ever built (start counts). */
  buildCount(): number;
  /** Every JoinChannel invocation observed, in order. */
  joinCalls(): string[];
}

class FakeConnection {
  state: HubConnectionState = HubConnectionState.Disconnected;
  private handlers: Handlers = {
    channelEvent: null,
    onReconnected: [],
    onReconnecting: [],
    onClose: [],
  };
  private startResolver: {
    resolve: () => void;
    reject: (err: unknown) => void;
  } | null = null;
  private startPromise: Promise<void> | null = null;
  readonly joinCalls: string[] = [];
  private hub: FakeHubState;

  constructor(hub: FakeHubState) {
    this.hub = hub;
  }

  on(method: string, cb: (...args: unknown[]) => void): void {
    if (method === 'ChannelEvent') {
      this.handlers.channelEvent = cb as (env: unknown) => void;
    }
  }

  onreconnected(cb: (connectionId?: string) => void): void {
    this.handlers.onReconnected.push(cb);
  }
  onreconnecting(cb: (err?: Error) => void): void {
    this.handlers.onReconnecting.push(cb);
  }
  onclose(cb: (err?: Error) => void): void {
    this.handlers.onClose.push(cb);
  }

  start(): Promise<void> {
    if (this.startPromise) return this.startPromise;
    this.state = HubConnectionState.Connecting;
    this.startPromise = new Promise<void>((resolve, reject) => {
      this.startResolver = { resolve, reject };
    });
    // Autoresolve mode: for tests that don't want to manage this manually.
    if (this.hub.autoResolveStart) {
      Promise.resolve().then(() => this.resolveStart());
    }
    return this.startPromise;
  }

  async stop(): Promise<void> {
    this.state = HubConnectionState.Disconnected;
    this.startResolver = null;
    this.handlers.onClose.forEach((cb) => cb());
  }

  invoke(method: string, ...args: unknown[]): Promise<unknown> {
    if (method === 'JoinChannel') {
      this.joinCalls.push(args[0] as string);
      this.hub.allJoinCalls.push(args[0] as string);
    }
    return Promise.resolve();
  }

  /* --- test control surface -------------------------------------------- */

  resolveStart(): void {
    if (!this.startResolver) return;
    this.state = HubConnectionState.Connected;
    this.startResolver.resolve();
    this.startResolver = null;
  }

  rejectStart(err: unknown = new Error('connect failed')): void {
    if (!this.startResolver) return;
    this.state = HubConnectionState.Disconnected;
    this.startResolver.reject(err);
    this.startResolver = null;
  }

  emit(envelope: unknown): void {
    this.handlers.channelEvent?.(envelope);
  }

  /** Simulate an automatic-reconnect round-trip. */
  reconnect(): void {
    this.state = HubConnectionState.Reconnecting;
    this.handlers.onReconnecting.forEach((cb) => cb());
    this.state = HubConnectionState.Connected;
    this.handlers.onReconnected.forEach((cb) => cb('conn-id'));
  }

  /** Simulate a hard close (no reconnect). */
  close(err?: Error): void {
    this.state = HubConnectionState.Disconnected;
    this.handlers.onClose.forEach((cb) => cb(err));
  }
}

interface FakeHubState {
  autoResolveStart: boolean;
  connections: FakeConnection[];
  allJoinCalls: string[];
}

let hubState: FakeHubState = {
  autoResolveStart: false,
  connections: [],
  allJoinCalls: [],
};

export function __installFakeHubForTests(): void {
  __setHubConnectionFactoryForTests(() => {
    const conn = new FakeConnection(hubState);
    hubState.connections.push(conn);
    return conn as unknown as HubConnection;
  });
}

export function __resetHubDoubleForTests(): void {
  __resetHubClientForTests();
  hubState = {
    autoResolveStart: false,
    connections: [],
    allJoinCalls: [],
  };
}

/**
 * Test helper: return the most-recently-built {@link FakeConnection}. Tests
 * poll for this (it may not exist synchronously) after triggering a subscribe.
 */
export function currentFakeConnection(): FakeConnection | null {
  return hubState.connections[hubState.connections.length - 1] ?? null;
}

/** Every JoinChannel invocation across every connection built so far. */
export function allJoinCalls(): string[] {
  return hubState.allJoinCalls.slice();
}

/** Number of connections built (each `subscribeChannel` from cold makes one). */
export function connectionsBuilt(): number {
  return hubState.connections.length;
}

/** Enable auto-resolving start() — useful for tests that just want it "up". */
export function autoResolveStart(enabled: boolean): void {
  hubState.autoResolveStart = enabled;
}

export type { FakeConnection };
