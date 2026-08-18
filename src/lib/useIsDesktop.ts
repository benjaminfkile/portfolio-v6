import { useEffect, useState } from 'react';

/**
 * The site's shared desktop breakpoint (900px), the same threshold every
 * `@media (min-width: 900px)` block across the site uses (SiteNav, SiteFooter,
 * the Skills Console, etc.). Exported so the one consumer that needs to gate
 * JS behavior at the same cut-off can share the string rather than re-typing
 * it.
 */
export const DESKTOP_QUERY = '(min-width: 900px)';

function readMatch(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    // No matchMedia (SSR, older test env) — assume the ≥900px primary layout
    // so mobile-specific behavior only kicks in when the runtime can actually
    // confirm the viewport is narrower.
    return true;
  }
  return window.matchMedia(DESKTOP_QUERY).matches;
}

/**
 * useIsDesktop — true when the viewport matches the site's shared 900px
 * desktop breakpoint. Lets a component gate desktop-only behavior in JS the
 * same way CSS already gates layout, without inventing a new threshold. A
 * media-query listener keeps the value live on resize.
 */
export function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState<boolean>(readMatch);
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }
    const mql = window.matchMedia(DESKTOP_QUERY);
    const onChange = () => setIsDesktop(mql.matches);
    // addEventListener is the modern API; addListener is Safari <14. Support
    // both so live-restyle keeps working on old iOS Safari.
    if (typeof mql.addEventListener === 'function') {
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    }
    mql.addListener(onChange);
    return () => mql.removeListener(onChange);
  }, []);
  return isDesktop;
}
