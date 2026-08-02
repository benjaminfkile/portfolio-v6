import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
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

  it('resolves "/blog" to the blog index (not swallowed by "/:slug")', () => {
    stubApi();

    renderAt('/blog');

    expect(
      screen.getByRole('heading', { level: 1, name: 'Blog' }),
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

  it('renders the site nav on every route, with page links and a Blog link', async () => {
    stubApi();

    renderAt('/');

    const nav = await screen.findByRole('navigation', { name: /primary/i });
    expect(await within(nav).findByRole('link', { name: 'Home' })).toHaveAttribute(
      'href',
      '/',
    );
    expect(within(nav).getByRole('link', { name: 'Projects' })).toHaveAttribute(
      'href',
      '/projects',
    );
    expect(within(nav).getByRole('link', { name: 'Blog' })).toHaveAttribute(
      'href',
      '/blog',
    );
  });
});
