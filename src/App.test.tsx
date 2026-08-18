import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from './App';
import { fixtureDocument, fixturePostSummaries } from './test/fixtures';

function jsonResponse(body: unknown, init: { ok?: boolean; status?: number } = {}) {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

/**
 * A URL-aware fetch mock. The full app mounts the site nav (which fetches
 * `/api/content`) alongside each page, and content pages have live sections that
 * fetch their own endpoints (§3.5) — so the mock answers per path.
 */
function stubApi(opts: { content?: (path: string) => Response } = {}) {
  const fetchMock = vi.fn((path: string) => {
    if (path.startsWith('/api/status')) {
      return Promise.resolve(jsonResponse({ degraded: false, services: [] }));
    }
    if (path.startsWith('/api/now-playing')) {
      return Promise.resolve(jsonResponse({ playing: false }));
    }
    if (path.startsWith('/api/duolingo')) {
      return Promise.resolve(jsonResponse({ available: false }));
    }
    if (path.startsWith('/api/posts')) {
      return Promise.resolve(
        jsonResponse({ posts: fixturePostSummaries, next_cursor: null }),
      );
    }
    return Promise.resolve(opts.content?.(path) ?? jsonResponse(fixtureDocument));
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('App routing', () => {
  it('resolves "/" to the "home" content page', async () => {
    stubApi();

    renderAt('/');

    // The home page's hero heading comes from the "home" page's sections.
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Ben Kile' }),
    ).toBeInTheDocument();
  });

  it('resolves "/:slug" to the matching content page', async () => {
    stubApi();

    renderAt('/projects');

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Projects' }),
    ).toBeInTheDocument();
  });

  it('renders a 404 for an unknown slug', async () => {
    stubApi();

    renderAt('/nope');

    expect(
      await screen.findByRole('heading', { name: 'Page not found' }),
    ).toBeInTheDocument();
  });

  it('resolves "/blog" to the classic index when the document has no `blog` page (fallback)', async () => {
    stubApi();

    renderAt('/blog');

    // The fallback BlogIndexPage renders its "Blog" heading — the fixture
    // document has no page slugged `blog`, so BlogRoute falls back to it.
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Blog' }),
    ).toBeInTheDocument();
  });

  it('resolves "/blog" to the content page slugged "blog" when it exists (Blog Page v1.x)', async () => {
    // Extend the fixture with a `blog` page whose sole section identifies the
    // rendered ContentPage — a hero with a distinctive title.
    const doc = {
      ...fixtureDocument,
      pages: [
        ...fixtureDocument.pages,
        {
          id: 'page-blog',
          slug: 'blog',
          title: 'Field Notes',
          nav_label: 'Blog',
          nav_position: 3,
          sections: [
            {
              id: 'sec-blog-hero',
              type: 'hero' as const,
              data: { title: 'Field Notes' },
              items: [],
            },
          ],
        },
      ],
    };
    stubApi({ content: () => jsonResponse(doc) });

    renderAt('/blog');

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Field Notes' }),
    ).toBeInTheDocument();
  });

  it('resolves "/blog/:slug" to the blog post page (not swallowed by "/:slug")', async () => {
    const post = {
      slug: 'hello-world',
      title: 'Hello World',
      excerpt: '',
      cover: null,
      tags: [],
      published_at: '2026-07-20T09:00:00Z',
      body: [],
      media: {},
    };
    const fetchMock = stubApi();
    fetchMock.mockImplementation((path: string) => {
      if (path.startsWith('/api/posts/')) {
        return Promise.resolve(jsonResponse(post));
      }
      return Promise.resolve(jsonResponse(fixtureDocument));
    });

    renderAt('/blog/hello-world');

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Hello World' }),
    ).toBeInTheDocument();
    // The slug drove the fetch of the matching post.
    expect(
      fetchMock.mock.calls.some((c) => String(c[0]) === '/api/posts/hello-world'),
    ).toBe(true);
  });

  it('renders the site nav on every route, with page links from the document', async () => {
    stubApi();

    renderAt('/');

    // The inline "Primary" nav is visually hidden below 900px (jsdom applies the
    // mobile base styles), so it sits outside the accessibility tree: it is
    // located by `aria-label` with `hidden: true` and its links by role.
    const nav = screen
      .getAllByRole('navigation', { hidden: true })
      .find((n) => n.getAttribute('aria-label') === 'Primary')!;
    await waitFor(() =>
      expect(within(nav).getAllByRole('link', { hidden: true })).toHaveLength(2),
    );
    const links = within(nav).getAllByRole('link', { hidden: true });
    const href = (text: string) =>
      links.find((a) => a.textContent === text)!.getAttribute('href');
    expect(href('Home')).toBe('/');
    expect(href('Projects')).toBe('/projects');
    // Blog Page v1.x: no hardcoded Blog link — the admin orders `/blog` via a
    // page slugged `blog` with a `nav_label`.
    expect(links.some((a) => a.textContent === 'Blog')).toBe(false);
  });

  it('exposes the header, main, and footer landmarks (§7)', async () => {
    stubApi();

    renderAt('/');

    await screen.findByRole('heading', { level: 1, name: 'Ben Kile' });
    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByRole('main')).toBeInTheDocument();
    expect(screen.getByRole('contentinfo')).toBeInTheDocument();
  });

  it('renders a skip-to-content link as the first focusable, targeting main (§7)', async () => {
    stubApi();

    renderAt('/');

    const skip = screen.getByRole('link', { name: /skip to content/i });
    // It is the first link in document order (the first focusable element).
    expect(screen.getAllByRole('link')[0]).toBe(skip);

    // Its href targets the id on the main landmark.
    const main = await screen.findByRole('main');
    expect(main).toHaveAttribute('id', 'main-content');
    expect(skip).toHaveAttribute('href', '#main-content');
  });
});
