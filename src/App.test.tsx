import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from './App';
import type { ContentDocument } from '../types/content';

function jsonResponse(body: unknown, init: { ok?: boolean; status?: number } = {}) {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: () => Promise.resolve(body),
  } as unknown as Response;
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
  it('resolves "/" to the home page', async () => {
    const doc: ContentDocument = { version: 0, published_at: null, sections: [] };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(doc)));

    renderAt('/');

    // HomePage owns the only <main>; it starts in a loading state.
    expect(await screen.findByRole('main')).toBeInTheDocument();
  });

  it('resolves "/blog" to the blog index', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ posts: [], next_cursor: null })),
    );

    renderAt('/blog');

    expect(
      screen.getByRole('heading', { level: 1, name: 'Blog' }),
    ).toBeInTheDocument();
  });

  it('resolves "/blog/:slug" to the blog post page for the given slug', async () => {
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
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(post));
    vi.stubGlobal('fetch', fetchMock);

    renderAt('/blog/hello-world');

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Hello World' }),
    ).toBeInTheDocument();
    // The slug drove the fetch of the matching post.
    expect(fetchMock.mock.calls[0][0]).toBe('/api/posts/hello-world');
  });
});
