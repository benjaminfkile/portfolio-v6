import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import BlogPostPage from './BlogPostPage';
import { fixturePost } from '../test/fixtures';

// Keep the code block's highlighter out of jsdom (see CodeBlock.test).
vi.mock('../blocks/highlight', () => ({
  highlightCode: vi.fn().mockResolvedValue(null),
}));

function jsonResponse(body: unknown, init: { ok?: boolean; status?: number } = {}) {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

function renderAt(entry: string) {
  return render(
    <MemoryRouter initialEntries={[entry.startsWith('/') ? entry : `/blog/${entry}`]}>
      <Routes>
        <Route path="/blog/:slug" element={<BlogPostPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('BlogPostPage (spec §3.7, §4.1)', () => {
  it('renders title, cover, date, then the block body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(fixturePost));
    vi.stubGlobal('fetch', fetchMock);

    renderAt('hello-blocks');

    await screen.findByRole('heading', { name: 'Every block, once', level: 1 });

    // Fetched the resolved single-post endpoint.
    expect(fetchMock.mock.calls[0][0]).toBe('/api/posts/hello-blocks');

    // Cover + date.
    expect(screen.getByAltText('Post cover')).toBeInTheDocument();
    expect(document.querySelector('time')).toHaveAttribute(
      'dateTime',
      '2026-07-20T09:00:00Z',
    );

    // Body pipeline ran: a couple of representative blocks are present.
    expect(
      screen.getByRole('heading', { name: 'A heading', level: 2 }),
    ).toBeInTheDocument();
    expect(screen.getByText('src/answer.ts')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Source' })).toBeInTheDocument();
  });

  it('renders a clean not-found state for an unknown / unpublished slug (404)', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({}, { ok: false, status: 404 }));
    vi.stubGlobal('fetch', fetchMock);

    renderAt('missing');

    expect(
      await screen.findByRole('heading', { name: 'Post not found' }),
    ).toBeInTheDocument();
    // A way back to the index, and no error alert — 404 is a clean state.
    expect(screen.getByRole('link', { name: /back to the blog/i })).toHaveAttribute(
      'href',
      '/blog',
    );
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows an error state for a non-404 failure', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({}, { ok: false, status: 500 }));
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(console, 'error').mockImplementation(() => {});

    renderAt('boom');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /could not be loaded/i,
    );
  });

  describe('preview mode (§7)', () => {
    it('fetches /api/admin/preview/posts/:id verbatim (by id, with token) and injects noindex', async () => {
      const draft = { ...fixturePost, title: 'Draft post' };
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse(draft));
      vi.stubGlobal('fetch', fetchMock);

      renderAt('/blog/whatever-slug?preview=tok9&postId=42');

      await screen.findByRole('heading', { name: 'Draft post', level: 1 });

      // The draft is addressed by id on the preview route, carrying the token.
      const url = String(fetchMock.mock.calls[0][0]);
      expect(url).toContain('/api/admin/preview/posts/42');
      expect(url).toContain('tok9');
      // The public single-post endpoint is never hit in preview mode.
      expect(
        fetchMock.mock.calls.some((c) =>
          String(c[0]).startsWith('/api/posts/whatever-slug'),
        ),
      ).toBe(false);

      // noindex meta injected + the preview indicator shown (§7).
      const meta = document.head.querySelector('meta[name="robots"]');
      expect(meta).toHaveAttribute('content', 'noindex');
      expect(screen.getByText(/preview/i)).toBeInTheDocument();
    });

    it('shows a plain failure message for an invalid / expired token', async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValue(jsonResponse({}, { ok: false, status: 401 }));
      vi.stubGlobal('fetch', fetchMock);
      vi.spyOn(console, 'error').mockImplementation(() => {});

      renderAt('/blog/whatever-slug?preview=expired&postId=42');

      expect(await screen.findByRole('alert')).toHaveTextContent(
        /invalid or has expired/i,
      );
    });
  });
});
