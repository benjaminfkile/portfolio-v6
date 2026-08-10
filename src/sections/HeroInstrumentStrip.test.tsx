import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import HeroInstrumentStrip from './HeroInstrumentStrip';
import type { NowPlayingResponse, StatusResponse } from '../lib/api';
import { NOW_PLAYING_POLL_INTERVAL_MS } from '../lib/useNowPlaying';

function jsonResponse(body: unknown, init: { ok?: boolean; status?: number } = {}) {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

/** A per-path fetch mock — the strip hits /api/now-playing and /api/status. */
function stubStrip(opts: { now?: Response; status?: Response } = {}) {
  const fetchMock = vi.fn((path: string) => {
    if (path.startsWith('/api/now-playing')) {
      return Promise.resolve(
        opts.now ?? jsonResponse({ playing: false } satisfies NowPlayingResponse),
      );
    }
    if (path.startsWith('/api/status')) {
      return Promise.resolve(
        opts.status ??
          jsonResponse({ degraded: false, services: [] } satisfies StatusResponse),
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

  it('reads "Not playing" when the endpoint reports idle', async () => {
    stubStrip({ now: jsonResponse({ playing: false }) });

    render(<HeroInstrumentStrip siteVersion={1} />);

    expect(await screen.findByText('Not playing')).toBeInTheDocument();
  });

  it('reports the API as operational, with a text label beside the dot (§7)', async () => {
    const status: StatusResponse = {
      degraded: false,
      services: [{ name: 'Gateway', ok: true }],
    };
    stubStrip({ status: jsonResponse(status) });

    render(<HeroInstrumentStrip siteVersion={1} />);

    // Colour is never the only carrier — "Operational" text sits by the dot.
    expect(await screen.findByText('Operational')).toBeInTheDocument();
  });

  it('shows an honest degraded API state', async () => {
    const status: StatusResponse = {
      degraded: true,
      services: [{ name: 'API', ok: false }],
    };
    stubStrip({ status: jsonResponse(status) });

    render(<HeroInstrumentStrip siteVersion={1} />);

    expect(await screen.findByText('Degraded')).toBeInTheDocument();
  });

  it('updates the NOW PLAYING readout live when a later poll reports a new track', async () => {
    vi.useFakeTimers();
    // Mutable body: the shared store's next poll sees whatever is current.
    let now: NowPlayingResponse = { playing: false };
    const fetchMock = vi.fn((path: string) => {
      if (path.startsWith('/api/now-playing')) {
        return Promise.resolve(jsonResponse(now));
      }
      if (path.startsWith('/api/status')) {
        return Promise.resolve(
          jsonResponse({ degraded: false, services: [] } satisfies StatusResponse),
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
      status: jsonResponse({}, { ok: false, status: 503 }),
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
