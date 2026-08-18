import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import BlogSection from './BlogSection';
import type { Section } from '../types/content';
import { fixturePostSummaries } from '../test/fixtures';

function jsonResponse(body: unknown, init: { ok?: boolean; status?: number } = {}) {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

function blogSection(data: Record<string, unknown>): Section {
  return { id: 'sec-blog', type: 'blog', data, items: [] } as Section;
}

function renderBlog(data: Record<string, unknown>) {
  return render(
    <MemoryRouter>
      <BlogSection section={blogSection(data)} media={{}} />
    </MemoryRouter>,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('BlogSection (spec §3.5)', () => {
  it('renders teaser cards linking to /blog/:slug, fetched with the configured count/tag', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ posts: fixturePostSummaries, next_cursor: null }),
      );
    vi.stubGlobal('fetch', fetchMock);

    renderBlog({ limit: 3, tag: 'engineering' });

    const link = await screen.findByRole('link', { name: /First post/ });
    expect(link).toHaveAttribute('href', '/blog/first-post');

    // The configured count and tag drove the request.
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain('/api/posts');
    expect(url).toContain('limit=3');
    expect(url).toContain('tag=engineering');
  });

  it('scopes the teaser to data.blog and points "view all" at the filtered index (Blogs v1.13)', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ posts: fixturePostSummaries, next_cursor: null }),
      );
    vi.stubGlobal('fetch', fetchMock);

    renderBlog({ limit: 3, blog: 'field-notes' });

    await screen.findByRole('link', { name: /First post/ });

    // The configured blog scopes the request.
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain('blog=field-notes');
    expect(url).toContain('limit=3');

    // "View all" carries the blog through to the filtered index.
    expect(screen.getByRole('link', { name: /read the blog/i })).toHaveAttribute(
      'href',
      '/blog?blog=field-notes',
    );
  });

  it('degrades to nothing (never a broken page) when the fetch fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({}, { ok: false, status: 500 })),
    );
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const { container } = renderBlog({ limit: 3 });

    await waitFor(() => expect(container).toBeEmptyDOMElement());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('degrades to nothing when there are no posts to tease', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ posts: [], next_cursor: null })),
    );

    const { container } = renderBlog({ limit: 3 });

    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  describe('mode: "index" (Blog Page v1.x)', () => {
    const secondPage = {
      slug: 'third-post',
      title: 'Third post',
      excerpt: 'The last one.',
      cover: null,
      tags: ['react'],
      published_at: '2026-07-10T10:00:00Z',
      blog: null,
    };

    it('renders the full paginated index (filter chips, cards, Load more) instead of the teaser', async () => {
      const fetchMock = vi.fn((path: string) =>
        Promise.resolve(
          path.includes('cursor=')
            ? jsonResponse({ posts: [secondPage], next_cursor: null })
            : jsonResponse({
                posts: fixturePostSummaries,
                next_cursor: 'CURSOR1',
              }),
        ),
      );
      vi.stubGlobal('fetch', fetchMock);

      renderBlog({ mode: 'index' });

      // The index-mode section renders BlogListing (cards + Load more), not
      // the teaser's "Read the blog" link.
      await screen.findByText('First post');
      expect(screen.queryByRole('link', { name: /read the blog/i })).toBeNull();

      // Cursor-based Load more appends the next page.
      const loadMore = screen.getByRole('button', { name: 'Load more' });
      loadMore.click();
      await screen.findByText('Third post');
      expect(screen.getByText('First post')).toBeInTheDocument();
      expect(String(fetchMock.mock.calls[1][0])).toContain('cursor=CURSOR1');
    });

    it('honours header copy overrides from the section config', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(
          jsonResponse({ posts: fixturePostSummaries, next_cursor: null }),
        ),
      );

      renderBlog({
        mode: 'index',
        title: 'Field Notes',
        eyebrow: '// notebook',
        intro: 'Writing about the platform.',
      });

      await screen.findByText('First post');
      expect(
        screen.getByRole('heading', { level: 2, name: 'Field Notes' }),
      ).toBeInTheDocument();
      expect(screen.getByText('// notebook')).toBeInTheDocument();
      expect(screen.getByText('Writing about the platform.')).toBeInTheDocument();
    });

    it('degrades to nothing on a fetch failure (live-section rules)', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(jsonResponse({}, { ok: false, status: 500 })),
      );
      vi.spyOn(console, 'error').mockImplementation(() => {});

      const { container } = renderBlog({ mode: 'index' });

      await waitFor(() => expect(container).toBeEmptyDOMElement());
    });

    it('reads mode defensively — an unknown mode value falls back to teaser', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(
          jsonResponse({ posts: fixturePostSummaries, next_cursor: null }),
        ),
      );

      renderBlog({ mode: 'nonsense' as unknown as 'teaser', limit: 3 });

      // Teaser mode fingerprint: the "Read the blog" link (index mode has none).
      expect(
        await screen.findByRole('link', { name: /read the blog/i }),
      ).toBeInTheDocument();
    });
  });
});
