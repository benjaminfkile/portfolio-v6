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
});
