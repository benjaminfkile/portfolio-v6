import { vi } from 'vitest';

/**
 * Stub `window.matchMedia` so the site's shared 900px desktop breakpoint —
 * `(min-width: 900px)` — reports `matches` as requested. Returns a restore fn.
 * jsdom ships no matchMedia at all, so tests that touch {@link useIsDesktop}
 * install this to pin desktop or mobile behaviour deterministically.
 *
 * Non-desktop queries (e.g. `(prefers-reduced-motion)`) fall through to
 * `matches: false` — the same shape {@link mockReducedMotion} installs. Tests
 * that need BOTH stubs at once should use whichever installs last: since both
 * replace `window.matchMedia` wholesale, they don't stack.
 */
export function mockViewport(isDesktop: boolean): () => void {
  const original = window.matchMedia;
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query.includes('min-width: 900px') ? isDesktop : false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as typeof window.matchMedia;
  return () => {
    window.matchMedia = original;
  };
}
