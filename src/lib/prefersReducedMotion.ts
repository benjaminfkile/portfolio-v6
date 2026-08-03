import { useEffect, useState } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

/**
 * A one-shot read of the user's reduced-motion preference (DESIGN.md §6). Safe
 * to call during render and in non-browser/jsdom environments: when
 * `window.matchMedia` is unavailable it reports `false` (motion allowed), which
 * is the correct default for the reveal/animation primitives that consume it.
 */
export function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia(QUERY).matches
  );
}

/**
 * Subscribe to the reduced-motion preference and re-render when it changes. Used
 * by primitives whose behaviour is decided in JS rather than CSS — chiefly
 * MediaFrame, which must choose autoplay vs. poster-and-play at runtime
 * (DESIGN.md §6). Purely CSS-driven motion (StatusDot, Ticker) does not need
 * this — it uses the `@media (prefers-reduced-motion)` query directly.
 */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(prefersReducedMotion);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }
    const mq = window.matchMedia(QUERY);
    const onChange = () => setReduced(mq.matches);
    onChange();
    // Older Safari only exposes the deprecated addListener/removeListener API.
    if (typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', onChange);
      return () => mq.removeEventListener('change', onChange);
    }
    mq.addListener(onChange);
    return () => mq.removeListener(onChange);
  }, []);

  return reduced;
}
