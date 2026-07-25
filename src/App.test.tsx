import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from './App';
import type { ContentDocument } from '../types/content';

function jsonResponse(body: unknown) {
  return {
    ok: true,
    status: 200,
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
    renderAt('/blog');

    expect(
      screen.getByRole('heading', { level: 1, name: 'Blog' }),
    ).toBeInTheDocument();
  });

  it('resolves "/blog/:slug" to the blog post page and exposes the slug', () => {
    renderAt('/blog/hello-world');

    expect(
      screen.getByRole('heading', { level: 1, name: 'Post' }),
    ).toBeInTheDocument();
    expect(screen.getByText('hello-world')).toBeInTheDocument();
  });
});
