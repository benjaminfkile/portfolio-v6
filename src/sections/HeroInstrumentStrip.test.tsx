import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import HeroInstrumentStrip from './HeroInstrumentStrip';
import type { DuolingoResponse, NowPlayingResponse } from '../lib/api';
import { NOW_PLAYING_POLL_INTERVAL_MS } from '../lib/useNowPlaying';

function jsonResponse(body: unknown, init: { ok?: boolean; status?: number } = {}) {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

/** A per-path fetch mock — the strip hits /api/now-playing and /api/duolingo. */
function stubStrip(opts: { now?: Response; duolingo?: Response } = {}) {
  const fetchMock = vi.fn((path: string) => {
    if (path.startsWith('/api/now-playing')) {
      return Promise.resolve(
        opts.now ?? jsonResponse({ playing: false } satisfies NowPlayingResponse),
      );
    }
    if (path.startsWith('/api/duolingo')) {
      return Promise.resolve(
        opts.duolingo ??
          jsonResponse({
            available: true,
            streak: 213,
            course: { title: 'Spanish', xp: 1000, crowns: 10 },
          } satisfies DuolingoResponse),
      );
    }
    throw new Error(`unexpected fetch: ${path}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('HeroInstrumentStrip (DESIGN.md §5)', () => {
  it('renders the SITE version from props (no fetch)', async () => {
    stubStrip();

    render(<HeroInstrumentStrip siteVersion={42} />);

    expect(screen.getByText('Site')).toBeInTheDocument();
    expect(screen.getByText('v42')).toBeInTheDocument();
  });

  it('omits the SITE readout when no version is provided', () => {
    stubStrip();

    render(<HeroInstrumentStrip />);

    expect(screen.queryByText('Site')).not.toBeInTheDocument();
  });

  it('shows the current track when something is playing', async () => {
    const now: NowPlayingResponse = {
      playing: true,
      track: {
        title: 'Windowlicker',
        artists: ['Aphex Twin'],
        album: 'Windowlicker',
        art_url: null,
        url: 'https://open.spotify.com/track/xyz',
      },
    };
    stubStrip({ now: jsonResponse(now) });

    render(<HeroInstrumentStrip siteVersion={1} />);

    expect(
      await screen.findByText('Windowlicker — Aphex Twin'),
    ).toBeInTheDocument();
  });

  it('reads "Not playing" when idle with no last-played track', async () => {
    stubStrip({ now: jsonResponse({ playing: false }) });

    render(<HeroInstrumentStrip siteVersion={1} />);

    expect(await screen.findByText('Not playing')).toBeInTheDocument();
  });

  it('falls back to the last-played track when idle (§4.6 fallback)', async () => {
    const now: NowPlayingResponse = {
      playing: false,
      last_played: {
        track: {
          title: 'Windowlicker',
          artists: ['Aphex Twin'],
          album: 'Windowlicker',
          art_url: null,
          url: 'https://open.spotify.com/track/xyz',
        },
        played_at: '2026-08-10T20:15:00.000Z',
      },
    };
    stubStrip({ now: jsonResponse(now) });

    render(<HeroInstrumentStrip siteVersion={1} />);

    expect(
      await screen.findByText('Last: Windowlicker — Aphex Twin'),
    ).toBeInTheDocument();
  });

  it('shows the Duolingo streak as a day count', async () => {
    stubStrip();

    render(<HeroInstrumentStrip siteVersion={1} />);

    expect(screen.getByText('Duolingo')).toBeInTheDocument();
    expect(await screen.findByText('213 days')).toBeInTheDocument();
  });

  it('degrades the Duolingo readout to a dim placeholder when unavailable', async () => {
    stubStrip({
      duolingo: jsonResponse({ available: false } satisfies DuolingoResponse),
    });

    render(<HeroInstrumentStrip siteVersion={1} />);

    await waitFor(() =>
      expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(1),
    );
  });

  it('updates the NOW PLAYING readout live when a later poll reports a new track', async () => {
    vi.useFakeTimers();
    // Mutable body: the shared store's next poll sees whatever is current.
    let now: NowPlayingResponse = { playing: false };
    const fetchMock = vi.fn((path: string) => {
      if (path.startsWith('/api/now-playing')) {
        return Promise.resolve(jsonResponse(now));
      }
      if (path.startsWith('/api/duolingo')) {
        return Promise.resolve(
          jsonResponse({
            available: true,
            streak: 213,
            course: { title: 'Spanish', xp: 1000, crowns: 10 },
          } satisfies DuolingoResponse),
        );
      }
      throw new Error(`unexpected fetch: ${path}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<HeroInstrumentStrip siteVersion={1} />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByText('Not playing')).toBeInTheDocument();

    now = {
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
      await vi.advanceTimersByTimeAsync(NOW_PLAYING_POLL_INTERVAL_MS);
    });
    expect(screen.getByText('Windowlicker — Aphex Twin')).toBeInTheDocument();
  });

  it('degrades each live instrument silently on fetch failure', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    stubStrip({
      now: jsonResponse({}, { ok: false, status: 500 }),
      duolingo: jsonResponse({}, { ok: false, status: 503 }),
    });

    render(<HeroInstrumentStrip siteVersion={7} />);

    // Both live readouts fall back to the dim placeholder, never an error.
    await waitFor(() =>
      expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(2),
    );
    // The static SITE readout is unaffected by the live failures.
    expect(screen.getByText('v7')).toBeInTheDocument();
  });
});
