import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render } from '@testing-library/react';
import {
  HUB_HEARTBEAT_STALE_MS,
  nowPlayingChannel,
  NOW_PLAYING_POLL_INTERVAL_MS,
  useNowPlaying,
  type NowPlayingState,
} from './useNowPlaying';
import {
  allJoinCalls,
  connectionsBuilt,
  currentFakeConnection,
} from '../test/hubDouble';
import type { NowPlayingResponse } from './api';

function jsonResponse(body: unknown) {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

/** A minimal consumer — the store, not the rendering, is under test here. */
function Probe({
  onState,
}: {
  onState?: (state: NowPlayingState) => void;
} = {}) {
  const state = useNowPlaying();
  onState?.(state);
  return <span data-status={state.status} />;
}

/**
 * Drain microtasks and any 0ms timers. `queueMicrotask` in the hub client's
 * subscribe path needs a real-timer beat before its callback runs even under
 * fake timers, so tests that just started the hub must yield explicitly.
 */
async function flushMicroAndTimers() {
  await Promise.resolve();
  await Promise.resolve();
  await vi.advanceTimersByTimeAsync(0);
}

/** Force `document.visibilityState`/`hidden` and fire the change event. */
function setVisibility(value: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', {
    value,
    configurable: true,
  });
  Object.defineProperty(document, 'hidden', {
    value: value === 'hidden',
    configurable: true,
  });
  document.dispatchEvent(new Event('visibilitychange'));
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  setVisibility('visible');
});

describe('useNowPlaying — shared HTTP + hub store', () => {
  it('two mounted consumers share ONE fetch on mount', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ playing: false }));
    vi.stubGlobal('fetch', fetchMock);

    render(
      <>
        <Probe />
        <Probe />
      </>,
    );

    await act(async () => {
      await flushMicroAndTimers();
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('stops the fallback poller and disconnects the hub when the last consumer unmounts', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ playing: false }));
    vi.stubGlobal('fetch', fetchMock);

    const { unmount } = render(<Probe />);

    await act(async () => {
      await flushMicroAndTimers();
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // One shared connection was built for the shared subscribe.
    expect(connectionsBuilt()).toBe(1);
    const conn = currentFakeConnection();
    // Force the hub into the fallback state so a polling interval IS running,
    // then confirm unmount tears everything down.
    conn?.rejectStart(new Error('down'));
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    await act(async () => {
      await flushMicroAndTimers();
    });
    const baseline = fetchMock.mock.calls.length;

    unmount();

    // With no subscribers the fallback interval AND hub subscription are gone.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(NOW_PLAYING_POLL_INTERVAL_MS * 10);
    });
    expect(fetchMock).toHaveBeenCalledTimes(baseline);
  });

  it('when the hub connects, JoinChannel fires and NO polling interval runs in steady state', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ playing: false }));
    vi.stubGlobal('fetch', fetchMock);

    render(<Probe />);

    await act(async () => {
      await flushMicroAndTimers();
    });
    // Initial HTTP fetch on mount — hub doesn't gate first paint.
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const conn = currentFakeConnection();
    expect(conn).not.toBeNull();

    // Hub becomes connected → onStatusChange(true) → re-fetch, no polling.
    await act(async () => {
      conn!.resolveStart();
      await flushMicroAndTimers();
    });
    expect(allJoinCalls()).toEqual([nowPlayingChannel()]);
    // Re-fetch on initial connect (REALTIME.md).
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // Zero fetches over the next several minutes — steady state is silent.
    // We keep emitting periodic heartbeats to prove the hub stays healthy.
    await act(async () => {
      for (let i = 0; i < 30; i += 1) {
        await vi.advanceTimersByTimeAsync(10_000);
        conn!.emit({ channel: nowPlayingChannel(), type: 'heartbeat' });
      }
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('hub events still update state live while no polling is happening', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ playing: false }));
    vi.stubGlobal('fetch', fetchMock);

    const seen: NowPlayingState[] = [];
    render(<Probe onState={(s) => seen.push(s)} />);

    await act(async () => {
      await flushMicroAndTimers();
    });
    const conn = currentFakeConnection()!;
    await act(async () => {
      conn.resolveStart();
      await flushMicroAndTimers();
    });

    const before = fetchMock.mock.calls.length;

    const nextTrack: NowPlayingResponse = {
      playing: true,
      track: {
        title: 'Windowlicker',
        artists: ['Aphex Twin'],
        album: 'Windowlicker',
        art_url: null,
        url: 'https://open.spotify.com/track/xyz',
      },
    };
    await act(async () => {
      conn.emit({
        channel: nowPlayingChannel(),
        type: 'track',
        data: nextTrack,
      });
      await flushMicroAndTimers();
    });

    // Event applied to state without an extra fetch.
    expect(fetchMock).toHaveBeenCalledTimes(before);
    const last = seen[seen.length - 1];
    expect(last.status).toBe('ready');
    if (last.status === 'ready' && last.data.playing) {
      expect(last.data.track.title).toBe('Windowlicker');
    }
  });

  it('the `joined` ack does not clobber state and is not treated as data', async () => {
    vi.useFakeTimers();
    const initial: NowPlayingResponse = { playing: false };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(initial));
    vi.stubGlobal('fetch', fetchMock);

    render(<Probe />);

    await act(async () => {
      await flushMicroAndTimers();
    });
    const conn = currentFakeConnection()!;
    await act(async () => {
      conn.resolveStart();
      await flushMicroAndTimers();
    });

    // A joined ack arrives — its payload MUST NOT be interpreted as track data.
    await act(async () => {
      conn.emit({
        channel: nowPlayingChannel(),
        type: 'joined',
        data: { playing: true, track: { title: 'X', artists: [], album: '', art_url: null, url: '' } },
      });
      await flushMicroAndTimers();
    });

    // State is still the initial idle payload.
    const el = document.querySelector('[data-status]');
    expect(el?.getAttribute('data-status')).toBe('ready');
  });

  it('missing heartbeats start the 5s fallback polling', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ playing: false }));
    vi.stubGlobal('fetch', fetchMock);

    render(<Probe />);

    await act(async () => {
      await flushMicroAndTimers();
    });
    const conn = currentFakeConnection()!;
    await act(async () => {
      conn.resolveStart();
      await flushMicroAndTimers();
    });
    const baseline = fetchMock.mock.calls.length;

    // No heartbeats for well past the stale threshold — the stale check runs
    // every 5s and switches on the fallback polling.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(HUB_HEARTBEAT_STALE_MS + 30_000);
    });

    // We should have accrued extra fetches at ~5s cadence.
    const after = fetchMock.mock.calls.length - baseline;
    expect(after).toBeGreaterThan(2);
  });

  it('hub recovery from staleness fires ONE resync fetch and stops the fallback polling', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ playing: false }));
    vi.stubGlobal('fetch', fetchMock);

    render(<Probe />);

    await act(async () => {
      await flushMicroAndTimers();
    });
    const conn = currentFakeConnection()!;
    await act(async () => {
      conn.resolveStart();
      await flushMicroAndTimers();
    });

    // Let the hub go stale — fallback polling kicks in.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(HUB_HEARTBEAT_STALE_MS + 10_000);
    });
    const beforeRecovery = fetchMock.mock.calls.length;

    // Hub starts talking again — recovery: one resync fetch, polling stops.
    await act(async () => {
      conn.emit({ channel: nowPlayingChannel(), type: 'heartbeat' });
      await flushMicroAndTimers();
    });
    const afterRecovery = fetchMock.mock.calls.length;
    expect(afterRecovery - beforeRecovery).toBe(1);

    // Now the polling interval should be gone — long fake-timer window
    // continues to see zero fetches.
    await act(async () => {
      for (let i = 0; i < 6; i += 1) {
        await vi.advanceTimersByTimeAsync(10_000);
        conn.emit({ channel: nowPlayingChannel(), type: 'heartbeat' });
      }
    });
    expect(fetchMock).toHaveBeenCalledTimes(afterRecovery);
  });

  it('connect failure starts the 5s HTTP polling and does not spam errors', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ playing: false }));
    vi.stubGlobal('fetch', fetchMock);
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    render(<Probe />);

    await act(async () => {
      await flushMicroAndTimers();
    });
    const conn = currentFakeConnection()!;

    await act(async () => {
      conn.rejectStart(new Error('CORS: origin not allowed'));
      await flushMicroAndTimers();
    });

    // No console.error spam from the fallback path — a single console.warn is
    // acceptable, but console.error should not fire.
    expect(errSpy).not.toHaveBeenCalled();

    const baseline = fetchMock.mock.calls.length;
    // A minute of the fast cadence gets us ~12 fetches, not ~2.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(fetchMock.mock.calls.length - baseline).toBeGreaterThan(6);
  });

  it('reconnects re-join the channel and immediately re-fetch over HTTP', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ playing: false }));
    vi.stubGlobal('fetch', fetchMock);

    render(<Probe />);

    await act(async () => {
      await flushMicroAndTimers();
    });
    const conn = currentFakeConnection()!;
    await act(async () => {
      conn.resolveStart();
      await flushMicroAndTimers();
    });
    expect(allJoinCalls()).toEqual([nowPlayingChannel()]);

    const beforeReconnect = fetchMock.mock.calls.length;

    // Reconnect — membership dies, so JoinChannel must re-fire and the store
    // must re-fetch state over HTTP.
    await act(async () => {
      conn.reconnect();
      await flushMicroAndTimers();
    });

    expect(allJoinCalls()).toEqual([
      nowPlayingChannel(),
      nowPlayingChannel(),
    ]);
    expect(fetchMock.mock.calls.length).toBeGreaterThan(beforeReconnect);

    // Post-reconnect the fallback polling is gone again — no extra fetches
    // over a long window while heartbeats keep the hub healthy.
    const afterReconnect = fetchMock.mock.calls.length;
    await act(async () => {
      for (let i = 0; i < 6; i += 1) {
        await vi.advanceTimersByTimeAsync(10_000);
        conn.emit({ channel: nowPlayingChannel(), type: 'heartbeat' });
      }
    });
    expect(fetchMock).toHaveBeenCalledTimes(afterReconnect);
  });

  it('visibility return to foreground triggers a single immediate resync fetch', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ playing: false }));
    vi.stubGlobal('fetch', fetchMock);

    render(<Probe />);

    await act(async () => {
      await flushMicroAndTimers();
    });
    const conn = currentFakeConnection()!;
    await act(async () => {
      conn.resolveStart();
      await flushMicroAndTimers();
    });
    const baseline = fetchMock.mock.calls.length;

    // Hide the tab, wait a while — no polling and no fetches.
    await act(async () => {
      setVisibility('hidden');
      for (let i = 0; i < 6; i += 1) {
        await vi.advanceTimersByTimeAsync(10_000);
        conn.emit({ channel: nowPlayingChannel(), type: 'heartbeat' });
      }
    });
    expect(fetchMock).toHaveBeenCalledTimes(baseline);

    // Coming back to the foreground triggers a single resync fetch.
    await act(async () => {
      setVisibility('visible');
      await flushMicroAndTimers();
    });
    expect(fetchMock).toHaveBeenCalledTimes(baseline + 1);
  });

  it('shares ONE connection across multiple consumers (refcounted)', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ playing: false }));
    vi.stubGlobal('fetch', fetchMock);

    const { unmount } = render(
      <>
        <Probe />
        <Probe />
      </>,
    );

    await act(async () => {
      await flushMicroAndTimers();
    });
    // Only one HubConnection built for the two consumers.
    expect(connectionsBuilt()).toBe(1);
    // Only one JoinChannel invocation — the channel is shared.
    const conn = currentFakeConnection()!;
    await act(async () => {
      conn.resolveStart();
      await flushMicroAndTimers();
    });
    expect(allJoinCalls().length).toBe(1);

    unmount();
    // No new connection after unmount.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    expect(connectionsBuilt()).toBe(1);
  });

  it('composes the channel name from VITE_HUB_CHANNEL_PREFIX (env-driven, not hardcoded)', async () => {
    // Non-default prefix — the dev API publishes on `portfolio-v6-api-dev:*`,
    // so the dev site MUST subscribe there or it will never see events (task 88).
    vi.stubEnv('VITE_HUB_CHANNEL_PREFIX', 'portfolio-v6-api-dev');
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ playing: false }));
    vi.stubGlobal('fetch', fetchMock);

    const seen: NowPlayingState[] = [];
    render(<Probe onState={(s) => seen.push(s)} />);

    await act(async () => {
      await flushMicroAndTimers();
    });
    const conn = currentFakeConnection()!;
    await act(async () => {
      conn.resolveStart();
      await flushMicroAndTimers();
    });

    // The channel name derived from the hook must reflect the stubbed prefix.
    expect(nowPlayingChannel()).toBe('portfolio-v6-api-dev:now-playing');
    // JoinChannel was invoked with the dev-prefixed channel, not the default.
    expect(allJoinCalls()).toEqual(['portfolio-v6-api-dev:now-playing']);

    // Envelopes on the configured channel reach the store.
    const nextTrack: NowPlayingResponse = {
      playing: true,
      track: {
        title: 'Non-default Prefix Track',
        artists: ['Ops'],
        album: 'Env',
        art_url: null,
        url: 'https://open.spotify.com/track/abc',
      },
    };
    await act(async () => {
      conn.emit({
        channel: 'portfolio-v6-api-dev:now-playing',
        type: 'track',
        data: nextTrack,
      });
      await flushMicroAndTimers();
    });
    const applied = seen[seen.length - 1];
    expect(applied.status).toBe('ready');
    if (applied.status === 'ready' && applied.data.playing) {
      expect(applied.data.track.title).toBe('Non-default Prefix Track');
    }

    // An envelope on the default (prod) prefix must NOT reach a dev subscriber.
    const rendersBefore = seen.length;
    await act(async () => {
      conn.emit({
        channel: 'portfolio-v6-api:now-playing',
        type: 'track',
        data: { playing: false } satisfies NowPlayingResponse,
      });
      await flushMicroAndTimers();
    });
    expect(seen.length).toBe(rendersBefore);
  });
});
