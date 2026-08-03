import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import SiteNav from './SiteNav';
import type { ContentDocument } from '../types/content';
import type { StatusResponse } from '../lib/api';
import { fixtureDocument } from '../test/fixtures';

function jsonResponse(body: unknown, init: { ok?: boolean; status?: number } = {}) {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

const statusOk: StatusResponse = {
  degraded: false,
  services: [{ name: 'API', ok: true }],
};

/** All fetches resolve to the same body — used by the document-failure test. */
function stubContent(doc: unknown, init: { ok?: boolean; status?: number } = {}) {
  const fetchMock = vi.fn().mockResolvedValue(jsonResponse(doc, init));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

/**
 * URL-aware mock: the nav fetches both the document (`/api/content`) and the
 * live status LED (`/api/status`), so tests that assert on one must control both.
 */
function stubApi(opts: { content?: unknown; status?: Response } = {}) {
  const fetchMock = vi.fn((path: string) => {
    if (path.startsWith('/api/status')) {
      return Promise.resolve(opts.status ?? jsonResponse(statusOk));
    }
    return Promise.resolve(jsonResponse(opts.content ?? fixtureDocument));
  });
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

/**
 * The inline "Primary" nav is visually hidden below 900px, and the jsdom test
 * viewport applies the mobile base styles — so it sits outside the accessibility
 * tree. `hidden: true` includes it; accessible-name matching does not work on a
 * hidden element, so it is located by its `aria-label` and its links by role.
 */
function primaryNav(): HTMLElement {
  const nav = screen
    .getAllByRole('navigation', { hidden: true })
    .find((n) => n.getAttribute('aria-label') === 'Primary');
  if (!nav) throw new Error('Primary nav not found');
  return nav;
}

function navLinks(nav: HTMLElement): HTMLElement[] {
  return within(nav).getAllByRole('link', { hidden: true });
}

function navLink(nav: HTMLElement, text: string): HTMLElement {
  const link = navLinks(nav).find((a) => a.textContent === text);
  if (!link) throw new Error(`No nav link "${text}"`);
  return link;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.style.overflow = '';
});

describe('SiteNav', () => {
  it('lists nav-labelled pages in nav_position order, then a Blog link', async () => {
    stubApi();

    renderNav();

    const nav = primaryNav();
    // "Home" (position 0) and "Projects" (position 1) plus the static Blog link,
    // in that order; the null-nav_label "secret" page is omitted.
    await waitFor(() => expect(navLinks(nav)).toHaveLength(3));
    expect(navLinks(nav).map((a) => a.textContent)).toEqual([
      'Home',
      'Projects',
      'Blog',
    ]);

    expect(navLink(nav, 'Home')).toHaveAttribute('href', '/');
    expect(navLink(nav, 'Projects')).toHaveAttribute('href', '/projects');
    expect(navLink(nav, 'Blog')).toHaveAttribute('href', '/blog');
    // A page with a null nav_label is never listed (§3.10).
    expect(navLinks(nav).some((a) => a.textContent === 'Secret')).toBe(false);
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
    stubApi({ content: doc });

    renderNav();

    const nav = primaryNav();
    await waitFor(() => expect(navLinks(nav)).toHaveLength(3));
    expect(navLinks(nav).map((a) => a.textContent)).toEqual([
      'Home',
      'Later',
      'Blog',
    ]);
  });

  it('still shows the static Blog link when the document fails to load', async () => {
    stubContent({}, { ok: false, status: 500 });
    vi.spyOn(console, 'error').mockImplementation(() => {});

    renderNav();

    const nav = primaryNav();
    // No page links could be derived; only the static Blog link remains.
    await waitFor(() => expect(navLinks(nav)).toHaveLength(1));
    expect(navLink(nav, 'Blog')).toHaveAttribute('href', '/blog');
  });

  it('mounts the theme toggle', () => {
    stubApi();

    renderNav();

    expect(
      screen.getByRole('button', { name: /switch to (light|dark) theme/i }),
    ).toBeInTheDocument();
  });

  describe('live status LED (§5)', () => {
    it('renders a status dot from a mocked /api/status', async () => {
      stubApi({
        status: jsonResponse({
          degraded: false,
          services: [{ name: 'API', ok: true }],
        } satisfies StatusResponse),
      });

      renderNav();

      // The dot exposes a text label so colour is never the only carrier (§7).
      expect(
        await screen.findByRole('img', { name: /all systems operational/i }),
      ).toBeInTheDocument();
    });

    it('reads a degraded API as a warn dot', async () => {
      stubApi({
        status: jsonResponse({
          degraded: true,
          services: [{ name: 'API', ok: true }],
        } satisfies StatusResponse),
      });

      renderNav();

      expect(
        await screen.findByRole('img', { name: /degraded/i }),
      ).toBeInTheDocument();
    });

    it('vanishes (no dot) when /api/status fails, without blocking the nav', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      stubApi({ status: jsonResponse({}, { ok: false, status: 503 }) });

      renderNav();

      // The nav still renders its links...
      const nav = primaryNav();
      await waitFor(() =>
        expect(navLinks(nav).length).toBeGreaterThan(1),
      );
      // ...and no status dot is shown.
      expect(screen.queryByRole('img')).not.toBeInTheDocument();
    });
  });

  describe('mobile overlay menu (§3)', () => {
    async function openMenu() {
      stubApi();
      renderNav();
      // Wait for the document so the overlay carries its page links.
      const nav = primaryNav();
      await waitFor(() => expect(navLinks(nav).length).toBeGreaterThan(1));
      fireEvent.click(screen.getByRole('button', { name: /open menu/i }));
      return screen.getByRole('dialog', { name: /navigation menu/i });
    }

    it('opens a focus-trapped dialog from the hamburger and locks body scroll', async () => {
      const dialog = await openMenu();

      expect(dialog).toHaveAttribute('aria-modal', 'true');
      // Body scroll is locked while the overlay is open.
      expect(document.body.style.overflow).toBe('hidden');
      // The overlay's links are the same derivation as the inline nav.
      expect(within(dialog).getByRole('link', { name: 'Projects' })).toHaveAttribute(
        'href',
        '/projects',
      );
      // Focus moved into the overlay (its close button, first in the DOM).
      await waitFor(() =>
        expect(
          within(dialog).getByRole('button', { name: /close menu/i }),
        ).toHaveFocus(),
      );
    });

    it('traps Tab within the overlay', async () => {
      const dialog = await openMenu();
      const close = within(dialog).getByRole('button', { name: /close menu/i });
      const links = within(dialog).getAllByRole('link');
      const last = links[links.length - 1];

      // Tab off the last focusable wraps back to the first (the close button).
      last.focus();
      expect(last).toHaveFocus();
      fireEvent.keyDown(dialog, { key: 'Tab' });
      expect(close).toHaveFocus();

      // Shift+Tab off the first wraps to the last.
      close.focus();
      fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true });
      expect(last).toHaveFocus();
    });

    it('closes on Escape and restores body scroll', async () => {
      const dialog = await openMenu();

      fireEvent.keyDown(dialog, { key: 'Escape' });

      await waitFor(() =>
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
      );
      expect(document.body.style.overflow).toBe('');
    });

    it('closes on a backdrop click', async () => {
      const dialog = await openMenu();

      // A click whose target is the backdrop itself (not the panel) closes it.
      fireEvent.click(dialog);

      await waitFor(() =>
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
      );
    });

    it('closes when a link is followed', async () => {
      const dialog = await openMenu();

      fireEvent.click(within(dialog).getByRole('link', { name: 'Projects' }));

      await waitFor(() =>
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
      );
    });

    it('returns focus to the hamburger after closing', async () => {
      const dialog = await openMenu();

      fireEvent.keyDown(dialog, { key: 'Escape' });

      await waitFor(() =>
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
      );
      expect(screen.getByRole('button', { name: /open menu/i })).toHaveFocus();
    });
  });
});
