import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import HomePage from './HomePage';
import type { ContentDocument } from '../types/content';
import type { NowPlayingResponse, StatusResponse } from '../lib/api';
import { fixtureDocument, fixturePostSummaries } from '../test/fixtures';

function jsonResponse(body: unknown, init: { ok?: boolean; status?: number } = {}) {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

const statusOk: StatusResponse = {
  degraded: false,
  services: [
    { name: 'Gateway', ok: true, response_time_ms: 12 },
    { name: 'API', ok: true, response_time_ms: 40 },
    { name: 'Database', ok: true, response_time_ms: 8 },
  ],
};

const nowPlaying: NowPlayingResponse = {
  playing: true,
  track: {
    title: 'Windowlicker',
    artists: ['Aphex Twin'],
    album: 'Windowlicker',
    art_url: 'https://i.scdn.co/image/abc123',
    url: 'https://open.spotify.com/track/xyz',
  },
};

/**
 * A URL-aware fetch mock. The home page's live sections (status, blog,
 * now_playing) each fetch their own endpoint at runtime (§3.5), so the mock
 * must answer per path, not with one blanket body.
 */
function stubApi(opts: {
  content?: (path: string) => Response;
  status?: Response;
  now?: Response;
  posts?: Response;
} = {}) {
  const fetchMock = vi.fn((path: string) => {
    if (path.startsWith('/api/status')) {
      return Promise.resolve(opts.status ?? jsonResponse(statusOk));
    }
    if (path.startsWith('/api/now-playing')) {
      return Promise.resolve(opts.now ?? jsonResponse(nowPlaying));
    }
    if (path.startsWith('/api/posts')) {
      return Promise.resolve(
        opts.posts ??
          jsonResponse({ posts: fixturePostSummaries, next_cursor: null }),
      );
    }
    // /api/content or /api/admin/preview — the page-level document.
    return Promise.resolve(
      opts.content?.(path) ?? jsonResponse(fixtureDocument),
    );
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function renderHome(path = '/') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <HomePage />
    </MemoryRouter>,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('HomePage', () => {
  it('renders a clean empty page (no error) when sections is empty', async () => {
    stubApi({
      content: () =>
        jsonResponse({ version: 0, published_at: null, sections: [] }),
    });

    renderHome();

    await waitFor(() =>
      expect(screen.queryByText('Loading…')).not.toBeInTheDocument(),
    );

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('main')).toBeInTheDocument();
  });

  it('renders every static section from a realistic fixture document', async () => {
    stubApi();

    renderHome();

    // hero — the page's <h1>, plus its background from the media map.
    const hero = await screen.findByRole('heading', { level: 1, name: 'Ben Kile' });
    expect(hero).toBeInTheDocument();
    const heroImg = screen.getByAltText('A wide mountain skyline');
    expect(heroImg).toHaveAttribute(
      'src',
      'https://media.benkile.com/media/hero/backdrop.jpg',
    );

    // about — heading + both paragraphs (blank-line split).
    expect(
      screen.getByRole('heading', { level: 2, name: 'About me' }),
    ).toBeInTheDocument();
    expect(screen.getByText('First paragraph of the bio.')).toBeInTheDocument();
    expect(screen.getByText('Second paragraph of the bio.')).toBeInTheDocument();

    // timeline — entries with date ranges, one with resolved media.
    expect(
      screen.getByRole('heading', { level: 3, name: 'Staff Engineer, Acme Corp' }),
    ).toBeInTheDocument();
    expect(screen.getByText('2019 – 2022')).toBeInTheDocument();
    expect(screen.getByAltText('Acme Corp logo')).toBeInTheDocument();

    // skills — proficiency renders as a <meter>.
    const meters = screen.getAllByRole('meter');
    expect(meters).toHaveLength(2);
    expect(meters[0]).toHaveAttribute('aria-label', 'TypeScript proficiency');

    // portfolio — project title, resolved media, and its links.
    expect(
      screen.getByRole('heading', { level: 3, name: 'Portfolio v6' }),
    ).toBeInTheDocument();
    expect(screen.getByAltText('Portfolio v6 screenshot')).toBeInTheDocument();
    const repoLink = screen.getByRole('link', { name: 'portfolio-v6' });
    expect(repoLink).toHaveAttribute('href', 'https://github.com/example/portfolio-v6');

    // contact — mailto link.
    expect(screen.getByRole('link', { name: 'hello@benkile.com' })).toHaveAttribute(
      'href',
      'mailto:hello@benkile.com',
    );
  });

  it('renders the three live sections from their own runtime fetches (§3.5)', async () => {
    stubApi();

    renderHome();

    // status — a curated service with a response time (config: show times on).
    expect(await screen.findByText('Gateway')).toBeInTheDocument();
    expect(screen.getByText('12 ms')).toBeInTheDocument();

    // now_playing — the current track title as an outbound link.
    const track = screen.getByRole('link', { name: 'Windowlicker' });
    expect(track).toHaveAttribute('href', 'https://open.spotify.com/track/xyz');

    // blog — a teaser card linking to the post.
    expect(screen.getByRole('link', { name: /First post/ })).toHaveAttribute(
      'href',
      '/blog/first-post',
    );
  });

  it('degrades silently and logs when a section type is unknown', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    stubApi({
      content: () =>
        jsonResponse({
          version: 1,
          published_at: '2026-07-24T18:00:00Z',
          sections: [
            { id: 'a', type: 'hero', data: { title: 'Ben Kile' }, items: [] },
            // A type this build does not recognise.
            { id: 'b', type: 'testimonials' as never, data: {}, items: [] },
          ],
        }),
    });

    renderHome();

    // The known section still renders...
    await screen.findByRole('heading', { level: 1, name: 'Ben Kile' });
    // ...the unknown one renders nothing but is logged exactly once.
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('testimonials'));
  });

  it('renders an error state (not a crash) when the fetch fails', async () => {
    stubApi({ content: () => jsonResponse({}, { ok: false, status: 500 }) });
    vi.spyOn(console, 'error').mockImplementation(() => {});

    renderHome();

    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });

  describe('preview mode (§7)', () => {
    it('fetches /api/admin/preview with the token, injects noindex, and shows the indicator', async () => {
      const previewDoc: ContentDocument = {
        version: 99,
        published_at: null,
        sections: [
          { id: 'h', type: 'hero', data: { title: 'Draft Ben' }, items: [] },
        ],
      };
      const fetchMock = stubApi({
        content: (path) =>
          path.startsWith('/api/admin/preview')
            ? jsonResponse(previewDoc)
            : jsonResponse({}, { ok: false, status: 500 }),
      });

      renderHome('/?preview=tok123');

      // The draft renders through the normal component tree.
      await screen.findByRole('heading', { level: 1, name: 'Draft Ben' });

      // Endpoint switched to the preview route, carrying the token verbatim.
      const previewCall = fetchMock.mock.calls.find((c) =>
        String(c[0]).startsWith('/api/admin/preview'),
      );
      expect(previewCall).toBeTruthy();
      expect(String(previewCall![0])).toContain('tok123');
      // The public content endpoint is never hit in preview mode.
      expect(
        fetchMock.mock.calls.some((c) => String(c[0]).startsWith('/api/content')),
      ).toBe(false);

      // noindex meta injected (§7).
      const meta = document.head.querySelector('meta[name="robots"]');
      expect(meta).not.toBeNull();
      expect(meta).toHaveAttribute('content', 'noindex');

      // The preview indicator is visible.
      expect(screen.getByText(/preview/i)).toBeInTheDocument();
    });

    it('shows a plain failure message for an invalid / expired token', async () => {
      stubApi({
        content: () => jsonResponse({}, { ok: false, status: 401 }),
      });
      vi.spyOn(console, 'error').mockImplementation(() => {});

      renderHome('/?preview=expired');

      expect(await screen.findByRole('alert')).toHaveTextContent(
        /invalid or has expired/i,
      );
    });
  });
});
