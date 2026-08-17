import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render } from '@testing-library/react';
import {
  HUB_HEARTBEAT_STALE_MS,
  NOW_PLAYING_CHANNEL,
  NOW_PLAYING_POLL_FLOOR_MS,
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

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('useNowPlaying — shared HTTP + hub store', () => {
  it('two mounted consumers share ONE fetch per poll tick', async () => {
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

    await act(async () => {
      await vi.advanceTimersByTimeAsync(NOW_PLAYING_POLL_INTERVAL_MS);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('stops polling and disconnects the hub when the last consumer unmounts', async () => {
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
    conn?.resolveStart();

    unmount();

    // With no subscribers the interval AND hub subscription are gone.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(NOW_PLAYING_POLL_INTERVAL_MS * 10);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('when the hub connects, JoinChannel fires and the poll slows to a 30s floor', async () => {
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

    // Hub becomes connected → onStatusChange(true) → floor cadence + re-fetch.
    await act(async () => {
      conn!.resolveStart();
      await flushMicroAndTimers();
    });
    expect(allJoinCalls()).toEqual([NOW_PLAYING_CHANNEL]);
    // Re-fetch on initial connect (REALTIME.md).
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // 5s ticks are gone — the floor is 30s. Advance ~29s: no fetch.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(NOW_PLAYING_POLL_FLOOR_MS - 1_000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // Cross the 30s floor: one more fetch.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('ChannelEvent payloads apply directly to state (events are hints, no fetch)', async () => {
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
        channel: NOW_PLAYING_CHANNEL,
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
        channel: NOW_PLAYING_CHANNEL,
        type: 'joined',
        data: { playing: true, track: { title: 'X', artists: [], album: '', art_url: null, url: '' } },
      });
      await flushMicroAndTimers();
    });

    // State is still the initial idle payload.
    const el = document.querySelector('[data-status]');
    expect(el?.getAttribute('data-status')).toBe('ready');
  });

  it('heartbeats keep the floor slow — no fallback while they arrive', async () => {
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
    // After connect: floor cadence, only two fetches so far (mount + connect).
    const baseline = fetchMock.mock.calls.length;

    // Emit a heartbeat every 10s for a full minute — never crossing the 45s
    // stale threshold, so the floor remains 30s (2 fetches in the minute).
    for (let i = 0; i < 6; i += 1) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10_000);
        conn.emit({ channel: NOW_PLAYING_CHANNEL, type: 'heartbeat' });
        await flushMicroAndTimers();
      });
    }
    // 60s / 30s floor = 2 floor-cadence fetches.
    expect(fetchMock.mock.calls.length - baseline).toBe(2);
  });

  it('missing heartbeats fall back to the 5s polling cadence', async () => {
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
    // every 5s and switches back to fast polling.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(HUB_HEARTBEAT_STALE_MS + 10_000);
    });

    // We should have accrued extra fetches at ~5s cadence — well above the 30s
    // floor would allow in the same span.
    const after = fetchMock.mock.calls.length - baseline;
    expect(after).toBeGreaterThan(2);
  });

  it('connect failure keeps the 5s HTTP polling and does not spam errors', async () => {
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
    expect(allJoinCalls()).toEqual([NOW_PLAYING_CHANNEL]);

    const beforeReconnect = fetchMock.mock.calls.length;

    // Reconnect — membership dies, so JoinChannel must re-fire and the store
    // must re-fetch state over HTTP.
    await act(async () => {
      conn.reconnect();
      await flushMicroAndTimers();
    });

    expect(allJoinCalls()).toEqual([
      NOW_PLAYING_CHANNEL,
      NOW_PLAYING_CHANNEL,
    ]);
    expect(fetchMock.mock.calls.length).toBeGreaterThan(beforeReconnect);
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
});
