import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import NowPlayingSection from './NowPlayingSection';
import type { Section } from '../types/content';
import type { NowPlayingResponse } from '../lib/api';
import { NOW_PLAYING_POLL_INTERVAL_MS } from '../lib/useNowPlaying';

function jsonResponse(body: unknown, init: { ok?: boolean; status?: number } = {}) {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

function nowPlayingSection(data: Record<string, unknown>): Section {
  return { id: 'sec-now', type: 'now_playing', data, items: [] } as Section;
}

function renderNowPlaying(data: Record<string, unknown>) {
  return render(<NowPlayingSection section={nowPlayingSection(data)} media={{}} />);
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

const playing: NowPlayingResponse = {
  playing: true,
  track: {
    title: 'Windowlicker',
    artists: ['Aphex Twin'],
    album: 'Windowlicker',
    art_url: 'https://i.scdn.co/image/abc123',
    url: 'https://open.spotify.com/track/xyz',
    progress_ms: 1000,
    duration_ms: 6000,
  },
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  setVisibility('visible');
});

describe('NowPlayingSection (spec §3.5, §4.6)', () => {
  it('renders the track: title, artists, album, hotlinked art, outbound link', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(playing)));

    renderNowPlaying({ idle: 'message', show_album_art: true });

    const link = await screen.findByRole('link', { name: 'Windowlicker' });
    expect(link).toHaveAttribute('href', 'https://open.spotify.com/track/xyz');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));

    expect(screen.getByText('Aphex Twin')).toBeInTheDocument();
    // Album art is hotlinked from Spotify's CDN (§3.5).
    const art = screen.getByRole('img');
    expect(art).toHaveAttribute('src', 'https://i.scdn.co/image/abc123');
  });

  it('renders a live progress meter and an aria-live readout (DESIGN.md §5, §7)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(playing)));

    const { container } = renderNowPlaying({ idle: 'message', show_album_art: true });

    await screen.findByRole('link', { name: 'Windowlicker' });

    // Progress bar reflects progress_ms → duration_ms (1000 / 6000 ≈ 17%).
    const meter = screen.getByRole('meter');
    expect(meter).toHaveAttribute('aria-valuenow', '17');

    // The readout is announced politely so a track change is spoken (§7).
    const live = container.querySelector('[aria-live="polite"]');
    expect(live).not.toBeNull();
    expect(live).toHaveTextContent('Windowlicker');
    expect(live).toHaveTextContent('Aphex Twin');
  });

  it('honors idle = "message" when nothing is playing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ playing: false })));

    renderNowPlaying({ idle: 'message', idle_message: 'Away from the decks.' });

    expect(await screen.findByText('Away from the decks.')).toBeInTheDocument();
  });

  it('honors idle = "hide" by removing the section entirely when idle', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ playing: false })));

    const { container } = renderNowPlaying({ idle: 'hide' });

    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it('degrades to idle (never errors) when the fetch fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({}, { ok: false, status: 500 })),
    );
    vi.spyOn(console, 'error').mockImplementation(() => {});

    // With idle = "message" the degrade is observable as the idle line.
    renderNowPlaying({ idle: 'message', idle_message: 'Not listening.' });

    expect(await screen.findByText('Not listening.')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('polls every 5s only while the tab is visible, pausing when hidden', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ playing: false }));
    vi.stubGlobal('fetch', fetchMock);

    const npCalls = () =>
      fetchMock.mock.calls.filter((call) =>
        String(call[0]).startsWith('/api/now-playing'),
      ).length;

    renderNowPlaying({ idle: 'hide' });

    // Initial fetch on mount.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(npCalls()).toBe(1);

    // Visible: a poll tick refetches.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(NOW_PLAYING_POLL_INTERVAL_MS);
    });
    expect(npCalls()).toBe(2);

    // Hidden: ticks are no-ops — a backgrounded tab must not poll (§3.5).
    await act(async () => {
      setVisibility('hidden');
      await vi.advanceTimersByTimeAsync(NOW_PLAYING_POLL_INTERVAL_MS * 12);
    });
    expect(npCalls()).toBe(2);

    // Returning to the foreground refetches immediately, then resumes polling.
    await act(async () => {
      setVisibility('visible');
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(npCalls()).toBe(3);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(NOW_PLAYING_POLL_INTERVAL_MS);
    });
    expect(npCalls()).toBe(4);
  });
});
