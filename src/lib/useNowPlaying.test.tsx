import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render } from '@testing-library/react';
import {
  nowPlayingChannel,
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

describe('useNowPlaying — event-driven store (no polling)', () => {
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

  it('disconnects the hub and issues no further fetches when the last consumer unmounts', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ playing: false }));
    vi.stubGlobal('fetch', fetchMock);

    const { unmount } = render(<Probe />);

    await act(async () => {
      await flushMicroAndTimers();
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(connectionsBuilt()).toBe(1);
    const baseline = fetchMock.mock.calls.length;

    unmount();

    // With no subscribers the hub subscription is gone and nothing fetches.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(baseline);
  });

  it('when the hub connects, JoinChannel fires and exactly one catch-up fetch runs — never a poll', async () => {
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

    // Hub becomes connected → onStatusChange(true) → one catch-up fetch.
    await act(async () => {
      conn!.resolveStart();
      await flushMicroAndTimers();
    });
    expect(allJoinCalls()).toEqual([nowPlayingChannel()]);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // Zero fetches over the next several minutes, with NO heartbeats at all —
    // the store must not poll to stay alive.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5 * 60_000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('hub events update state live', async () => {
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

  it('applies a real gateway envelope (event field, no type) — regression', async () => {
    // The gateway names the event field `event`, not `type`, and omits `type`
    // entirely. Requiring `type` silently dropped every snapshot; this locks
    // in that the real wire shape updates the UI.
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

    const track: NowPlayingResponse = {
      playing: true,
      track: {
        title: 'Gateway Shape',
        artists: ['G'],
        album: 'W',
        art_url: 'https://x/y',
        url: 'https://open.spotify.com/track/g',
      },
    };
    await act(async () => {
      // Note: `event`, not `type`, and no `type` field at all.
      conn.emit({ channel: nowPlayingChannel(), event: 'snapshot', data: track });
      await flushMicroAndTimers();
    });
    const last = seen[seen.length - 1];
    expect(last.status).toBe('ready');
    if (last.status === 'ready' && last.data.playing) {
      expect(last.data.track.title).toBe('Gateway Shape');
    }

    // A `joined` ack on the `event` field must still be ignored.
    const before = seen.length;
    await act(async () => {
      conn.emit({
        channel: nowPlayingChannel(),
        event: 'joined',
        data: { channel: nowPlayingChannel() },
      });
      await flushMicroAndTimers();
    });
    // No new "ready" with different data — the ack didn't clobber the track.
    const after = seen[seen.length - 1];
    expect(after.status).toBe('ready');
    if (after.status === 'ready' && after.data.playing) {
      expect(after.data.track.title).toBe('Gateway Shape');
    }
    expect(seen.length).toBeGreaterThanOrEqual(before);
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

    const el = document.querySelector('[data-status]');
    expect(el?.getAttribute('data-status')).toBe('ready');
  });

  it('a hub connect FAILURE never starts polling and does not spam errors', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ playing: false }));
    vi.stubGlobal('fetch', fetchMock);
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    render(<Probe />);

    await act(async () => {
      await flushMicroAndTimers();
    });
    // One fetch on mount (the durable last-known).
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const conn = currentFakeConnection()!;

    await act(async () => {
      conn.rejectStart(new Error('CORS: origin not allowed'));
      await flushMicroAndTimers();
    });

    // The failed initial fetch shape logs nothing here (fetch succeeded); the
    // hub-down path must not spam console.error either.
    expect(errSpy).not.toHaveBeenCalled();

    const baseline = fetchMock.mock.calls.length;
    // A full minute passes with the hub down — ZERO extra fetches: no polling.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(baseline);
  });

  it('a hub disconnect keeps the last-known track and does not start polling', async () => {
    vi.useFakeTimers();
    const idle: NowPlayingResponse = { playing: false };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(idle));
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

    // A live track arrives over the socket.
    const track: NowPlayingResponse = {
      playing: true,
      track: {
        title: 'Only Live Source',
        artists: ['X'],
        album: 'Y',
        art_url: null,
        url: 'https://open.spotify.com/track/z',
      },
    };
    await act(async () => {
      conn.emit({ channel: nowPlayingChannel(), type: 'track', data: track });
      await flushMicroAndTimers();
    });

    // Hub drops hard. No polling starts; the last-known track stays on screen.
    await act(async () => {
      conn.close(new Error('dropped'));
      await flushMicroAndTimers();
    });
    const baseline = fetchMock.mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(baseline);
    const last = seen[seen.length - 1];
    expect(last.status).toBe('ready');
    if (last.status === 'ready' && last.data.playing) {
      expect(last.data.track.title).toBe('Only Live Source');
    }
  });

  it('reconnects re-join the channel and immediately re-fetch once — no polling', async () => {
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
    // must re-fetch state over HTTP exactly once.
    await act(async () => {
      conn.reconnect();
      await flushMicroAndTimers();
    });

    expect(allJoinCalls()).toEqual([
      nowPlayingChannel(),
      nowPlayingChannel(),
    ]);
    expect(fetchMock.mock.calls.length).toBeGreaterThan(beforeReconnect);

    // No polling afterward — a long window with no heartbeats stays silent.
    const afterReconnect = fetchMock.mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5 * 60_000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(afterReconnect);
  });

  it('visibility changes do NOT trigger any fetch (pure event-driven)', async () => {
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

    // Hide then re-show the tab — neither edge fetches; only socket events do.
    await act(async () => {
      setVisibility('hidden');
      await flushMicroAndTimers();
      setVisibility('visible');
      await flushMicroAndTimers();
    });
    expect(fetchMock).toHaveBeenCalledTimes(baseline);
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
    expect(connectionsBuilt()).toBe(1);
    const conn = currentFakeConnection()!;
    await act(async () => {
      conn.resolveStart();
      await flushMicroAndTimers();
    });
    expect(allJoinCalls().length).toBe(1);

    unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    expect(connectionsBuilt()).toBe(1);
  });

  it('composes the channel name from VITE_HUB_CHANNEL_PREFIX (env-driven, not hardcoded)', async () => {
    // Non-default prefix — the dev API publishes on `portfolio-v6-api-dev:*`,
    // so the dev site MUST subscribe there or it will never see events.
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

    expect(nowPlayingChannel()).toBe('portfolio-v6-api-dev:now-playing');
    expect(allJoinCalls()).toEqual(['portfolio-v6-api-dev:now-playing']);

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
