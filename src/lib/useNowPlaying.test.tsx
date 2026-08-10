import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render } from '@testing-library/react';
import { NOW_PLAYING_POLL_INTERVAL_MS, useNowPlaying } from './useNowPlaying';

function jsonResponse(body: unknown) {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

/** A minimal consumer — the store, not the rendering, is under test here. */
function Probe() {
  const state = useNowPlaying();
  return <span data-status={state.status} />;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('useNowPlaying shared store', () => {
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

    // Both consumers mounted → exactly one initial fetch.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // One tick → one more fetch, still shared.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(NOW_PLAYING_POLL_INTERVAL_MS);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('stops polling when the last consumer unmounts', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ playing: false }));
    vi.stubGlobal('fetch', fetchMock);

    const { unmount } = render(<Probe />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    unmount();

    // With no subscribers the interval is gone — time passing fetches nothing.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(NOW_PLAYING_POLL_INTERVAL_MS * 10);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
