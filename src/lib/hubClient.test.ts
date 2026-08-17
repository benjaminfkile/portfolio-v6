import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  subscribeChannel,
  type ChannelSubscriber,
} from './hubClient';
import {
  allJoinCalls,
  connectionsBuilt,
  currentFakeConnection,
} from '../test/hubDouble';

/**
 * Yield until any queued microtasks + 0ms timers have run. The client's
 * subscribe path uses `queueMicrotask` to fire `onStatusChange` — tests must
 * yield explicitly for that beat to run.
 */
async function flush(): Promise<void> {
  // Drain a generous stack of microtasks — `startConnection().then(joinAll(...
  // notifyStatus(...))` chains a few promise ticks before subscribers see
  // `onStatusChange(true)`.
  for (let i = 0; i < 8; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await Promise.resolve();
  }
}

function stubSubscriber(overrides: Partial<ChannelSubscriber> = {}): ChannelSubscriber {
  return {
    onEvent: vi.fn(),
    onReconnected: vi.fn(),
    onStatusChange: vi.fn(),
    ...overrides,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('hubClient', () => {
  it('starts a single connection for many subscribers and joins each channel once', async () => {
    const a = stubSubscriber();
    const b = stubSubscriber();

    subscribeChannel('portfolio-v6-api:now-playing', a);
    subscribeChannel('portfolio-v6-api:now-playing', b);

    expect(connectionsBuilt()).toBe(1);

    const conn = currentFakeConnection()!;
    conn.resolveStart();
    await flush();

    // Two subscribers, one channel → one JoinChannel invocation.
    expect(allJoinCalls()).toEqual(['portfolio-v6-api:now-playing']);
    expect(a.onStatusChange).toHaveBeenCalledWith(true);
    expect(b.onStatusChange).toHaveBeenCalledWith(true);
  });

  it('routes ChannelEvent envelopes to the matching channel only', async () => {
    const a = stubSubscriber();
    const b = stubSubscriber();
    subscribeChannel('portfolio-v6-api:now-playing', a);
    subscribeChannel('some-other-channel', b);

    const conn = currentFakeConnection()!;
    conn.resolveStart();
    await flush();

    conn.emit({
      channel: 'portfolio-v6-api:now-playing',
      type: 'heartbeat',
    });

    expect(a.onEvent).toHaveBeenCalledTimes(1);
    expect(b.onEvent).not.toHaveBeenCalled();
  });

  it('re-joins every active channel on reconnect and fires onReconnected per subscriber', async () => {
    const a = stubSubscriber();
    subscribeChannel('portfolio-v6-api:now-playing', a);
    const conn = currentFakeConnection()!;
    conn.resolveStart();
    await flush();

    expect(allJoinCalls().length).toBe(1);

    conn.reconnect();
    await flush();
    await flush();

    // Membership dies on reconnect → JoinChannel re-fires.
    expect(allJoinCalls()).toEqual([
      'portfolio-v6-api:now-playing',
      'portfolio-v6-api:now-playing',
    ]);
    expect(a.onReconnected).toHaveBeenCalledTimes(1);
  });

  it('start() rejection notifies subscribers as disconnected and does not retry', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const a = stubSubscriber();
    subscribeChannel('portfolio-v6-api:now-playing', a);
    const conn = currentFakeConnection()!;
    conn.rejectStart(new Error('nope'));
    await flush();

    expect(a.onStatusChange).toHaveBeenCalledWith(false);
    expect(errSpy).not.toHaveBeenCalled();

    // A subsequent subscribe should NOT try to build a new connection while
    // the previous run is marked unavailable — cheap failure, no retry loop.
    const b = stubSubscriber();
    subscribeChannel('portfolio-v6-api:now-playing', b);
    await flush();
    expect(connectionsBuilt()).toBe(1);
    expect(b.onStatusChange).toHaveBeenCalledWith(false);
  });

  it('tears down the connection when the last subscriber unsubscribes', async () => {
    const a = stubSubscriber();
    const unsub = subscribeChannel('portfolio-v6-api:now-playing', a);
    const conn = currentFakeConnection()!;
    conn.resolveStart();
    await flush();

    unsub();
    // A fresh subscribe after teardown builds a brand-new connection.
    subscribeChannel('portfolio-v6-api:now-playing', stubSubscriber());
    expect(connectionsBuilt()).toBe(2);
  });

  it('ignores envelopes that do not match the expected shape', async () => {
    const a = stubSubscriber();
    subscribeChannel('portfolio-v6-api:now-playing', a);
    const conn = currentFakeConnection()!;
    conn.resolveStart();
    await flush();

    conn.emit(null);
    conn.emit({ /* no channel */ type: 'x' });
    conn.emit({ channel: 42, type: 'x' });

    expect(a.onEvent).not.toHaveBeenCalled();
  });
});
