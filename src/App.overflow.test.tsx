import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from './App';
import { fixtureDocument, fixturePostSummaries } from './test/fixtures';

/**
 * 320px sweep (task 8/8 §3, DESIGN.md §3): the page body must never scroll
 * horizontally, even on the narrowest phone. jsdom runs no layout engine, so
 * pixel overflow cannot be measured directly — instead this suite enforces the
 * two things that actually cause it, "where feasible":
 *
 *   1. A static scan of every stylesheet: no property-level `width`/`min-width`
 *      pins content wider than the 320px floor (media-query *features* are
 *      excluded — a `@media (min-width: 640px)` breakpoint is not a width), and
 *      the body keeps its `overflow-x: hidden` guard.
 *   2. Key pages render inside a 320px viewport without any element carrying an
 *      inline pixel width past the floor (dynamic widths — meter fill, progress
 *      — are percentages and stay in-bounds).
 */

const SRC = resolve(process.cwd(), 'src');
const FLOOR = 320;

function allCssFiles(): string[] {
  return readdirSync(SRC, { recursive: true, encoding: 'utf8' })
    .filter((p) => p.endsWith('.css'))
    .map((p) => resolve(SRC, p));
}

/** Strip `@media (...)` preludes so their width *features* aren't mistaken for
 * width *properties*; the declarations inside each block are preserved. */
function stripMediaFeatures(css: string): string {
  return css.replace(/@media[^{]*\{/g, '{');
}

describe('320px overflow guard — static CSS scan (DESIGN.md §3)', () => {
  const files = allCssFiles();

  it('finds the stylesheets to scan', () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it('no width / min-width property pins content wider than 320px', () => {
    const offenders: string[] = [];
    // `width:` not preceded by a letter/hyphen (excludes max-/min-width); and
    // `min-width:` as a property. max-width is a cap, never an overflow source.
    const widthRe = /(?<![a-z-])width:\s*(\d+)px/g;
    const minWidthRe = /(?<![a-z-])min-width:\s*(\d+)px/g;

    for (const file of files) {
      const css = stripMediaFeatures(readFileSync(file, 'utf8'));
      for (const re of [widthRe, minWidthRe]) {
        re.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = re.exec(css)) !== null) {
          const px = Number(m[1]);
          if (px > FLOOR) {
            offenders.push(`${file.replace(SRC, 'src')}: "${m[0]}" (${px}px)`);
          }
        }
      }
    }

    expect(offenders, offenders.join('\n')).toEqual([]);
  });

  it('the body keeps its horizontal-scroll guard', () => {
    const global = readFileSync(resolve(SRC, 'styles/global.css'), 'utf8');
    // The body rule sets overflow-x: hidden (DESIGN.md §3).
    expect(global).toMatch(/overflow-x:\s*hidden/);
  });
});

// ---- Rendered 320px sweep --------------------------------------------------

function jsonResponse(body: unknown, init: { ok?: boolean; status?: number } = {}) {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

function stubApi() {
  const fetchMock = vi.fn((path: string) => {
    if (path.startsWith('/api/status')) {
      return Promise.resolve(
        jsonResponse({
          degraded: false,
          services: [{ name: 'API', ok: true, response_time_ms: 20 }],
        }),
      );
    }
    if (path.startsWith('/api/now-playing')) {
      return Promise.resolve(
        jsonResponse({
          playing: true,
          track: {
            title: 'A Track With A Fairly Long Title That Could Overflow',
            artists: ['An Artist With A Long Name'],
            album: 'Album',
            art_url: 'https://media.benkile.com/art.jpg',
            url: 'https://open.spotify.com/track/xyz',
          },
        }),
      );
    }
    if (path.startsWith('/api/duolingo')) {
      // A large streak — the strip must not overflow on a wide value.
      return Promise.resolve(
        jsonResponse({
          available: true,
          streak: 1234,
          course: { title: 'Spanish', xp: 99999, crowns: 200 },
        }),
      );
    }
    if (path.startsWith('/api/posts')) {
      return Promise.resolve(
        jsonResponse({ posts: fixturePostSummaries, next_cursor: null }),
      );
    }
    return Promise.resolve(jsonResponse(fixtureDocument));
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function renderAt320(path: string) {
  const original = window.innerWidth;
  Object.defineProperty(window, 'innerWidth', {
    value: FLOOR,
    configurable: true,
    writable: true,
  });
  const container = document.createElement('div');
  container.style.width = `${FLOOR}px`;
  document.body.appendChild(container);
  const utils = render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
    { container },
  );
  return {
    ...utils,
    restore: () =>
      Object.defineProperty(window, 'innerWidth', {
        value: original,
        configurable: true,
        writable: true,
      }),
  };
}

/** Every element's inline pixel width/min-width must stay within the floor. */
function assertNoInlineOverflow(root: HTMLElement) {
  const px = (v: string) => (v.endsWith('px') ? Number.parseFloat(v) : NaN);
  for (const el of Array.from(root.querySelectorAll<HTMLElement>('*'))) {
    const w = px(el.style.width);
    const mw = px(el.style.minWidth);
    if (!Number.isNaN(w)) expect(w).toBeLessThanOrEqual(FLOOR);
    if (!Number.isNaN(mw)) expect(mw).toBeLessThanOrEqual(FLOOR);
  }
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('320px overflow guard — key pages render in-bounds (DESIGN.md §3)', () => {
  it('the home page (all sections) plants no inline width past 320px', async () => {
    stubApi();
    const { restore } = renderAt320('/');
    await screen.findByRole('heading', { level: 1, name: 'Ben Kile' });
    await waitFor(() => expect(screen.getByText('A Track With A Fairly Long Title That Could Overflow')).toBeInTheDocument());
    assertNoInlineOverflow(document.body);
    restore();
  });

  it('the blog index plants no inline width past 320px', async () => {
    stubApi();
    const { restore } = renderAt320('/blog');
    await screen.findByRole('heading', { level: 1, name: 'Blog' });
    assertNoInlineOverflow(document.body);
    restore();
  });

  it('the 404 page plants no inline width past 320px', async () => {
    stubApi();
    const { restore } = renderAt320('/nope');
    await screen.findByRole('heading', { name: 'Page not found' });
    assertNoInlineOverflow(document.body);
    restore();
  });
});
