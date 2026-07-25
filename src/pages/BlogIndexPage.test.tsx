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

  it('filters by tag, refetching the list scoped to the chosen tag', async () => {
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
