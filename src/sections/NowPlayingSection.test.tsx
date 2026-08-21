import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import NowPlayingSection, { relativeTimeSince } from './NowPlayingSection';
import type { Section } from '../types/content';
import type { NowPlayingResponse } from '../lib/api';

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

  it('renders the last-played track as a card when idle (§4.6 fallback)', async () => {
    const idleWithLast: NowPlayingResponse = {
      playing: false,
      last_played: {
        track: {
          title: 'Windowlicker',
          artists: ['Aphex Twin'],
          album: 'Windowlicker',
          art_url: 'https://i.scdn.co/image/abc123',
          url: 'https://open.spotify.com/track/xyz',
        },
        played_at: new Date(Date.now() - 2 * 3600_000).toISOString(),
      },
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(idleWithLast)));

    // The fallback takes precedence over idle config — even `hide` shows it.
    renderNowPlaying({ idle: 'hide', show_album_art: true });

    const link = await screen.findByRole('link', { name: 'Windowlicker' });
    expect(link).toHaveAttribute('href', 'https://open.spotify.com/track/xyz');
    expect(screen.getByText('Last played · 2h ago')).toBeInTheDocument();
    expect(screen.getByText('Aphex Twin')).toBeInTheDocument();
    expect(screen.getByRole('img')).toHaveAttribute(
      'src',
      'https://i.scdn.co/image/abc123',
    );
    // No progress meter for a finished track.
    expect(screen.queryByRole('meter')).not.toBeInTheDocument();
  });

  it('relativeTimeSince formats coarse ages and degrades on garbage', () => {
    const now = Date.parse('2026-08-10T12:00:00.000Z');
    expect(relativeTimeSince('2026-08-10T11:59:40.000Z', now)).toBe('just now');
    expect(relativeTimeSince('2026-08-10T11:15:00.000Z', now)).toBe('45m ago');
    expect(relativeTimeSince('2026-08-10T07:00:00.000Z', now)).toBe('5h ago');
    expect(relativeTimeSince('2026-08-07T12:00:00.000Z', now)).toBe('3d ago');
    expect(relativeTimeSince('not-a-date', now)).toBeNull();
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

  // Polling-fallback behavior was removed in the event-driven-only pass (see
  // commit "feat(now-playing): event-driven only, remove the polling fallback"
  // and the exhaustive no-polling coverage in useNowPlaying.test.tsx).
});
