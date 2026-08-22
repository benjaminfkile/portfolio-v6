import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import BlogIndexPage from './BlogIndexPage';
import { fixturePostSummaries } from '../test/fixtures';
import type { PostSummary } from '../types/content';

function jsonResponse(body: unknown, init: { ok?: boolean; status?: number } = {}) {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

const thirdPost: PostSummary = {
  slug: 'third-post',
  title: 'Third post',
  excerpt: 'The last one.',
  cover: null,
  tags: ['engineering'],
  published_at: '2026-07-10T10:00:00Z',
  blog: null,
};

function renderIndex() {
  return render(
    <MemoryRouter>
      <BlogIndexPage />
    </MemoryRouter>,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('BlogIndexPage (spec §3.5, §4.1)', () => {
  it('renders teaser cards (cover, title, excerpt, tags, date) linking to /blog/:slug', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ posts: fixturePostSummaries, next_cursor: null }),
      );
    vi.stubGlobal('fetch', fetchMock);

    renderIndex();

    await screen.findByText('First post');

    // Title links to the post.
    const firstLink = screen.getByRole('link', { name: /First post/ });
    expect(firstLink).toHaveAttribute('href', '/blog/first-post');

    // Cover, excerpt, tags, and a machine-readable date all render.
    expect(screen.getByAltText('First cover')).toBeInTheDocument();
    expect(screen.getByText('The very first one.')).toBeInTheDocument();
    // 'engineering' shows both as a card tag and as a filter button.
    expect(screen.getAllByText('engineering').length).toBeGreaterThan(0);
    const time = document.querySelector('time');
    expect(time).toHaveAttribute('dateTime', '2026-07-24T10:00:00Z');
  });

  it('paginates with a cursor-based "Load more" that appends the next page', async () => {
    const fetchMock = vi.fn((path: string) =>
      Promise.resolve(
        path.includes('cursor=')
          ? jsonResponse({ posts: [thirdPost], next_cursor: null })
          : jsonResponse({ posts: fixturePostSummaries, next_cursor: 'CURSOR1' }),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    renderIndex();
    await screen.findByText('First post');

    // First page fetched without a cursor.
    expect(fetchMock.mock.calls[0][0]).toBe('/api/posts');

    const loadMore = screen.getByRole('button', { name: 'Load more' });
    loadMore.click();

    await screen.findByText('Third post');
    // The earlier page is retained — this is append, not replace.
    expect(screen.getByText('First post')).toBeInTheDocument();

    // Second page carried the cursor from the first response.
    expect(fetchMock.mock.calls[1][0]).toContain('cursor=CURSOR1');
    // No cursor left → the control is gone.
    expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull();
  });

  // Tag filter row is hidden for now (owner request 2026-08-21); the behaviour
  // test is skipped, not deleted, so it returns with the row.
  it.skip('filters by tag, refetching the list scoped to the chosen tag', async () => {
    const fetchMock = vi.fn((path: string) =>
      Promise.resolve(
        path.includes('tag=react')
          ? jsonResponse({
              posts: [fixturePostSummaries[1]],
              next_cursor: null,
            })
          : jsonResponse({ posts: fixturePostSummaries, next_cursor: null }),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    renderIndex();
    await screen.findByText('First post');

    // The tag filter offers the tags seen across loaded posts.
    const filters = screen.getByRole('navigation', { name: /filter/i });
    within(filters).getByRole('button', { name: 'react' }).click();

    await waitFor(() =>
      expect(screen.queryByText('First post')).toBeNull(),
    );
    expect(screen.getByText('Second post')).toBeInTheDocument();

    const tagged = fetchMock.mock.calls.find((c) =>
      String(c[0]).includes('tag=react'),
    );
    expect(tagged).toBeTruthy();
  });

  it('renders no tag filter row while it is hidden (card chips still show)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(jsonResponse({ posts: fixturePostSummaries, next_cursor: null })),
      ),
    );
    renderIndex();
    await screen.findByText('First post');
    expect(screen.queryByRole('navigation', { name: /filter posts by tag/i })).toBeNull();
  });

  it('renders a blog-name chip on cards (none when null) and a blog filter that round-trips through the URL', async () => {
    const blogPosts: PostSummary[] = [
      {
        slug: 'alpha',
        title: 'Alpha',
        excerpt: 'A.',
        cover: null,
        tags: ['x'],
        published_at: '2026-07-24T10:00:00Z',
        blog: { slug: 'field-notes', name: 'Field Notes' },
      },
      {
        slug: 'bravo',
        title: 'Bravo',
        excerpt: 'B.',
        cover: null,
        tags: ['y'],
        published_at: '2026-07-20T10:00:00Z',
        blog: null,
      },
    ];
    const fetchMock = vi.fn((path: string) =>
      Promise.resolve(
        path.includes('blog=field-notes')
          ? jsonResponse({ posts: [blogPosts[0]], next_cursor: null })
          : jsonResponse({ posts: blogPosts, next_cursor: null }),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    renderIndex();
    await screen.findByText('Alpha');

    // The card for the blogged post shows its blog name as a chip; the null-blog
    // card shows no such chip.
    const alphaCard = screen.getByText('Alpha').closest('article') as HTMLElement;
    expect(within(alphaCard).getByText('Field Notes')).toBeInTheDocument();
    const bravoCard = screen.getByText('Bravo').closest('article') as HTMLElement;
    expect(within(bravoCard).queryByText(/Field Notes|Dev Log/)).toBeNull();

    // The blog filter lists blogs seen across loaded posts; choosing one scopes
    // the list and marks that chip active (read back from the URL param).
    const blogFilters = screen.getByRole('navigation', {
      name: 'Filter posts by blog',
    });
    const chip = within(blogFilters).getByRole('button', { name: 'Field Notes' });
    chip.click();

    await waitFor(() => expect(screen.queryByText('Bravo')).toBeNull());
    expect(
      fetchMock.mock.calls.some((c) => String(c[0]).includes('blog=field-notes')),
    ).toBe(true);
    expect(
      within(blogFilters).getByRole('button', { name: 'Field Notes' }),
    ).toHaveAttribute('aria-pressed', 'true');
  });

  it('reads ?blog= from the URL on load and carries it through pagination', async () => {
    const scoped: PostSummary = {
      slug: 'bravo',
      title: 'Bravo',
      excerpt: 'B.',
      cover: null,
      tags: ['y'],
      published_at: '2026-07-20T10:00:00Z',
      blog: { slug: 'devlog', name: 'Dev Log' },
    };
    const nextPage: PostSummary = { ...scoped, slug: 'charlie', title: 'Charlie' };
    const fetchMock = vi.fn((path: string) =>
      Promise.resolve(
        path.includes('cursor=')
          ? jsonResponse({ posts: [nextPage], next_cursor: null })
          : jsonResponse({ posts: [scoped], next_cursor: 'C1' }),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    render(
      <MemoryRouter initialEntries={['/blog?blog=devlog']}>
        <BlogIndexPage />
      </MemoryRouter>,
    );

    await screen.findByText('Bravo');
    // The initial fetch was scoped to the URL's blog, and its chip is active.
    expect(String(fetchMock.mock.calls[0][0])).toContain('blog=devlog');
    expect(
      screen.getByRole('button', { name: 'Dev Log' }),
    ).toHaveAttribute('aria-pressed', 'true');

    screen.getByRole('button', { name: 'Load more' }).click();
    await screen.findByText('Charlie');

    // The next page kept the blog scope alongside the cursor.
    const paged = fetchMock.mock.calls[1][0] as string;
    expect(paged).toContain('cursor=C1');
    expect(paged).toContain('blog=devlog');
  });

  it('shows an error state when the list cannot be loaded', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({}, { ok: false, status: 500 }));
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(console, 'error').mockImplementation(() => {});

    renderIndex();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /could not be loaded/i,
    );
  });
});
