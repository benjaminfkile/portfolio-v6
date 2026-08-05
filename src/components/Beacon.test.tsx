import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { fireEvent } from '@testing-library/dom';
import { BrowserRouter, useNavigate } from 'react-router-dom';
import Beacon from './Beacon';

/**
 * Beacon component tests (spec §4.8). Uses a real `BrowserRouter` so `useLocation`
 * and `window.location.pathname` stay in sync — the beacon reads the latter — and
 * a `navigator.sendBeacon` spy to observe what was sent. Covers pageview on route
 * change, scroll_depth once-per-page (re-armed on nav, skipped on short pages),
 * external-anchor link_out, and blanket DNT suppression.
 */

let sendBeacon: ReturnType<typeof vi.fn>;

function setNav(prop: string, value: unknown): void {
  Object.defineProperty(navigator, prop, { value, configurable: true });
}

/** Stub the scroll geometry jsdom does not lay out. */
function setGeometry(scrollHeight: number, scrollY: number, innerHeight = 800): void {
  Object.defineProperty(document.documentElement, 'scrollHeight', {
    value: scrollHeight,
    configurable: true,
  });
  Object.defineProperty(window, 'innerHeight', {
    value: innerHeight,
    configurable: true,
  });
  Object.defineProperty(window, 'scrollY', { value: scrollY, configurable: true });
}

/** Read a Blob's text via FileReader — jsdom's Blob has no `.text()`. */
function readBlob(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}

/** Parse every event body handed to sendBeacon so far. */
async function sentEvents(): Promise<Array<Record<string, unknown>>> {
  return Promise.all(
    sendBeacon.mock.calls.map(async ([, blob]) =>
      JSON.parse(await readBlob(blob as Blob)),
    ),
  );
}

/** A navigate button so tests can drive route changes through the router. */
function Nav() {
  const navigate = useNavigate();
  return (
    <button type="button" onClick={() => navigate('/blog')}>
      go
    </button>
  );
}

function mount() {
  return render(
    <BrowserRouter>
      <Beacon />
      <Nav />
      {/* preventDefault only stops jsdom's unimplemented navigation; the
          capture-phase link_out listener has already run by then. */}
      <a
        href="https://github.com/ben/repo/tree/main"
        onClick={(e) => e.preventDefault()}
      >
        external
      </a>
      <a href="/about" onClick={(e) => e.preventDefault()}>
        internal
      </a>
      <a href="mailto:me@example.com" onClick={(e) => e.preventDefault()}>
        mail
      </a>
    </BrowserRouter>,
  );
}

beforeEach(() => {
  window.history.pushState({}, '', '/');
  sendBeacon = vi.fn().mockReturnValue(true);
  setNav('sendBeacon', sendBeacon);
  setNav('doNotTrack', null);
  setNav('globalPrivacyControl', undefined);
  setGeometry(4000, 0); // tall page, unscrolled, by default
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Beacon', () => {
  it('fires a pageview with the current path on mount and on route change', async () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'go' }));

    const pageviews = (await sentEvents()).filter((e) => e.event === 'pageview');
    expect(pageviews.map((e) => e.path)).toEqual(['/', '/blog']);
  });

  it('fires scroll_depth once past 75% and not before', async () => {
    mount();

    // 40% down — nothing yet.
    setGeometry(4000, 800);
    fireEvent.scroll(window);
    expect((await sentEvents()).some((e) => e.event === 'scroll_depth')).toBe(false);

    // 80% down — fires exactly once even across repeated scrolls.
    setGeometry(4000, 2400);
    fireEvent.scroll(window);
    fireEvent.scroll(window);
    const depths = (await sentEvents()).filter((e) => e.event === 'scroll_depth');
    expect(depths).toHaveLength(1);
    expect(depths[0].path).toBe('/');
  });

  it('re-arms scroll_depth on navigation', async () => {
    mount();

    setGeometry(4000, 3600);
    fireEvent.scroll(window);

    fireEvent.click(screen.getByRole('button', { name: 'go' }));
    setGeometry(4000, 3600);
    fireEvent.scroll(window);

    const depths = (await sentEvents()).filter((e) => e.event === 'scroll_depth');
    expect(depths.map((e) => e.path)).toEqual(['/', '/blog']);
  });

  it('skips scroll_depth when the page is shorter than the viewport', async () => {
    mount();
    setGeometry(500, 0, 800); // whole doc fits — nothing to scroll
    fireEvent.scroll(window);
    fireEvent.scroll(window);
    expect((await sentEvents()).some((e) => e.event === 'scroll_depth')).toBe(false);
  });

  it('fires link_out for an external anchor, origin-stripped', async () => {
    mount();
    fireEvent.click(screen.getByText('external'));

    const outs = (await sentEvents()).filter((e) => e.event === 'link_out');
    expect(outs).toHaveLength(1);
    expect(outs[0].meta).toEqual({ href: 'github.com/ben/repo/tree/main' });
  });

  it('does not fire link_out for internal or non-http anchors', async () => {
    mount();
    fireEvent.click(screen.getByText('internal'));
    fireEvent.click(screen.getByText('mail'));
    expect((await sentEvents()).some((e) => e.event === 'link_out')).toBe(false);
  });

  it('suppresses every event under Do Not Track', async () => {
    setNav('doNotTrack', '1');
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'go' }));
    setGeometry(4000, 3600);
    fireEvent.scroll(window);
    fireEvent.click(screen.getByText('external'));

    expect(sendBeacon).not.toHaveBeenCalled();
  });
});
