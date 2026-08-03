import { vi } from 'vitest';

/**
 * Test doubles for the two browser APIs the motion primitives depend on —
 * IntersectionObserver (reveal-on-view) and matchMedia (reduced-motion). jsdom
 * ships neither, so the reveal/motion tests install these explicitly. Shared so
 * every motion test mocks them identically (task DONE: mock IO + matchMedia).
 */

/** A controllable IntersectionObserver: `triggerAll()` fires an intersection. */
export class MockIntersectionObserver {
  static instances: MockIntersectionObserver[] = [];

  callback: IntersectionObserverCallback;
  options?: IntersectionObserverInit;
  elements = new Set<Element>();
  disconnect = vi.fn(() => this.elements.clear());
  unobserve = vi.fn((el: Element) => this.elements.delete(el));

  constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
    this.callback = callback;
    this.options = options;
    MockIntersectionObserver.instances.push(this);
  }

  observe = vi.fn((el: Element) => {
    this.elements.add(el);
  });

  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }

  /** Fire an intersection event for every observed element. */
  triggerAll(isIntersecting = true): void {
    const entries = [...this.elements].map(
      (target) =>
        ({ target, isIntersecting, intersectionRatio: isIntersecting ? 1 : 0 } as
          IntersectionObserverEntry),
    );
    this.callback(entries, this as unknown as IntersectionObserver);
  }

  static get last(): MockIntersectionObserver | undefined {
    return this.instances[this.instances.length - 1];
  }

  static reset(): void {
    this.instances = [];
  }
}

/** Install the IntersectionObserver mock; returns a restore fn. */
export function installIntersectionObserver(): () => void {
  MockIntersectionObserver.reset();
  const original = (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver;
  (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver =
    MockIntersectionObserver as unknown as typeof IntersectionObserver;
  return () => {
    (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = original;
    MockIntersectionObserver.reset();
  };
}

/** Remove IntersectionObserver entirely (the "unsupported browser" path). */
export function removeIntersectionObserver(): () => void {
  const original = (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver;
  delete (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver;
  return () => {
    (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = original;
  };
}

/**
 * Stub `window.matchMedia` so `(prefers-reduced-motion: reduce)` reports
 * `reduce`. Returns a restore fn. Call with `false` for the motion-allowed path.
 */
export function mockReducedMotion(reduce: boolean): () => void {
  const original = window.matchMedia;
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query.includes('prefers-reduced-motion') ? reduce : false,
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
