import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import SiteNav from './SiteNav';
import type { ContentDocument } from '../types/content';
import { fixtureDocument } from '../test/fixtures';

function jsonResponse(body: unknown, init: { ok?: boolean; status?: number } = {}) {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

function stubContent(doc: unknown, init: { ok?: boolean; status?: number } = {}) {
  const fetchMock = vi.fn().mockResolvedValue(jsonResponse(doc, init));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function renderNav(path = '/') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <SiteNav />
    </MemoryRouter>,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('SiteNav', () => {
  it('lists nav-labelled pages in nav_position order, then a Blog link', async () => {
    stubContent(fixtureDocument);

    renderNav();

    const nav = await screen.findByRole('navigation', { name: /primary/i });
    // "Home" (position 0) and "Projects" (position 1) plus the static Blog link,
    // in that order; the null-nav_label "secret" page is omitted.
    await waitFor(() =>
      expect(within(nav).getByRole('link', { name: 'Projects' })).toBeInTheDocument(),
    );
    const labels = within(nav)
      .getAllByRole('link')
      .map((a) => a.textContent);
    expect(labels).toEqual(['Home', 'Projects', 'Blog']);

    expect(within(nav).getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/');
    expect(within(nav).getByRole('link', { name: 'Projects' })).toHaveAttribute(
      'href',
      '/projects',
    );
    expect(within(nav).getByRole('link', { name: 'Blog' })).toHaveAttribute(
      'href',
      '/blog',
    );
    // A page with a null nav_label is never listed (§3.10).
    expect(within(nav).queryByRole('link', { name: 'Secret' })).not.toBeInTheDocument();
  });

  it('orders strictly by nav_position, not document order', async () => {
    const doc: ContentDocument = {
      version: 1,
      published_at: '2026-08-01T00:00:00Z',
      pages: [
        {
          id: 'b',
          slug: 'later',
          title: 'Later',
          nav_label: 'Later',
          nav_position: 5,
          sections: [],
        },
        {
          id: 'a',
          slug: 'home',
          title: 'Ben Kile',
          nav_label: 'Home',
          nav_position: 0,
          sections: [],
        },
      ],
    };
    stubContent(doc);

    renderNav();

    const nav = await screen.findByRole('navigation', { name: /primary/i });
    await waitFor(() =>
      expect(within(nav).getByRole('link', { name: 'Later' })).toBeInTheDocument(),
    );
    const labels = within(nav)
      .getAllByRole('link')
      .map((a) => a.textContent);
    expect(labels).toEqual(['Home', 'Later', 'Blog']);
  });

  it('still shows the static Blog link when the document fails to load', async () => {
    stubContent({}, { ok: false, status: 500 });
    vi.spyOn(console, 'error').mockImplementation(() => {});

    renderNav();

    const nav = screen.getByRole('navigation', { name: /primary/i });
    // The Blog link is static, so it renders regardless of the document state.
    expect(within(nav).getByRole('link', { name: 'Blog' })).toHaveAttribute(
      'href',
      '/blog',
    );
    // No page links could be derived from the failed load.
    await waitFor(() =>
      expect(within(nav).getAllByRole('link')).toHaveLength(1),
    );
  });
});
