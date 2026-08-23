import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import ContentPage from './ContentPage';
import type { ContentDocument } from '../types/content';
import type {
  DuolingoResponse,
  GithubResponse,
  NowPlayingResponse,
  StatusResponse,
} from '../lib/api';
import {
  fixtureDocument,
  fixtureGithub,
  fixturePostSummaries,
} from '../test/fixtures';

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

const duolingo: DuolingoResponse = {
  available: true,
  streak: 847,
  total_xp: 52_400, course: { title: 'Spanish', xp: 48210 },
};

const github: GithubResponse = fixtureGithub;

/**
 * A URL-aware fetch mock. A content page's live sections (status, blog,
 * now_playing) each fetch their own endpoint at runtime (§3.5), so the mock must
 * answer per path, not with one blanket body.
 */
function stubApi(opts: {
  content?: (path: string) => Response;
  status?: Response;
  now?: Response;
  duolingo?: Response;
  github?: Response;
  posts?: Response;
} = {}) {
  const fetchMock = vi.fn((path: string) => {
    if (path.startsWith('/api/status')) {
      return Promise.resolve(opts.status ?? jsonResponse(statusOk));
    }
    if (path.startsWith('/api/now-playing')) {
      return Promise.resolve(opts.now ?? jsonResponse(nowPlaying));
    }
    if (path.startsWith('/api/duolingo')) {
      return Promise.resolve(opts.duolingo ?? jsonResponse(duolingo));
    }
    if (path.startsWith('/api/github')) {
      return Promise.resolve(opts.github ?? jsonResponse(github));
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

/** Render `ContentPage` under the same `/` + `/:slug` routes the app declares. */
function renderPage(path = '/') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/" element={<ContentPage />} />
        <Route path="/:slug" element={<ContentPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('ContentPage', () => {
  it('renders a clean empty page (no error) when pages is empty at "/"', async () => {
    stubApi({
      content: () => jsonResponse({ version: 0, published_at: null, pages: [] }),
    });

    renderPage('/');

    await waitFor(() =>
      expect(screen.queryByText('Loading…')).not.toBeInTheDocument(),
    );

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('main')).toBeInTheDocument();
    // Never-published "/" is an empty page, not a 404 (§4.1).
    expect(
      screen.queryByRole('heading', { name: 'Page not found' }),
    ).not.toBeInTheDocument();
  });

  it('renders the "home" page\'s static sections from a realistic document', async () => {
    stubApi();

    renderPage('/');

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
    // timeline entries render text-only — a media_id in an older published
    // document is ignored, never rendered
    expect(screen.queryByAltText('Acme Corp logo')).not.toBeInTheDocument();

    // skills — the Skills Console (v1.9): a skill list + the geodesic
    // SkillSphere (jsdom has no WebGL, so the sphere takes its chip fallback).
    // Each skill therefore appears in both the list and the sphere fallback, so
    // assert presence with getAllByText rather than a single-match query.
    expect(screen.getAllByText('TypeScript').length).toBeGreaterThan(0);
    expect(screen.getAllByText('PostgreSQL').length).toBeGreaterThan(0);

    // portfolio — project title, resolved media, and its links.
    expect(
      screen.getByRole('heading', { level: 3, name: 'Portfolio v6' }),
    ).toBeInTheDocument();
    expect(screen.getByAltText('Portfolio v6 screenshot')).toBeInTheDocument();
    const repoLink = screen.getByRole('link', { name: 'portfolio-v6' });
    expect(repoLink).toHaveAttribute('href', 'https://github.com/example/portfolio-v6');

    // contact renders in the footer (SiteFooter), never in the page flow.
    expect(screen.queryByRole('link', { name: 'hello@benkile.com' })).not.toBeInTheDocument();
    expect(screen.queryByText('Get in touch')).not.toBeInTheDocument();
  });

  it('renders the three live sections from their own runtime fetches (§3.5)', async () => {
    stubApi();

    renderPage('/');

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

  it('renders the v1.2 duolingo + github live sections from the registry (§3.4)', async () => {
    stubApi();

    renderPage('/');

    // duolingo — the streak, course readout, and the manual score chip (from the
    // fixture document's config). The hero-strip Duolingo item also renders the
    // streak count from the same shared fetch, so `847` legitimately appears
    // twice on the page (strip + standalone section).
    expect((await screen.findAllByText('847')).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Spanish')).toBeInTheDocument();
    expect(screen.getByText('Duolingo Score 95')).toBeInTheDocument();

    // github — the total contributions and the accessible summary sentence.
    expect(
      screen.getByText(
        '2,143 contributions between 2025-08-11 and 2026-08-09',
      ),
    ).toBeInTheDocument();
  });

  it('selects the page matching "/:slug" and renders its sections', async () => {
    stubApi();

    renderPage('/projects');

    // The "projects" page's own hero — not the home page's.
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Projects' }),
    ).toBeInTheDocument();
    // A section unique to the home page is absent.
    expect(
      screen.queryByRole('heading', { level: 2, name: 'About me' }),
    ).not.toBeInTheDocument();
  });

  it('serves a page whose nav_label is null by direct slug (§3.10)', async () => {
    stubApi();

    renderPage('/secret');

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Secret page' }),
    ).toBeInTheDocument();
  });

  it('renders a 404 for a slug that matches no page', async () => {
    stubApi();

    renderPage('/does-not-exist');

    expect(
      await screen.findByRole('heading', { name: 'Page not found' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /home page/i }),
    ).toHaveAttribute('href', '/');
  });

  it('sets the document title to the page title plus the site suffix', async () => {
    stubApi();

    renderPage('/projects');

    await screen.findByRole('heading', { level: 1, name: 'Projects' });
    expect(document.title).toBe('Projects · Ben Kile');
  });

  it('leaves the home title un-suffixed (it is already the site name)', async () => {
    stubApi();

    renderPage('/');

    await screen.findByRole('heading', { level: 1, name: 'Ben Kile' });
    expect(document.title).toBe('Ben Kile');
  });

  it('degrades silently and logs when a section type is unknown', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    stubApi({
      content: () =>
        jsonResponse({
          version: 1,
          published_at: '2026-07-24T18:00:00Z',
          pages: [
            {
              id: 'p',
              slug: 'home',
              title: 'Ben Kile',
              nav_label: 'Home',
              nav_position: 0,
              sections: [
                { id: 'a', type: 'hero', data: { title: 'Ben Kile' }, items: [] },
                // A type this build does not recognise.
                { id: 'b', type: 'testimonials', data: {}, items: [] },
              ],
            },
          ],
        }),
    });

    renderPage('/');

    // The known section still renders...
    await screen.findByRole('heading', { level: 1, name: 'Ben Kile' });
    // ...the unknown one renders nothing but is logged exactly once.
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('testimonials'));
  });

  it('renders an error state (not a crash) when the fetch fails', async () => {
    stubApi({ content: () => jsonResponse({}, { ok: false, status: 500 }) });
    vi.spyOn(console, 'error').mockImplementation(() => {});

    renderPage('/');

    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });

  describe('preview mode (§7)', () => {
    it('fetches /api/admin/preview with the token, injects noindex, and shows the indicator', async () => {
      const previewDoc: ContentDocument = {
        version: 99,
        published_at: null,
        pages: [
          {
            id: 'ph',
            slug: 'home',
            title: 'Draft Ben',
            nav_label: 'Home',
            nav_position: 0,
            sections: [
              { id: 'h', type: 'hero', data: { title: 'Draft Ben' }, items: [] },
            ],
          },
        ],
      };
      const fetchMock = stubApi({
        content: (path) =>
          path.startsWith('/api/admin/preview')
            ? jsonResponse(previewDoc)
            : jsonResponse({}, { ok: false, status: 500 }),
      });

      renderPage('/?preview=tok123');

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

    it('selects a page that exists only in the draft document (§7)', async () => {
      const previewDoc: ContentDocument = {
        version: 99,
        published_at: null,
        pages: [
          {
            id: 'pd',
            slug: 'draft-only',
            title: 'Draft Only',
            nav_label: null,
            nav_position: 0,
            sections: [
              { id: 'd', type: 'hero', data: { title: 'Draft-only page' }, items: [] },
            ],
          },
        ],
      };
      stubApi({
        content: (path) =>
          path.startsWith('/api/admin/preview')
            ? jsonResponse(previewDoc)
            : jsonResponse({}, { ok: false, status: 500 }),
      });

      renderPage('/draft-only?preview=tok123');

      expect(
        await screen.findByRole('heading', { level: 1, name: 'Draft-only page' }),
      ).toBeInTheDocument();
    });

    it('shows a plain failure message for an invalid / expired token', async () => {
      stubApi({
        content: () => jsonResponse({}, { ok: false, status: 401 }),
      });
      vi.spyOn(console, 'error').mockImplementation(() => {});

      renderPage('/?preview=expired');

      expect(await screen.findByRole('alert')).toHaveTextContent(
        /invalid or has expired/i,
      );
    });
  });
});
