import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { prefersReducedMotion } from './prefersReducedMotion';

/**
 * useRevealOnce — fire exactly once when the observed element first scrolls into
 * view, driving the "reveal on first view" motion in DESIGN.md §6 (the Meter
 * fill, and anything else that should animate in once).
 *
 * It returns a ref to attach to the element and a boolean that flips to `true`
 * the first time the element intersects the viewport, then never changes again
 * (the observer disconnects on first hit).
 *
 * Two cases short-circuit to `true` immediately, so consumers render in their
 * final/settled state with no animation:
 *   - `prefers-reduced-motion: reduce` (DESIGN.md §6 — meters render filled), and
 *   - environments without IntersectionObserver (older browsers, jsdom) where
 *     there is no way to detect the reveal, so we must not hide content.
 *
 * @typeParam T - element type the returned ref attaches to (default HTMLDivElement).
 */
export function useRevealOnce<T extends Element = HTMLDivElement>(
  options?: IntersectionObserverInit,
): [RefObject<T>, boolean] {
  const ref = useRef<T>(null);
  // Decided once, at mount: if motion is off or there is no observer, the
  // element is considered revealed from the first paint.
  const immediateRef = useRef(
    prefersReducedMotion() || typeof IntersectionObserver === 'undefined',
  );
  const [revealed, setRevealed] = useState(immediateRef.current);

  useEffect(() => {
    if (revealed) return;
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setRevealed(true);
        observer.disconnect();
      }
    }, options);
    observer.observe(el);

    return () => observer.disconnect();
    // `options` is intentionally omitted: it is read once when the observer is
    // created, and callers pass an inline literal that would otherwise re-run
    // this effect every render. The observer is torn down on first reveal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealed]);

  return [ref, revealed];
}
