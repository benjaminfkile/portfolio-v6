import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from './App';
import { fixtureDocument, fixturePostSummaries } from './test/fixtures';

/**
 * Cross-page accessibility sweep (task 8/8 §2, DESIGN.md §7). App.test.tsx
 * already covers the landmark set and the skip link; this suite pins the
 * "exactly ONE <h1> per page" invariant across every route the site serves —
 * the property most easily broken by an authored document (a page with no hero,
 * or two heroes) or by a section regressing its heading level.
 */

function jsonResponse(body: unknown, init: { ok?: boolean; status?: number } = {}) {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

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
    if (path.startsWith('/api/posts/')) {
      return Promise.resolve(
        jsonResponse({
          slug: 'hello-world',
          title: 'Hello World',
          excerpt: '',
          cover: null,
          tags: [],
          published_at: '2026-07-20T09:00:00Z',
          body: [],
          media: {},
        }),
      );
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

async function expectSingleH1() {
  await waitFor(() => {
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('one <h1> per page (DESIGN.md §7)', () => {
  it('home content page has exactly one h1 (the hero)', async () => {
    stubApi();
    renderAt('/');
    await screen.findByRole('heading', { level: 1, name: 'Ben Kile' });
    await expectSingleH1();
  });

  it('a slug content page has exactly one h1', async () => {
    stubApi();
    renderAt('/projects');
    await screen.findByRole('heading', { level: 1, name: 'Projects' });
    await expectSingleH1();
  });

  it('the blog index has exactly one h1', async () => {
    stubApi();
    renderAt('/blog');
    await screen.findByRole('heading', { level: 1, name: 'Blog' });
    await expectSingleH1();
  });

  it('a blog post page has exactly one h1', async () => {
    stubApi();
    renderAt('/blog/hello-world');
    await screen.findByRole('heading', { level: 1, name: 'Hello World' });
    await expectSingleH1();
  });

  it('the 404 page has exactly one h1', async () => {
    stubApi();
    renderAt('/nope');
    await screen.findByRole('heading', { level: 1, name: 'Page not found' });
    await expectSingleH1();
  });

  it('the empty-home state has exactly one h1', async () => {
    stubApi({
      content: () => jsonResponse({ version: 0, published_at: null, pages: [] }),
    });
    renderAt('/');
    await waitFor(() =>
      expect(screen.queryByText('Loading…')).not.toBeInTheDocument(),
    );
    await expectSingleH1();
  });

  it('a hero with no title plants no empty h1 (renders zero, never a blank one)', async () => {
    // A document whose only section is a hero missing its title must not emit an
    // <h1></h1> — an empty heading is a WCAG failure. SectionShell drops it.
    stubApi({
      content: () =>
        jsonResponse({
          version: 1,
          published_at: '2026-07-24T18:00:00Z',
          pages: [
            {
              id: 'p',
              slug: 'home',
              title: 'Home',
              nav_label: 'Home',
              nav_position: 0,
              sections: [
                { id: 'h', type: 'hero', data: { tagline: '// dev' }, items: [] },
              ],
            },
          ],
        }),
    });
    renderAt('/');
    await waitFor(() =>
      expect(screen.queryByText('Loading…')).not.toBeInTheDocument(),
    );
    // No h1 at all — and critically, no empty heading node in the tree.
    expect(screen.queryAllByRole('heading', { level: 1 })).toHaveLength(0);
  });
});
